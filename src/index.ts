import { Buffer } from "node:buffer";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

import puppeteer, { type Browser, type Page } from "puppeteer";
import pLimit from "p-limit";
import { PDFDocument } from "pdf-lib";
import chromeFinder from "chrome-finder";

function showHelp() {
    console.log(`
Usage: site2pdf-cli <main_url> [url_pattern]

Arguments:
  main_url         The main URL to generate PDF from
  url_pattern      (Optional) Regular expression pattern to match sub-links (default: ^main_url)
`);
}

type BrowserContext = {
    browser: Browser,
    page: Page,
};

async function useBrowserContext() {
    const browser = await puppeteer.launch({
        executablePath: chromeFinder(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 60000
    });
    const page = (await browser.pages())[0];
    return {
        browser,
        page
    };
}

export function normalizeURL(url: string): string {
    const urlWithoutAnchor = url.split("#")[0];
    return urlWithoutAnchor.endsWith("/")
        ? urlWithoutAnchor.slice(0, -1)
        : urlWithoutAnchor;
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function crawlLinks(
    page: Page,
    url: string,
    urlPattern: RegExp,
    visited: Set<string>,
    concurrentLimit: number
): Promise<string[]> {
    const limit = pLimit(concurrentLimit);
    const normalizedUrl = normalizeURL(url);

    if (visited.has(normalizedUrl)) {
        return [];
    }
    visited.add(normalizedUrl);

    console.log(`Crawling: ${url}`);
    try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        // Wait for main content
        await page.waitForSelector('div.main', { timeout: 15000 });
        // Scroll and wait for dynamic content
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await delay(5000); // Increased delay

        const subLinks = await page.evaluate((patternString) => {
            const pattern = new RegExp(patternString);
            // Target all relevant links in main content
            const links = Array.from(
                document.querySelectorAll('.main a[href^="/documentation/virtualization"]')
            ) as HTMLAnchorElement[];
            const allLinks = links.map((link) => link.href);
            console.log(`Raw links found: ${allLinks.length}`);
            return allLinks.filter((href) => pattern.test(href));
        }, urlPattern.source);

        const normalizedSubLinks = [...new Set(subLinks.map((link) => normalizeURL(link)))];
        console.log(`Found links from ${url}:`, normalizedSubLinks);

        const subLinkPromises = normalizedSubLinks.map((link) =>
            limit(() => crawlLinks(page, link, urlPattern, visited, concurrentLimit))
        );
        const nestedLinks = (await Promise.all(subLinkPromises)).flat();

        return [normalizedUrl, ...nestedLinks];
    } catch (error) {
        console.warn(`Warning: Failed to crawl ${url}: ${error}`);
        return [];
    }
}

export async function generatePDF(
    ctx: BrowserContext,
    url: string,
    urlPattern: RegExp = new RegExp(`^${url}`),
    concurrentLimit: number,
): Promise<Buffer> {
    const limit = pLimit(concurrentLimit);
    const visited = new Set<string>();
    
    const allLinks = await crawlLinks(ctx.page, url, urlPattern, visited, concurrentLimit);
    console.log(`Total unique links to process:`, allLinks);

    const pdfDoc = await PDFDocument.create();

    const generatePDFForPage = async (link: string) => {
        console.log(`Generating PDF for ${link}`);
        const newPage = await ctx.browser.newPage();
        let pdfBytes;
        try {
            await newPage.goto(link, { waitUntil: 'networkidle0', timeout: 60000 });
            pdfBytes = await newPage.pdf({ format: "A4" });
            console.log(`Generated PDF for ${link}`);
            return Buffer.from(pdfBytes);
        } catch (error) {
            console.warn(`Warning: Error occurred while processing ${link}: ${error}`);
            return null;
        } finally {
            await newPage.close();
        }
    };

    const pdfPromises = allLinks.map((link) =>
        limit(() => generatePDFForPage(link))
    );
    const pdfBytesArray = (await Promise.all(pdfPromises)).filter(
        (buffer): buffer is Buffer => buffer !== null
    );

    for (const pdfBytes of pdfBytesArray) {
        const subPdfDoc = await PDFDocument.load(pdfBytes);
        const copiedPages = await pdfDoc.copyPages(
            subPdfDoc,
            subPdfDoc.getPageIndices(),
        );
        for (const page of copiedPages) {
            pdfDoc.addPage(page);
        }
    }

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    return pdfBuffer;
}

export function generateSlug(url: string): string {
    return url
        .replace(/https?:\/\//, "")
        .replace(/[^\w\s-]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/\./g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
}

export async function main() {
    const mainURL = process.argv[2];
    const urlPattern = process.argv[3]
        ? new RegExp(process.argv[3])
        : new RegExp(`^${mainURL}`);

    if (!mainURL) {
        showHelp();
        throw new Error("<main_url> is required");
    }

    console.log(
        `Generating PDF for ${mainURL} and sub-links matching ${urlPattern}`,
    );
    let ctx;
    try {
        ctx = await useBrowserContext();
        const pdfBuffer = await generatePDF(ctx, mainURL, urlPattern, cpus().length);
        const slug = generateSlug(mainURL);
        const outputDir = join(process.cwd(), "out");
        const outputPath = join(outputDir, `${slug}.pdf`);

        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        writeFileSync(outputPath, new Uint8Array(pdfBuffer));
        console.log(`PDF saved to ${outputPath}`);
    } catch (error) {
        console.error("Error generating PDF:", error);
    } finally {
        await ctx?.browser.close();
    }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
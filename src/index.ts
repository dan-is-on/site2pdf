import { Buffer } from "node:buffer";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

import puppeteer, { type Browser, type Page, type HTTPResponse } from "puppeteer";
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

function logWithTimestamp(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    return {
        browser,
        page
    };
}

export function normalizeURL(url: string): string {
    try {
        const parsedUrl = new URL(url);
        // Remove trailing slash from pathname, preserve query and no hash
        parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
        parsedUrl.hash = '';
        const normalized = parsedUrl.toString();
        logWithTimestamp(`Normalized URL: ${url} -> ${normalized}`);
        return normalized;
    } catch (error) {
        // Fallback for relative URLs or malformed input
        const cleanUrl = url.split('#')[0].replace(/\/+$/, '');
        logWithTimestamp(`Normalized fallback URL: ${url} -> ${cleanUrl}`);
        return cleanUrl;
    }
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
        logWithTimestamp(`Skipping already visited URL: ${normalizedUrl}`);
        return [];
    }
    visited.add(normalizedUrl);

    logWithTimestamp(`Crawling: ${url}`);
    try {
        let pageLoaded = false;
        let errorDetails: string | null = null;
        let response: HTTPResponse | null = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
                pageLoaded = true;
                break;
            } catch (error) {
                errorDetails = error instanceof Error ? error.message : String(error);
                logWithTimestamp(`Attempt ${attempt}/5: Failed to load ${url}, retrying... (${errorDetails})`);
                await delay(1000 * Math.pow(2, attempt - 1)); // Exponential backoff: 1s, 2s, 4s, 8s, 16s
            }
        }

        if (!pageLoaded) {
            const status = response ? response.status() : 'No response';
            const headers = response ? JSON.stringify(response.headers()) : 'No headers';
            throw new Error(`Failed to load ${url} after retries: ${errorDetails || 'Unknown error'} (Status: ${status}, Headers: ${headers})`);
        }

        // Retry waiting for content selector
        let selectorFound = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                await page.waitForSelector('div.router-content div.content', { timeout: 5000 });
                selectorFound = true;
                break;
            } catch (error) {
                logWithTimestamp(`Attempt ${attempt}/5: Waiting for div.router-content div.content failed, retrying...`);
                await delay(5000);
            }
        }

        if (!selectorFound) {
            // Log DOM structure for debugging
            const domStructure = await page.evaluate(() => {
                const classes = Array.from(document.querySelectorAll('div')).map(div => div.className).filter(cls => cls);
                const bodyLinks = Array.from(document.querySelectorAll('body a[href^="/documentation/virtualization"]')).map(a => a.getAttribute('href'));
                return `Main div classes: ${JSON.stringify(classes, null, 2)}\nBody links found: ${bodyLinks.length} ${JSON.stringify(bodyLinks.slice(0, 5))}`;
            });
            logWithTimestamp(`Failed to find div.router-content div.content after retries. ${domStructure}`);
            // Fallback to body
            await page.waitForSelector('body', { timeout: 10000 });
        }

        // Scroll and wait for dynamic content
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await delay(15000); // Increased delay to 15s

        const subLinks = await page.evaluate((patternString) => {
            const pattern = new RegExp(patternString);
            // Target links in content, with fallback
            const links = Array.from(
                document.querySelectorAll('div.router-content div.content .link-block.topic a, div.router-content div.content a.inline-link, body a[href^="/documentation/virtualization"]')
            ) as HTMLAnchorElement[];
            const allLinks = links.map((link) => link.href);
            console.log(`[${new Date().toISOString()}] Raw links found: ${allLinks.length}`, allLinks);
            return allLinks.filter((href) => pattern.test(href));
        }, urlPattern.source);

        const normalizedSubLinks = [...new Set(subLinks.map((link) => normalizeURL(link)))];
        logWithTimestamp(`Found links from ${url}: ${JSON.stringify(normalizedSubLinks)}`);

        await delay(2000); // 2s delay between page requests
        const subLinkPromises = normalizedSubLinks.map((link) =>
            limit(() => crawlLinks(page, link, urlPattern, visited, concurrentLimit))
        );
        const nestedLinks = (await Promise.all(subLinkPromises)).flat();

        return [normalizedUrl, ...nestedLinks];
    } catch (error) {
        logWithTimestamp(`Warning: Failed to crawl ${url}: ${error}`);
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
    const uniqueLinks = [...new Set(allLinks.map(normalizeURL))]; // Deduplicate final links
    logWithTimestamp(`Total unique links to process: ${JSON.stringify(uniqueLinks)}`);

    const pdfDoc = await PDFDocument.create();

    const generatePDFForPage = async (link: string) => {
        logWithTimestamp(`Generating PDF for ${link}`);
        const newPage = await ctx.browser.newPage();
        await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        let pdfBytes;
        try {
            let pageLoaded = false;
            let errorDetails: string | null = null;
            let response: HTTPResponse | null = null;
            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    response = await newPage.goto(link, { waitUntil: 'networkidle0', timeout: 30000 });
                    pageLoaded = true;
                    break;
                } catch (error) {
                    errorDetails = error instanceof Error ? error.message : String(error);
                    logWithTimestamp(`Attempt ${attempt}/5: Failed to load ${link} for PDF, retrying... (${errorDetails})`);
                    await delay(1000 * Math.pow(2, attempt - 1)); // Exponential backoff
                }
            }

            if (!pageLoaded) {
                const status = response ? response.status() : 'No response';
                const headers = response ? JSON.stringify(response.headers()) : 'No headers';
                throw new Error(`Failed to load ${link} for PDF after retries: ${errorDetails || 'Unknown error'} (Status: ${status}, Headers: ${headers})`);
            }

            pdfBytes = await newPage.pdf({ format: "A4" });
            logWithTimestamp(`Generated PDF for ${link}`);
            return Buffer.from(pdfBytes);
        } catch (error) {
            logWithTimestamp(`Warning: Error occurred while processing ${link}: ${error}`);
            return null;
        } finally {
            await newPage.close();
            await delay(2000); // 2s delay between page requests
        }
    };

    const pdfPromises = uniqueLinks.map((link) =>
        limit(() => generatePDFForPage(link))
    );
    const pdfBytesArray = (await Promise.all(pdfPromises)).filter(
        (buffer) => buffer !== null
    ) as Buffer[];

    for (const pdfBytes of pdfBytesArray) {
        if (pdfBytes) {
            const subPdfDoc = await PDFDocument.load(pdfBytes);
            const copiedPages = await pdfDoc.copyPages(
                subPdfDoc,
                subPdfDoc.getPageIndices(),
            );
            for (const page of copiedPages) {
                pdfDoc.addPage(page);
            }
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

    logWithTimestamp(
        `Generating PDF for ${mainURL} and sub-links matching ${urlPattern}`,
    );
    let ctx;
    try {
        ctx = await useBrowserContext();
        const pdfBuffer = await generatePDF(ctx, mainURL, urlPattern, 1); // Single concurrency
        const slug = generateSlug(mainURL);
        const outputDir = join(process.cwd(), "out");
        const outputPath = join(outputDir, `${slug}.pdf`);

        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        writeFileSync(outputPath, new Uint8Array(pdfBuffer));
        logWithTimestamp(`PDF saved to ${outputPath}`);
    } catch (error) {
        logWithTimestamp(`Error generating PDF: ${error}`);
    } finally {
        await ctx?.browser.close();
    }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
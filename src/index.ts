import { Buffer } from "node:buffer";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";

import puppeteer, { type Browser, type Page, type HTTPResponse } from "puppeteer";
import pLimit from "p-limit";
import { PDFDocument } from "pdf-lib";
import chromeFinder from "chrome-finder";
import { normalizeURL, buildSectionTree, SectionNode } from "./list-sections.js";

function showHelp() {
    console.log(`
Usage: site2pdf-cli <main_url> [url_pattern] [--content-div <selector>] [--nav-div <selector>] [--split-sections]

Arguments:
  main_url         The main URL to generate PDF from
  url_pattern      (Optional) Regular expression pattern to match sub-links (default: ^main_url)
  --content-div    (Optional) CSS selector for main content (default: div.router-content div.content)
  --nav-div        (Optional) CSS selector for navigation (default: .card-body .vue-recycle-scroller__item-view a.leaf-link)
  --split-sections (Optional) Generate separate PDFs for each section
`);
}

function logWithTimestamp(message: string): void {
    console.log(`[${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour12: false })}] ${message}`);
}

// Escape special regex characters
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function crawlLinks(
    page: Page,
    url: string,
    urlPattern: RegExp,
    visited: Set<string>,
    concurrentLimit: number,
    contentDiv: string,
    navDiv: string
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
                await delay(1000 * Math.pow(2, attempt));
            }
        }

        if (!pageLoaded) {
            const status = response ? response.status() : 'No response';
            const headers = response ? JSON.stringify(response.headers()) : 'No headers';
            throw new Error(`Failed to load ${url} after retries: ${errorDetails || 'Unknown error'} (Status: ${status}, Headers: ${headers})`);
        }

        let selectorFound = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                await page.waitForSelector(contentDiv, { timeout: 5000 });
                selectorFound = true;
                break;
            } catch (error) {
                logWithTimestamp(`Attempt ${attempt}/5: Waiting for ${contentDiv} failed, retrying...`);
                await delay(5000);
            }
        }

        if (!selectorFound) {
            logWithTimestamp(`Trying navigation selector: ${navDiv}`);
            try {
                await page.waitForSelector(navDiv, { timeout: 5000 });
                selectorFound = true;
            } catch (error) {
                const domStructure = await page.evaluate((patternString) => {
                    const pattern = new RegExp(patternString);
                    const classes = Array.from(document.querySelectorAll('div')).map(div => div.className).filter(cls => cls);
                    const bodyLinks = Array.from(document.querySelectorAll('body a')).map(a => a.getAttribute('href')).filter(href => href && pattern.test(href));
                    return `Main div classes: ${JSON.stringify(classes, null, 2)}\nBody links found: ${bodyLinks.length} ${JSON.stringify(bodyLinks.slice(0, 5))}`;
                }, urlPattern.source);
                logWithTimestamp(`Failed to find ${contentDiv} or ${navDiv} after retries. ${domStructure}`);
                await page.waitForSelector('body', { timeout: 10000 });
            }
        }

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await delay(15000);

        const subLinks = await page.evaluate((patternString, contentSelector, navSelector) => {
            const pattern = new RegExp(patternString);
            let links: HTMLAnchorElement[] = [];
            const contentLinks = document.querySelectorAll(`${contentSelector} .link-block.topic a, ${contentSelector} a.inline-link`) as NodeListOf<HTMLAnchorElement>;
            if (contentLinks.length > 0) {
                links = Array.from(contentLinks);
            } else {
                const navLinks = document.querySelectorAll(navSelector) as NodeListOf<HTMLAnchorElement>;
                if (navLinks.length > 0) {
                    links = Array.from(navLinks);
                } else {
                    links = Array.from(document.querySelectorAll('body a')).filter(a => {
                        const href = a.getAttribute('href');
                        return href && pattern.test(href);
                    }) as HTMLAnchorElement[];
                }
            }
            const allLinks = links.map((link) => link.href);
            console.log(`[${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour12: false })}] Raw links found: ${allLinks.length}`, allLinks);
            return allLinks.filter((href) => pattern.test(href));
        }, urlPattern.source, contentDiv, navDiv);

        const normalizedSubLinks = [...new Set(subLinks.map((link) => normalizeURL(link)))];
        logWithTimestamp(`Found links from ${url}: ${JSON.stringify(normalizedSubLinks)}`);

        await delay(2000);
        const subLinkPromises = normalizedSubLinks.map((link) =>
            limit(() => crawlLinks(page, link, urlPattern, visited, concurrentLimit, contentDiv, navDiv))
        );
        const nestedLinks = (await Promise.all(subLinkPromises)).flat();

        return [normalizedUrl, ...nestedLinks];
    } catch (error) {
        logWithTimestamp(`Warning: Failed to crawl ${url}: ${error}`);
        return [];
    }
}

async function generateSinglePDF(
    ctx: BrowserContext,
    url: string,
    contentDiv: string = 'div.router-content div.content'
): Promise<Buffer> {
    logWithTimestamp(`Generating PDF for ${url}`);
    const newPage = await ctx.browser.newPage();
    await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    let pdfBytes;
    try {
        let pageLoaded = false;
        let errorDetails: string | null = null;
        let response: HTTPResponse | null = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                response = await newPage.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
                pageLoaded = true;
                break;
            } catch (error) {
                errorDetails = error instanceof Error ? error.message : String(error);
                logWithTimestamp(`Attempt ${attempt}/5: Failed to load ${url} for PDF, retrying... (${errorDetails})`);
                await delay(1000 * Math.pow(2, attempt));
            }
        }

        if (!pageLoaded) {
            const status = response ? response.status() : 'No response';
            const headers = response ? JSON.stringify(response.headers()) : 'No headers';
            throw new Error(`Failed to load ${url} for PDF after retries: ${errorDetails || 'Unknown error'} (Status: ${status}, Headers: ${headers})`);
        }

        await newPage.waitForSelector(contentDiv, { timeout: 5000 });
        await newPage.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await delay(15000);

        pdfBytes = await newPage.pdf({ 
            format: "A4",
            printBackground: true
        });
        logWithTimestamp(`Generated PDF for ${url} with ${pdfBytes.length} bytes`);
        return Buffer.from(pdfBytes);
    } catch (error) {
        logWithTimestamp(`Error generating PDF for ${url}: ${error}`);
        return Buffer.from([]);
    } finally {
        await newPage.close();
        await delay(2000);
    }
}

function splitSectionTrees(node: SectionNode, sections: SectionNode[] = [], depth: number = 0): SectionNode[] {
    const normalizedUrl = normalizeURL(node.url);
    const isSection = node.children.length > 0;

    // Create a section tree for the current node if it has children or is the root (depth 0)
    let sectionNode: SectionNode = { url: normalizedUrl, children: [] };
    if (isSection || depth === 0) {
        // Collect immediate leaf children (children with no children of their own)
        const leafChildren = node.children
            .filter(child => child.children.length === 0)
            .map(child => ({ url: normalizeURL(child.url), children: [] }));
        sectionNode.children = leafChildren;
        sections.push(sectionNode);
        logWithTimestamp(`Depth ${depth}: Created section tree for ${normalizedUrl} with ${leafChildren.length} leaf children: ${JSON.stringify(leafChildren.map(c => c.url))}`);
    } else {
        logWithTimestamp(`Depth ${depth}: Node ${normalizedUrl} is a leaf, not creating a section tree`);
    }

    // Recursively process children that have children (subsections)
    const subsectionChildren = node.children.filter(child => child.children.length > 0);
    for (const child of subsectionChildren) {
        logWithTimestamp(`Depth ${depth}: Processing subsection ${child.url} with ${child.children.length} children`);
        splitSectionTrees(child, sections, depth + 1);
    }

    return sections;
}

export async function generatePDF(
    ctx: BrowserContext,
    url: string,
    urlPattern: RegExp = new RegExp(`^${url}`),
    concurrentLimit: number,
    contentDiv: string = 'div.router-content div.content',
    navDiv: string = '.card-body .vue-recycle-scroller__item-view a.leaf-link',
    splitSections: boolean = false
): Promise<Buffer> {
    const limit = pLimit(concurrentLimit);
    const visited = new Set<string>();
    
    if (splitSections) {
        const sectionTree = await buildSectionTree(ctx.page, url, urlPattern);
        const outputDir = join(process.cwd(), "out");
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        const sectionTrees = splitSectionTrees(sectionTree);
        logWithTimestamp(`Split into ${sectionTrees.length} section trees`);

        for (const section of sectionTrees) {
            const rootUrl = section.url;
            const urls = [rootUrl, ...section.children.map(child => child.url)].sort((a, b) => a.localeCompare(b));
            const sectionSlug = generateSlug(rootUrl);
            logWithTimestamp(`Processing section ${sectionSlug}: ${JSON.stringify(urls)}`);

            const pdfDoc = await PDFDocument.create();
            const processedUrls = new Set<string>();

            for (const sectionUrl of urls) {
                if (processedUrls.has(sectionUrl)) {
                    logWithTimestamp(`Skipping duplicate URL ${sectionUrl} in section ${sectionSlug}`);
                    continue;
                }
                processedUrls.add(sectionUrl);

                const pdfBuffer = await generateSinglePDF(ctx, sectionUrl, contentDiv);
                if (pdfBuffer.length > 0) {
                    const subPdfDoc = await PDFDocument.load(pdfBuffer);
                    const pageCount = subPdfDoc.getPageCount();
                    logWithTimestamp(`Merging PDF for ${sectionUrl} with ${pageCount} page(s) into ${sectionSlug}`);
                    const copiedPages = await pdfDoc.copyPages(subPdfDoc, subPdfDoc.getPageIndices());
                    for (const page of copiedPages) {
                        pdfDoc.addPage(page);
                        logWithTimestamp(`Added page for ${sectionUrl} to ${sectionSlug} PDF`);
                    }
                }
            }

            const finalPageCount = pdfDoc.getPageCount();
            if (finalPageCount > 0) {
                const outputPath = join(outputDir, `${sectionSlug}.pdf`);
                const pdfBytes = await pdfDoc.save();
                writeFileSync(outputPath, new Uint8Array(pdfBytes));
                logWithTimestamp(`PDF saved to ${outputPath} with ${finalPageCount} pages`);
            } else {
                logWithTimestamp(`No pages generated for section ${sectionSlug}`);
            }
        }

        logWithTimestamp(`Completed PDF generation for section trees`);
        return Buffer.from([]); // Return empty buffer as PDFs are saved separately
    } else {
        const allLinks = await crawlLinks(ctx.page, url, urlPattern, visited, concurrentLimit, contentDiv, navDiv);
        const uniqueLinks = [...new Set(allLinks.map(normalizeURL))].sort((a, b) => a.localeCompare(b));
        logWithTimestamp(`Total unique links to process (sorted): ${JSON.stringify(uniqueLinks)}`);

        const pdfDoc = await PDFDocument.create();
        const processedUrls = new Set<string>();

        const generatePDFForPage = async (link: string) => {
            const normalizedLink = normalizeURL(link);
            if (processedUrls.has(normalizedLink)) {
                logWithTimestamp(`Skipping duplicate PDF generation for ${normalizedLink}`);
                return null;
            }
            processedUrls.add(normalizedLink);

            const pdfBuffer = await generateSinglePDF(ctx, normalizedLink, contentDiv);
            if (pdfBuffer.length > 0) {
                return { url: normalizedLink, buffer: pdfBuffer };
            }
            return null;
        };

        const pdfPromises = uniqueLinks.map((link) =>
            limit(() => generatePDFForPage(link))
        );
        const pdfResults = (await Promise.all(pdfPromises)).filter(
            (result) => result !== null
        ) as { url: string; buffer: Buffer }[];

        for (const { url, buffer } of pdfResults) {
            if (buffer) {
                const subPdfDoc = await PDFDocument.load(buffer);
                const pageCount = subPdfDoc.getPageCount();
                logWithTimestamp(`Merging PDF for ${url} with ${pageCount} page(s)`);
                const copiedPages = await pdfDoc.copyPages(
                    subPdfDoc,
                    subPdfDoc.getPageIndices()
                );
                for (const page of copiedPages) {
                    pdfDoc.addPage(page);
                    logWithTimestamp(`Added page for ${url} to final PDF`);
                }
            }
        }

        const finalPageCount = pdfDoc.getPageCount();
        logWithTimestamp(`Final PDF has ${finalPageCount} pages`);
        const pdfBytes = await pdfDoc.save();
        return Buffer.from(pdfBytes);
    }
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
    const args = process.argv.slice(2);
    const mainURL = normalizeURL(args[0]);
    let urlPattern: RegExp;
    try {
        const urlPatternStr = args[1] && !args[1].startsWith('--') ? args[1] : `^${escapeRegExp(mainURL)}.*`;
        urlPattern = new RegExp(urlPatternStr);
        logWithTimestamp(`Constructed urlPattern: ${urlPattern.source}`);
    } catch (error) {
        logWithTimestamp(`Error constructing urlPattern: ${error}`);
        throw new Error(`Invalid urlPattern: ${error}`);
    }
    const contentDiv = args.includes('--content-div') ? args[args.indexOf('--content-div') + 1] : 'div.router-content div.content';
    const navDiv = args.includes('--nav-div') ? args[args.indexOf('--nav-div') + 1] : '.card-body .vue-recycle-scroller__item-view a.leaf-link';
    const splitSections = args.includes('--split-sections');

    if (!mainURL) {
        showHelp();
        throw new Error("<main_url> is required");
    }

    logWithTimestamp(`Generating PDF for ${mainURL} and sub-links matching ${urlPattern} with contentDiv=${contentDiv}, navDiv=${navDiv}, splitSections=${splitSections}`);
    let ctx;
    try {
        ctx = await useBrowserContext();
        const pdfBuffer = await generatePDF(ctx, mainURL, urlPattern, 1, contentDiv, navDiv, splitSections);
        if (!splitSections) {
            const slug = generateSlug(mainURL);
            const outputDir = join(process.cwd(), "out");
            const outputPath = join(outputDir, `${slug}.pdf`);

            if (!existsSync(outputDir)) {
                mkdirSync(outputDir, { recursive: true });
            }

            writeFileSync(outputPath, new Uint8Array(pdfBuffer));
            logWithTimestamp(`PDF saved to ${outputPath}`);
        }
    } catch (error) {
        logWithTimestamp(`Error generating PDF: ${error}`);
        throw error;
    } finally {
        await ctx?.browser.close();
    }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer, { type Browser, type Page } from "puppeteer";
import chromeFinder from "chrome-finder";

function showHelp() {
    console.log(`
Usage: node dist/list-sections.js <base_url>

Arguments:
  base_url         The main URL to scrape sections from (e.g., https://developer.apple.com/documentation/virtualization)
`);
}

function logWithTimestamp(message: string): void {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function generateSlug(url: string): string {
    return url
        .replace(/https?:\/\//, "")
        .replace(/[^\w\s-]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/\./g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
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
        parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
        parsedUrl.hash = '';
        const normalized = parsedUrl.toString();
        logWithTimestamp(`Normalized URL: ${url} -> ${normalized}`);
        return normalized;
    } catch (error) {
        const cleanUrl = url.split('#')[0].replace(/\/+$/, '');
        logWithTimestamp(`Normalized fallback URL: ${url} -> ${cleanUrl}`);
        return cleanUrl;
    }
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface SectionNode {
    url: string;
    children: SectionNode[];
}

async function getSectionLinks(page: Page, url: string): Promise<string[]> {
    logWithTimestamp(`Scraping sections from: ${url}`);
    try {
        const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        if (!response) {
            throw new Error(`Failed to load ${url}`);
        }

        const contentDiv = 'div.router-content div.content';
        const navDiv = '.card-body .vue-recycle-scroller__item-view a.leaf-link';
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
                const domStructure = await page.evaluate(() => {
                    const classes = Array.from(document.querySelectorAll('div')).map(div => div.className).filter(cls => cls);
                    const bodyLinks = Array.from(document.querySelectorAll('body a')).map(a => a.getAttribute('href'));
                    return `Main div classes: ${JSON.stringify(classes, null, 2)}\nBody links found: ${bodyLinks.length} ${JSON.stringify(bodyLinks.slice(0, 5))}`;
                });
                logWithTimestamp(`Failed to find ${contentDiv} or ${navDiv} after retries. ${domStructure}`);
                await page.waitForSelector('body', { timeout: 10000 });
            }
        }

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await delay(15000);

        const sectionLinks = await page.evaluate((baseUrl: string, contentSelector: string, navSelector: string) => {
            let links: HTMLAnchorElement[] = [];
            const contentLinks = document.querySelectorAll(`${contentSelector} .link-block.topic a, ${contentSelector} a.inline-link`) as NodeListOf<HTMLAnchorElement>;
            if (contentLinks.length > 0) {
                links = Array.from(contentLinks);
            } else {
                const navLinks = document.querySelectorAll(navSelector) as NodeListOf<HTMLAnchorElement>;
                if (navLinks.length > 0) {
                    links = Array.from(navLinks);
                } else {
                    links = Array.from(document.querySelectorAll(`body a[href^="${baseUrl}"]`)) as HTMLAnchorElement[];
                }
            }
            return links.map((link) => link.href);
        }, url, contentDiv, navDiv);

        const normalizedLinks = [...new Set(sectionLinks.map(normalizeURL))].filter(link => 
            link.startsWith(url) && !link.includes('#')
        );
        logWithTimestamp(`Found section links: ${JSON.stringify(normalizedLinks)}`);
        return normalizedLinks;
    } catch (error) {
        logWithTimestamp(`Error scraping sections: ${error}`);
        return [];
    }
}

export async function buildSectionTree(page: Page, url: string, visited: Set<string> = new Set(), depth: number = 0): Promise<SectionNode> {
    const normalizedUrl = normalizeURL(url);
    if (visited.has(normalizedUrl)) {
        logWithTimestamp(`Skipping already visited URL in tree: ${normalizedUrl}`);
        return { url: normalizedUrl, children: [] };
    }
    visited.add(normalizedUrl);

    const childUrls = await getSectionLinks(page, url);
    const children: SectionNode[] = [];

    for (const childUrl of childUrls) {
        const childNode = await buildSectionTree(page, childUrl, visited, depth + 1);
        children.push(childNode);
    }

    logWithTimestamp(`Built tree node for ${url} with ${children.length} children at depth ${depth}`);
    return { url: normalizedUrl, children };
}

async function main() {
    const baseURL = process.argv[2];

    if (!baseURL) {
        showHelp();
        throw new Error("<base_url> is required");
    }

    logWithTimestamp("list-sections.js version: 2025-05-21T10:00:00Z (with flexible selectors)");
    let ctx;
    try {
        ctx = await useBrowserContext();
        const sectionTree = await buildSectionTree(ctx.page, baseURL);
        logWithTimestamp(`Section tree: ${JSON.stringify(sectionTree, null, 2)}`);

        const sectionLinks = await getSectionLinks(ctx.page, baseURL);
        const commands = sectionLinks.map(link => 
            `node bin/site2pdf.js "${link}/" "${link}/.*"`
        );

        const slug = generateSlug(baseURL);
        const outputDir = join(process.cwd(), "out");
        const outputPath = join(outputDir, `${slug}-section-commands.txt`);

        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        writeFileSync(outputPath, commands.join('\n'));
        logWithTimestamp(`Section commands saved to ${outputPath}`);

        console.log('\nGenerated Commands:');
        console.log(commands.join('\n'));
    } catch (error) {
        logWithTimestamp(`Error: ${error}`);
    } finally {
        await ctx?.browser.close();
    }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
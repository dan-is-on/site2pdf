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

async function getSectionLinks(page: Page, url: string): Promise<string[]> {
    logWithTimestamp(`Scraping sections from: ${url}`);
    try {
        const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        if (!response) {
            throw new Error(`Failed to load ${url}`);
        }

        await page.waitForSelector('div.router-content div.content', { timeout: 5000 });
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await delay(15000);

        const sectionLinks = await page.evaluate(() => {
            const links = Array.from(
                document.querySelectorAll('div.router-content div.content .link-block.topic a')
            ) as HTMLAnchorElement[];
            return links.map((link) => link.href);
        });

        const normalizedLinks = [...new Set(sectionLinks.map(normalizeURL))].filter(link => 
            link.startsWith(url) && !link.includes('#') // Exclude anchor links
        );
        logWithTimestamp(`Found section links: ${JSON.stringify(normalizedLinks)}`);
        return normalizedLinks;
    } catch (error) {
        logWithTimestamp(`Error scraping sections: ${error}`);
        return [];
    }
}

async function main() {
    const baseURL = process.argv[2];

    if (!baseURL) {
        showHelp();
        throw new Error("<base_url> is required");
    }

    let ctx;
    try {
        ctx = await useBrowserContext();
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
# Site2PDF CLI Development Plan

This plan outlines the steps to enhance the `site2pdf-cli` tool, fixing TypeScript errors, restoring crawling, resolving PDF duplication, adding reusability features, and exploring a C# port for app store distribution. The tool crawls a website, extracts sub-links matching a pattern, and generates PDFs using Puppeteer and pdf-lib, maintaining depth-first crawling, single concurrency, and throttling mitigation.

## Objectives
- Fix TypeScript compilation errors from initial implementation.
- Restore basic crawling from main content (`div.router-content div.content`).
- Handle trailing slash deduplication for consistent URLs.
- Ensure PDFs include all content without duplicate pages, allowing multi-page PDFs for long content.
- Add optional CLI parameters for content/navigation selectors and ignore patterns.
- Generate separate PDFs for each section and subsection, recursively handling multiple levels, with top-level pages first and excluding section pages from parent PDFs.
- Sort pages within PDFs by URL and add standard print margins (1 inch) to improve printability.
- Prevent unintended overwriting of existing PDFs with configurable behavior.
- Update README with macOS (15.4.1 Sequoia) and Linux setup, retaining original content unless incorrect.
- Explore C# port with non-CLI dependencies for iOS, iPadOS, Android, macOS, and Windows app stores.
- Ensure compatibility with contribution and app store distribution.

## Plan Steps

| Step | Goal | Actions | Status |
|------|------|---------|--------|
| 1 | Fix `waitForTimeout` TypeScript error | Replace `waitForTimeout` with a `delay` function using `setTimeout` to resolve type definition issues. | Completed |
| 2 | Fix `links` casting error in `page.evaluate` | Cast `Element` to `HTMLAnchorElement` to access `href` properties safely in TypeScript. | Completed |
| 3 | Fix `Buffer` type predicate error | Simplify `pdfBytesArray` filter with type assertion `as Buffer[]`, avoiding `ArrayBufferLike` conflicts. | Completed |
| 4 | Fix `PDFDocument.load` null error | Add explicit null guard for `pdfBytes` before `PDFDocument.load` to ensure type safety. | Completed |
| 4.1 | Fix `Set` constructor typo | Correct `Set<string>()` to `new Set<string>()` in `generatePDF` to fix instantiation error. | Completed |
| 5 | Restore basic crawling from main content | Use `div.router-content div.content` selector; implement 5 retries with exponential backoff (1–16s); add 15s post-scroll delay, single concurrency (`pLimit(1)`), 30s `page.goto` timeout, User-Agent (`Chrome/91`), and ISO timestamps; log HTTP status/headers for errors. | Completed (successful run, ~50+ pages, but pages duplicated) |
| 6 | Fix trailing slash bug | Enhance `normalizeURL` to use `new URL` for consistent trailing slash removal, preserving query parameters; deduplicate URLs in `visited` Set and `generatePDF`; log normalization. | Completed (deduplicates crawls, but PDF duplication persists) |
| 6.1 | Eliminate duplicate pages in PDF | Fix compilation errors; add `processedUrls` Set in `generatePDF` to prevent duplicate URL processing; support multi-page PDFs for long content; log page counts to verify coverage; ensure no duplicate pages and appropriate file size (e.g., 6 pages for test case with 4 URLs). | Completed (6 pages, no duplicates, all content included) |
| 7 | Enhance crawling for dynamic content | If links are missing, add logic to click expanders (e.g., `.tree-toggle`) or interact with dynamic elements; adjust delays if needed. | Pending (if needed) |
| 8 | Add optional content and navigation div parameters | Add `--content-div=<selector>` (default: `div.router-content div.content`) and `--nav-div=<selector>` (default: `.card-body .vue-recycle-scroller__item-view a.leaf-link`) CLI arguments; modify `crawlLinks` to try `contentDiv` first, then `navDiv`, falling back to `body a[href^="/documentation/virtualization"]`; prepare for section splitting, ignore patterns, sorting, and margins. | In Progress (selectors implemented, section splitting deferred to Steps 8.1–8.4) |
| 8.1 | Enable recursive section URL extraction | Modify `list-sections.ts` to recursively crawl section and subsection URLs, building a tree structure (e.g., `{ url: "/vzmacosconfigurationrequirements", children: ["/hardwaremodel", ...] }`); export tree-building function for use in `index.ts`; log tree for debugging; ensure compatibility with `normalizeURL`. | Pending |
| 8.2 | Implement section/subsection PDF splitting | Add `--split-sections` CLI flag to enable separate PDFs for main page, sections, and subsections; use URL tree from Step 8.1 to generate PDFs for each node (main, section, subsection); include top-level page first, followed by direct children; exclude section top-level pages from parent PDFs; name PDFs with `generateSlug` (e.g., `vzmacosconfigurationrequirements.pdf`); log PDF generation per section. | Pending |
| 8.3 | Add custom ignore patterns | Add `--ignore=<pattern1>,<pattern2>,...` CLI argument for comma-separated regex patterns (e.g., `/vzerror/.*,https://docs\.oasis-open\.org/.*`); parse into `RegExp` array; filter links in `crawlLinks` before processing; log ignored URLs; ensure compatibility with `--split-sections`. | Pending |
| 8.4 | Sort pages by URL and add print margins | Sort `uniqueLinks` in `generatePDF` alphabetically, ensuring top-level URL is first for section/subsection PDFs; update `newPage.pdf` to include `margin: { top: 72, bottom: 72, left: 72, right: 72 }` (1-inch margins); verify content reflows within margins, potentially increasing page count; log sorted URLs and margin application. | Pending |
| 8.5 | Prevent unintended PDF overwrites | Add `--overwrite` CLI flag (default: false, skips existing PDFs); check if PDF exists at `outputPath` before writing; log skipped PDFs or overwrite confirmation; optionally append timestamp to filename if `--overwrite=false` (e.g., `virtualization-20250521T1632.pdf`); update `main` to handle flag and file checks; document in help message. | Pending |
| 9 | Enhance ignore pattern flexibility | Extend `--ignore` from Step 8.3 to support dynamic pattern generation (e.g., based on URL tree); allow combining with `--split-sections` for fine-grained control; document usage in help message. | Pending |
| 10 | Update README with all capabilities | Retain original README content unless known incorrect; add macOS setup (tested on 15.4.1 Sequoia) with `brew` commands for Node.js and Chrome (e.g., `brew install node`, `brew install --cask google-chrome`); separate Linux dependencies (untested, marked unverified); include usage for `--content-div`, `--nav-div`, `--ignore`, `--split-sections`, `--overwrite`; add contribution guidelines with TypeScript style and testing steps. | Pending |
| 11 | Explore C# port for app store distribution | Port Node.js CLI to C# using .NET MAUI; replace `puppeteer` with `HtmlAgilityPack + HttpClient` (crawling) and WebView (`WKWebView`, `WebView`, `WebView2`) for dynamic content; replace `pdf-lib` with `PDFSharp` (MIT) for PDF generation; implement GUI for URL/pattern input; offload crawling to server for iOS/Android; ensure app store compliance (privacy manifests, signing, native UI). | Pending |

## Notes
- **Current Run (Step 5)**: Successful, produced ~50+ page PDF, but every page was duplicated, inflating file size. Share CLI output, page count, file size, and execution time to confirm.
- **Step 6 Run**: Crawled 4 URLs, PDF had ~8 pages due to duplication. Step 6.1 produced 6 pages (2 + 2 + 1 + 1), confirmed as intended with no duplicates and all content included.
- **Section Scraping**: `list-sections.ts` generates commands for all Virtualization documentation sections (~20–30), used in Steps 8.1–8.2 for section/subsection splitting.
- **PDF Overwrite Behavior**: Current `index.ts` overwrites existing PDFs without warning; Step 8.5 adds `--overwrite` flag to prevent unintended overwrites, critical for multiple section PDFs.
- **Dependency Licenses**: Node.js dependencies (`puppeteer`: Apache-2.0, `pdf-lib`: MIT, `p-limit`: MIT, `chrome-finder`: MIT, `typescript`: Apache-2.0) are permissive and app store-compatible, requiring notices. C# dependencies (`HtmlAgilityPack`: MIT, `PDFSharp`: MIT) are similarly compatible.
- **App Store Feasibility**: C# port with .NET MAUI, `HtmlAgilityPack`, `PDFSharp`, and server-side crawling ensures iOS, iPadOS, Android, macOS, and Windows app store compatibility, meeting GUI and sandboxing requirements (Apple Guideline 4.2, Google Play Policy 4.1).
- **macOS Compatibility**: Tested on macOS 15.4.1. README will use `brew` for dependencies, separating macOS from Linux (untested).
- **Linux**: Original Linux content preserved, marked as untested to avoid assumptions.
- **Contribution**: Include `LESSONS_LEARNED.md`, `README.md`, `LICENSE` (MIT), and `.gitignore` (`node_modules`, `dist/`, `out/`) in the repository. Lessons support future app store development.
- **Next Steps**: Verify Step 8 with updated `index.ts` (selector flexibility), then proceed to Steps 8.1–8.5 (section splitting, ignore patterns, sorting, margins, overwrite handling). Explore C# port in Step 11. Finalize README in Step 10 for submission.

## Example Usage (Current)
```bash
node bin/site2pdf.js "https://developer.apple.com/documentation/virtualization/" "https://developer.apple.com/documentation/virtualization/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link"
```
This crawls the Virtualization docs, generating a single PDF with all pages (main, sections, subsections), preparing for section splitting in Steps 8.1–8.2. Existing PDFs are overwritten.

## Example Usage (Future Steps)
```bash
node bin/site2pdf.js "https://developer.apple.com/documentation/virtualization/" "https://developer.apple.com/documentation/virtualization/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections --ignore="/vzerror/.*,https://docs\.oasis-open\.org/.*" --overwrite=false
```
This generates separate PDFs for the main page, sections, and subsections, with sorted pages, print margins, ignored patterns, and skips existing PDFs unless `--overwrite=true`.

## C# Port Example (Step 11, Planned)
```csharp
// Pseudo-code for .NET MAUI app
using HtmlAgilityPack;
using PdfSharp.Pdf;
using System.Net.Http;

public class SiteToPdfApp
{
    private readonly HttpClient _httpClient = new();
    private readonly List<string> _visited = new();

    public async Task GeneratePdfAsync(string mainUrl, string urlPattern, string contentDiv, string navDiv, string[] ignorePatterns)
    {
        var pdf = new PdfDocument();
        var links = await CrawlLinksAsync(mainUrl, urlPattern, contentDiv, navDiv, ignorePatterns);
        foreach (var link in links)
        {
            var pageContent = await RenderPageAsync(link);
            pdf.AddPage(ConvertToPdfPage(pageContent));
        }
        pdf.Save("output.pdf");
    }

    private async Task<List<string>> CrawlLinksAsync(string url, string urlPattern, string contentDiv, string navDiv, string[] ignorePatterns)
    {
        return new List<string> { url };
    }
}
```
This will be fleshed out in Step 11, targeting iOS, iPadOS, Android, macOS, and Windows app stores.

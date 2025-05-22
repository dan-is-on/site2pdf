# Site2PDF CLI Development Plan

This plan outlines the steps to enhance the `site2pdf-cli` tool, fixing TypeScript errors, restoring crawling, resolving PDF duplication, adding reusability features, and exploring a C# port for app store distribution. The tool crawls a website, extracts sub-links matching a pattern, and generates PDFs using Puppeteer and pdf-lib, maintaining depth-first crawling, single concurrency, and throttling mitigation. New requirements ensure no duplicate pages, alphabetical URL sorting, and local system timezone timestamps.

## Objectives
- Fix TypeScript compilation errors from initial implementation.
- Restore basic crawling from main content (`div.router-content div.content`).
- Handle trailing slash deduplication for consistent URLs.
- Ensure PDFs include all content without duplicate pages, allowing multi-page PDFs for long content.
- Ensure each web page appears in only one PDF, corresponding to its section/subsection, with no duplicates across PDFs.
- Sort URLs alphabetically within PDFs for both split and non-split modes.
- Use local system timezone (with daylight savings if applicable) for log timestamps.
- Add optional CLI parameters for content/navigation selectors and ignore patterns.
- Generate separate PDFs for each section and subsection, recursively handling multiple levels, with top-level pages first and excluding subsection top-level pages from parent PDFs.
- Prevent unintended overwriting of existing PDFs with configurable behavior.
- Standardize build process to include all source files (e.g., `list-sections.ts`).
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
| 6 | Fix trailing slash bug | Enhance `normalizeURL` to use `new URL` for consistent trailing slash removal, preserving query parameters; deduplicate URLs in `visited` Set and `generatePDF`; log normalization. | Completed (deduplicates crawls, but PDF duplication persisted) |
| 6.1 | Eliminate duplicate pages in PDF | Fix compilation errors; add `processedUrls` Set in `generatePDF` to prevent duplicate URL processing; support multi-page PDFs for long content; log page counts to verify coverage; ensure no duplicate pages and appropriate file size (e.g., 6 pages for test case with 4 URLs). | Completed (6 pages, no duplicates, all content included) |
| 7 | Enhance crawling for dynamic content | If links are missing, add logic to click expanders (e.g., `.tree-toggle`) or interact with dynamic elements; adjust delays if needed. | Pending (if needed) |
| 8 | Add optional content and navigation div parameters | Add `--content-div=<selector>` (default: `div.router-content div.content`) and `--nav-div=<selector>` (default: `.card-body .vue-recycle-scroller__item-view a.leaf-link`) CLI arguments; modify `crawlLinks` to try `contentDiv` first, then `navDiv`, falling back to `body a[href^="/documentation/virtualization"]`; prepare for section splitting, ignore patterns, sorting, margins, and overwrite handling; fix `list-sections.js` import with `.js` extension. | Completed (selectors validated, import fixed) |
| 8.1 | Enable recursive section URL extraction | Modify `list-sections.ts` to recursively crawl section and subsection URLs, building a tree structure (e.g., `{ url: "/vzmacosconfigurationrequirements", children: ["/hardwaremodel", ...] }`); export tree-building function (`buildSectionTree`) for use in `index.ts`; log tree for debugging; ensure compatibility with `normalizeURL` and build process. | Completed (verified with `/vzvirtualmachine`, 29 sections, 11 subsections for `/state-swift.enum`) |
| 8.2 | Implement section/subsection PDF splitting with deduplication and sorting | Add `--split-sections` CLI flag to enable separate PDFs for main page, sections, and subsections; use URL tree from Step 8.1; generate one PDF per section containing all web pages for that section and its subsections (excluding subsection top-level pages); use `parentUrls` Set to exclude subsection pages from parent PDFs; add global `visited` Set in `generateNodePDF` to prevent duplicate PDFs; deduplicate URLs in `buildSectionTree`; sort URLs alphabetically within each PDF (split and non-split modes); name PDFs with `generateSlug` (e.g., `vzmacosconfigurationrequirements.pdf`); log PDF generation, skipped duplicates, and URL order; run `npm run build` after changes. | In Progress (separate PDFs generated, but duplicate URLs detected; sorting pending) |
| 8.3 | Add custom ignore patterns | Add `--ignore=<pattern1>,<pattern2>,...` CLI argument for comma-separated regex patterns (e.g., `/vzerror/.*,https://docs\.oasis-open\.org/.*`); parse into `RegExp` array; filter links in `crawlLinks` and `buildSectionTree` before processing; log ignored URLs; ensure compatibility with `--split-sections`. | Pending |
| 8.4 | Add print margins | Update `newPage.pdf` in `generateSinglePDF` to include `margin: { top: 72, bottom: 72, left: 72, right: 72 }` (1-inch margins); verify content reflows within margins, potentially increasing page count; log margin application. | Pending |
| 8.5 | Prevent unintended PDF overwrites | Add `--overwrite` CLI flag (default: false, skips existing PDFs); check if PDF exists at `outputPath` before writing; log skipped PDFs or overwrite confirmation; optionally append timestamp to filename if `--overwrite=false` (e.g., `virtualization-20250521T1632.pdf`); update `main` to handle flag and file checks; document in help message. | Pending |
| 8.6 | Standardize build process | Update `tsconfig.json` to include all source files (e.g., `["src/**/*.ts"]`); ensure `list-sections.ts` and other modules compile to `dist/`; document `tsconfig.json` setup in README; log build errors for missing files; test build with all dependencies. | Pending |
| 8.7 | Use local system timezone for logs | Update `logWithTimestamp` in `index.ts` and `list-sections.ts` to use `toLocaleString` with local system timezone and daylight savings (e.g., `2025-05-22T17:42:07+10:00` for AEST if local); ensure ISO-like format with offset; document in README. | Pending |
| 9 | Enhance ignore pattern flexibility | Extend `--ignore` from Step 8.3 to support dynamic pattern generation (e.g., based on URL tree); allow combining with `--split-sections` for fine-grained control; document usage in help message. | Pending |
| 10 | Update README with all capabilities | Retain original README content unless incorrect; add macOS setup (tested on 15.4.1 Sequoia) with `brew` commands for Node.js and Chrome (e.g., `brew install node`, `brew install --cask google-chrome`); separate Linux dependencies (untested, marked unverified); include usage for `--content-div`, `--nav-div`, `--ignore`, `--split-sections`, `--overwrite`, local timezone; add contribution guidelines with TypeScript style and testing steps; document `tsconfig.json` setup from Step 8.6. | Pending |
| 11 | Explore C# port for app store distribution | Port Node.js CLI to C# using .NET MAUI; replace `puppeteer` with `HtmlAgilityPack + HttpClient` (crawling) and WebView (`WKWebView`, `WebView`, `WebView2`) for dynamic content; replace `pdf-lib` with `PDFSharp` (MIT) for PDF generation; implement GUI for URL/pattern input; offload crawling to server for iOS/Android; ensure app store compliance (privacy manifests, signing, native UI). | Pending |

## Notes
- **Step 8.1 Verification**: Successful for `/vzvirtualmachine` (29 sections, 11 subsections for `/state-swift.enum`). No deeper recursion needed.
- **Step 8.2 Issues**: Logs show duplicate URL processing (e.g., `/canstart` multiple times), risking page duplication. URLs not sorted alphabetically.
- **Step 8.2 Fix**: Deduplicate in `buildSectionTree` and `generateNodePDF`, sort URLs within PDFs, log skipped duplicates and order.
- **Step 8.7 Addition**: Local system timezone ensures flexibility for different environments (e.g., AEST, EDT).
- **Dependency Licenses**: Node.js dependencies (`puppeteer`: Apache-2.0, `pdf-lib`: MIT, `p-limit`: MIT, `chrome-finder`: MIT, `typescript`: Apache-2.0) are permissive and app store-compatible, requiring notices. C# dependencies (`HtmlAgilityPack`: MIT, `PDFSharp`: MIT) are similarly compatible.
- **macOS Compatibility**: Tested on macOS 15.4.1 Sequoia. README will use `brew` for dependencies, separating Linux (untested).
- **Contribution**: Include `LESSONS_LEARNED.md`, `README.md`, `LICENSE` (MIT), and `.gitignore` (`node_modules`, `dist/`, `out/`) in the repository.
- **Next Steps**: Complete Step 8.2 (deduplication, sorting), then proceed to 8.3–8.7. Finalize README in Step 10, explore C# port in Step 11.

## Example Usage (Current)
```bash
node bin/site2pdf.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections
```
Generates separate PDFs for sections, but with potential duplicate URLs and unsorted order.

## Example Usage (Future)
```bash
node bin/site2pdf.js "https://developer.apple.com/documentation/virtualization/" "https://developer.apple.com/documentation/virtualization/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections --ignore="/vzerror/.*,https://docs\.oasis-open\.org/.*" --overwrite=false
```
Generates deduplicated, alphabetically sorted PDFs with local timezone timestamps, skipping existing files.

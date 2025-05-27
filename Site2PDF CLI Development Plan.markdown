# Site2PDF CLI Project Requirements and Plan

## Project Overview
The Site2PDF CLI is a Node.js tool that converts web documentation into PDFs, targeting developer.apple.com. It uses Puppeteer for web scraping and pdf-lib for PDF generation, supporting custom selectors, URL patterns, and section splitting. The tool ensures robust crawling, deduplication, alphabetical sorting, and local timezone logging, with plans for cross-platform enhancements and app store compatibility.

## Requirements
- **Input**:
  - Main URL (e.g., `https://developer.apple.com/documentation/virtualization/vzvirtualmachine/`).
  - Optional URL pattern (regex, default: `^main_url.*`).
  - Content selector (default: `div.router-content div.content`).
  - Navigation selector (default: `.card-body .vue-recycle-scroller__item-view a.leaf-link`).
  - `--split-sections` flag for section-based PDFs.
- **Output**:
  - PDFs in `out/` directory, named by URL slugs (e.g., `developer-apple-com-documentation-virtualization-vzvirtualmachine.pdf`).
  - With `--split-sections`, ~3–5 PDFs:
    - Main page PDF (`vzvirtualmachine.pdf`) with top-level methods/properties (e.g., `/start(completionhandler:)`, `/canstart`).
    - Section PDFs (e.g., `state-swift-enum.pdf`) grouping all child URLs (e.g., `/stopped`, `/running`), excluding subsection top-level pages from parent PDFs.
- **Functionality**:
  - Scrape main URL and sub-links matching the pattern.
  - Deduplicate URLs within and across PDFs using Sets.
  - Sort URLs alphabetically within PDFs.
  - Handle dynamic DOMs with 5 retries, exponential backoff (1–16s), 15s post-scroll delay, 30s timeout, single concurrency (`pLimit(1)`), and User-Agent (`Chrome/91`).
  - Log timestamps in local system timezone (AEST, UTC+10) with ISO-like format.
- **Performance**: Minimize redundant scraping, optimize normalization, and handle throttling.
- **Environment**: macOS 15.4.1 Sequoia, Node.js 20, TypeScript, AEST timezone.
- **Dependencies**: Puppeteer (Apache-2.0), pdf-lib (MIT), p-limit (MIT), chrome-finder (MIT), TypeScript (Apache-2.0), all permissive for app store compliance.

## Development Plan

### Step 8: Split Documentation into Sections (In Progress)
- **Objective**: Implement `--split-sections` to generate ~3–5 PDFs for the main page and sections, grouping related URLs (e.g., `/state-swift.enum/*` in `state-swift-enum.pdf`), with deduplication and alphabetical sorting.
- **Status**: Incomplete due to excessive PDF generation (29 PDFs instead of ~3–5).
- **Sub-Steps**:
  8.1. **Build URL Tree**:
     - **Actions**: Modified `list-sections.ts` to recursively crawl section/subsection URLs, building a tree structure (`{ url: "/vzvirtualmachine", children: [...] }`). Exported `buildSectionTree` for `index.ts`. Ensured compatibility with `normalizeURL`.
     - **Status**: Completed. Verified with `/vzvirtualmachine` (29 sections at depth 0, 11 subsections for `/state-swift.enum` at depth 1).
     - **Validation**: Logs show tree with 29 children at depth 0 (`[2025-05-27T02:51:05.509Z]`).
  8.2. **Generate Section PDFs** (Current):
     - **Issue**: `index.ts` generated 29 PDFs (e.g., `state-swift-enum-stopped.pdf`, `start-completionhandler.pdf`) due to `generateNodePDF` creating a PDF for every `SectionNode`, ignoring section grouping. Duplicate URLs appeared across PDFs (e.g., `/stopped` in `vzvirtualmachine.pdf` and `state-swift-enum-stopped.pdf`).
     - **Fix**:
       - Update `generateNodePDF` to generate PDFs only for depth 0 (main page) and depth 1 (sections, e.g., `/state-swift.enum`).
       - Revise `collectSectionUrls` to group URLs by section (e.g., all `/state-swift.enum/*` URLs under `state-swift-enum.pdf`), using a `Map` to map section keys to URL lists.
       - Implement global `processedUrls` Set across PDFs to prevent duplicates.
       - Sort URLs alphabetically in `collectSectionUrls` for each PDF.
       - Log section grouping, skipped duplicates, and URL order.
     - **Validation**:
       - Run `node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
       - Expect ~3–5 PDFs: `vzvirtualmachine.pdf` (~10–15 pages, including `/canstart`, `/start(completionhandler:)`), `state-swift-enum.pdf` (~12–15 pages, including `/stopped`, `/running`), `graphicsdevices.pdf` (~2 pages), etc.
       - Verify logs for “Processing URLs for ...” with grouped URLs (e.g., `/state-swift.enum/stopped`, `/running`), “Skipping duplicate” entries, and alphabetical order.
       - Check PDFs: `state-swift-enum.pdf` includes `/stopped`, `/running`; `vzvirtualmachine.pdf` excludes `/state-swift.enum/*` top-level pages.
     - **Deadline**: May 28, 2025, 6:00 PM AEST.
  8.3. **Add Custom Ignore Patterns**:
     - **Actions**: Implement `--ignore=<pattern1>,<pattern2>,...` CLI argument for regex patterns (e.g., `/vzerror/.*,https://docs\.oasis-open\.org/.*`). Parse into `RegExp` array. Filter links in `crawlLinks` and `buildSectionTree`. Log ignored URLs.
     - **Status**: Pending, dependent on Step 8.2.
     - **Validation**: Test with `--ignore="/swift/true,.*oasis.*"`. Verify logs show skipped URLs and PDFs exclude filtered content.
  8.4. **Add Print Margins**:
     - **Actions**: Update `newPage.pdf` in `generateSinglePDF` with `margin: { top: 72, bottom: 72, left: 72, right: 72 }` (1-inch margins). Verify content reflows, potentially increasing page count. Log margin application.
     - **Status**: Pending.
     - **Validation**: Check PDFs for 1-inch margins and consistent content layout.
  8.5. **Prevent Unintended PDF Overwrites**:
     - **Actions**: Add `--overwrite` CLI flag (default: false). Check `outputPath` existence before writing. Log skipped PDFs or overwrite confirmation. Optionally append timestamp if `--overwrite=false` (e.g., `vzvirtualmachine-20250528T1800.pdf`).
     - **Status**: Pending.
     - **Validation**: Test with existing PDFs and `--overwrite=false`. Verify new PDFs have timestamped names or are skipped.
  8.6. **Standardize Build Process**:
     - **Actions**: Update `tsconfig.json` to include `["src/**/*.ts"]`. Ensure `list-sections.ts` compiles to `dist/`. Document setup in README. Log build errors.
     - **Status**: Pending.
     - **Validation**: Run `npm run build`. Verify `dist/` includes all modules.
  8.7. **Use Local System Timezone for Logs**:
     - **Actions**: Update `logWithTimestamp` to use `toLocaleString` with AEST (UTC+10, handling daylight savings). Ensure ISO-like format with offset (e.g., `2025-05-28T18:00:00+10:00`). Document in README.
     - **Status**: Pending.
     - **Validation**: Check logs for AEST timestamps with correct offset.
  9. **Enhance Ignore Pattern Flexibility**:
     - **Actions**: Extend `--ignore` to support dynamic patterns (e.g., based on URL tree). Allow combination with `--split-sections`. Document in help message.
     - **Status**: Pending.
     - **Validation**: Test with dynamic patterns. Verify filtered URLs in logs and PDFs.
  10. **Update README with All Capabilities**:
      - **Actions**: Retain original README unless incorrect. Add macOS 15.4.1 setup (`brew install node`, `brew install --cask google-chrome`). Mark Linux as untested. Document `--content-div`, `--nav-div`, `--ignore`, `--split-sections`, `--overwrite`, timezone. Include contribution guidelines and `tsconfig.json` setup.
      - **Status**: Pending.
      - **Validation**: Verify README accuracy with macOS setup and CLI usage.
  11. **Explore C# Port for App Store Distribution**:
      - **Actions**: Port to C# with .NET MAUI. Use `HtmlAgilityPack` + `HttpClient` for crawling, WebView (`WKWebView`, `WebView`, `WebView2`) for dynamic content, `PDFSharp` for PDFs. Implement GUI for URL/pattern input. Offload crawling to server for iOS/Android. Ensure app store compliance (privacy manifests, signing).
      - **Status**: Pending.
      - **Validation**: Prototype GUI and PDF generation on macOS. Verify app store submission readiness.

## Notes
- **Environment**: macOS 15.4.1 Sequoia, Node.js 20, TypeScript, AEST (UTC+10).
- **Keybindings**: VS Code: `Option+Command+A` (stage), `Option+Command+C` (commit). Confirm `Option+Command+P` (push) and `git.commitAll` vs. `git.commit`.
- **Rename**: `bin/site2pdf.js` renamed to `bin/index.js`. Verify `package.json` has `"bin": { "site2pdf": "bin/index.js" }`.
- **Testing**: Run `npm run build` before tests. Share logs, PDF counts, and page content (e.g., OCR excerpts) for debugging.
- **Dependency Licenses**: All dependencies (Puppeteer, pdf-lib, etc.) are permissive, requiring license notices for app store compliance.
- **Contribution**: Include `LessonsLearned.md`, `README.md`, `LICENSE` (MIT), `.gitignore` (`node_modules`, `dist/`, `out/`).
- **Log Reference**: Latest test (May 27, 2025, 2:47–3:07 AEST) showed 29 PDFs, highlighting over-splitting.

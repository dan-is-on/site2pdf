# Site2PDF CLI Project Requirements and Plan

## Project Overview
The Site2PDF CLI is a Node.js tool for converting developer.apple.com documentation into PDFs, using Puppeteer for scraping and pdf-lib for generation. It dynamically splits documentation into sections, defined as webpages with children, producing one PDF per section with its root page first. The tool supports customizable selectors, URL patterns, and robust crawling for any root URL.

## Requirements
- **Input Parameters**:
  - Main URL (required, e.g., `https://developer.apple.com/documentation/virtualization/`).
  - URL pattern (optional, regex, default: `^main_url.*`).
  - Content selector (optional, default: `div.router-content div.content`).
  - Navigation selector (optional, default: `.card-body .vue-recycle-scroller__item-view a.leaf-link`).
  - `--split-sections` flag (optional, enables section-based PDFs).
- **Section Definition**:
  - A section is a webpage with a root/landing page and children (direct sub-links).
  - A child is a section if it has its own children (grandchildren relative to the main URL).
  - Example: `/virtualization` is a section (children: `/vzvirtualmachine`); `/vzvirtualmachine` is a section (children: `/start()`, `/state-swift.enum`); `/state-swift.enum` is a section (children: `/stopped`); `/start()` is not (no children).
  - Each section generates a PDF with its root page first, followed by immediate children that are not sections themselves (leaf nodes), excluding subsections, which form separate PDFs.
- **Data Structures**:
  - **Crawling**: Single URL tree with nodes (URL, children), capturing hierarchy (depth 0: main URL; depth 1: children; depth 2+: grandchildren).
  - **Post-Crawl**: Array of section trees, each rooted at a section’s landing page, containing only immediate children that are not sections (leaf nodes). Subsections are separate trees.
  - Example: For `/virtualization`, array includes trees for `/virtualization` (root + leaf children), `/vzvirtualmachine` (root + leaf children like `/start()`), `/state-swift.enum` (root + children like `/stopped`).
- **Output**:
  - PDFs in `out/`, named by URL slugs (e.g., `virtualization.pdf`).
  - With `--split-sections`, ~3–5 PDFs per root URL, one per section tree:
    - Main section (e.g., `virtualization.pdf`): Root page + leaf children.
    - Subsections (e.g., `vzvirtualmachine.pdf`, `state-swift-enum.pdf`): Root page + leaf children.
  - URLs appear in one PDF, sorted alphabetically, root page first.
- **Functional Requirements**:
  - Crawl URLs to build a comprehensive tree, using navigation/content selectors.
  - Split tree into section trees, identifying sections dynamically (nodes with children).
  - Deduplicate URLs within PDFs, normalize URLs (no trailing slashes/hashes).
  - Use AEST timezone for logs (ISO-like, e.g., `2025-06-01T13:53:00+10:00`).
  - Ensure multi-page PDFs, no duplicate pages.
- **Performance and Reliability**:
  - Single concurrency (`pLimit(1)`), 5 retries with backoff (1s, 2s, 4s, 8s, 16s).
  - 15-second post-scroll delay, 30-second `page.goto` timeout, Chrome/91 User-Agent.
  - Detailed error logs (HTTP status, headers, DOM structure).
- **Environment**:
  - macOS 15.4.1 Sequoia, Node.js 20, TypeScript, AEST (UTC+10).
  - Dependencies: Puppeteer (Apache-2.0), pdf-lib (MIT), p-limit (MIT), chrome-finder (MIT), TypeScript (Apache-2.0).

## Development Plan

### Step 8: Split Documentation into Sections (In Progress)
- **Objective**: Implement `--split-sections` to generate ~3–5 PDFs per root URL, each for a dynamically identified section (root page + immediate leaf children), with root pages first, deduplicated URLs, and alphabetical sorting.
- **Status**: Incomplete. Test (June 1, 2025, 1:53 PM AEST) produced six PDFs for `/virtualization`, correctly splitting top-level sections (e.g., `vzvirtualmachine`), but failed to include subsections like `state-swift.enum` as a separate section tree.
- **Issues**:
  - `buildSectionTree` in `list-sections.ts` limits scraping to depth 1, preventing the URL tree from including deeper subsections (e.g., `state-swift.enum` → `/stopped`).
  - As a result, `splitSectionTrees` in `index.ts` cannot identify `state-swift.enum` as a section with children when starting from `/virtualization`.
- **Sub-Steps**:
  8.1. **Build URL Tree**:
     - **Description**: Crawl URLs to build a single tree with hierarchy (e.g., `{ url: "/virtualization", children: [{ url: "/vzvirtualmachine", children: ["/start()", { url: "/state-swift.enum", children: ["/stopped"] }] }] }`).
     - **Status**: Incomplete. Current implementation limits scraping to depth 1, missing deeper subsections.
     - **Actions**:
       - Update `buildSectionTree` in `list-sections.ts` to remove the depth limit (`depth <= 1` condition).
       - Recursively scrape links at all depths to build a complete URL tree.
       - Test with `/virtualization` to verify deeper subsections (e.g., `state-swift.enum` → `/stopped`) are included.
     - **Milestones**:
       - Code update: June 1, 2025, 3:00 PM AEST.
       - Test with `/virtualization`: June 1, 2025, 4:00 PM AEST.
     - **Validation**:
       - Run `npm run build`.
       - Test command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/" "https://developer.apple.com/documentation/virtualization/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
       - Expect logs to show a fully populated URL tree with deeper subsections.
  8.2. **Generate Section PDFs** (Current):
     - **Description**: Split URL tree into an array of section trees, each rooted at a section’s landing page with immediate leaf children (no subsections). Generate one PDF per tree, starting with the root page, followed by alphabetically sorted leaf children.
     - **Issues**:
       - With the current depth-limited URL tree, subsections like `state-swift.enum` are not fully populated, so they aren’t split into separate section trees.
       - Once `buildSectionTree` is fixed, `splitSectionTrees` should work as intended, as its logic already handles recursive splitting.
     - **Fix**:
       - Ensure `buildSectionTree` provides a complete URL tree (Step 8.1).
       - Verify `splitSectionTrees` correctly processes the updated tree, creating section trees for all sections (e.g., `vzvirtualmachine`, `state-swift.enum`).
       - Confirm `generatePDF` processes each section tree as expected (root page first, sorted leaf children).
     - **Actions**:
       - Update `list-sections.ts` to fix `buildSectionTree` (Step 8.1).
       - Test with `/virtualization` to verify section trees for `vzvirtualmachine` and `state-swift.enum`.
       - Review logs for section tree assignments, child counts, and PDF outputs.
     - **Milestones**:
       - Test with `/vzvirtualmachine`, `/virtualization`: June 1, 2025, 4:00 PM AEST.
       - Verify ~6–7 PDFs for `/virtualization` (e.g., `virtualization.pdf`, `vzvirtualmachine.pdf`, `state-swift-enum.pdf`, etc.).
     - **Validation**:
       - Run `npm run build`.
       - Test command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/" "https://developer.apple.com/documentation/virtualization/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
       - Expect PDFs for each section, including deeper subsections (e.g., `state-swift.enum` with children like `/stopped`).
       - Verify root page first, alphabetical sorting, deduplication, and logs showing recursive section splits.
  8.3. **Optimize Performance**:
     - **Description**: Reduce scraping time with `pLimit(2)` and caching.
     - **Actions**: Update `crawlLinks`, implement caching for visited URLs.
  8.4. **Add Section Metadata**:
     - **Description**: Embed section titles from `<h1>` or page titles in PDFs.
     - **Actions**: Update `generateSinglePDF` to extract metadata.
  8.5. **Handle Edge Cases**:
     - **Description**: Test malformed URLs, missing selectors, network failures.
     - **Actions**: Add test cases, enhance error handling in `crawlLinks` and `generatePDF`.
  8.6. **Implement Unit Tests**:
     - **Description**: Validate section splitting, deduplication, sorting with Jest.
     - **Actions**: Create tests for `splitSectionTrees`, `generatePDF` in `index.test.ts`.
  8.7. **Support Local Timezone**:
     - **Description**: Ensure AEST with `toLocaleString` for all logs.
     - **Actions**: Verify `logWithTimestamp` consistency.

## Environment
- macOS 15.4.1 Sequoia, Node.js 20, TypeScript, AEST (UTC+10).
- Dependencies: Puppeteer, pdf-lib, p-limit, chrome-finder, TypeScript.

## Notes
- **Keybindings**: `Option+Command+A` (stage), `Option+Command+C` (commit). Pending: `Option+Command+P`, `git.commitAll` vs. `git.commit`.
- **File Rename**: `bin/index.js` in `package.json`, verify with `npx site2pdf --help`.
- **Testing**: Run `npm run build`, share logs, PDF counts, duplicates.
- **Contribution**: Maintain `LessonsLearned.md`, `README.md`, `LICENSE` (MIT), `.gitignore`.

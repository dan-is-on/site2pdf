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
  - Each section generates a PDF with its root page first, followed by immediate children (leaf nodes or non-sections), excluding subsections.
- **Data Structures**:
  - **Crawling**: Single URL tree with nodes (URL, children), capturing hierarchy (depth 0: main URL; depth 1: children; depth 2+: grandchildren).
  - **Post-Crawl**: Array of section trees, each rooted at a section’s landing page, containing only immediate children (no subsections). Subsections are separate trees.
  - Example: For `/virtualization`, array includes trees for `/virtualization`, `/vzvirtualmachine`, `/state-swift.enum`.
- **Output**:
  - PDFs in `out/`, named by URL slugs (e.g., `developer-apple-com-documentation-virtualization.pdf`).
  - With `--split-sections`, ~3–5 PDFs per root URL, one per section tree:
    - Main section (e.g., `virtualization.pdf`): Root page + leaf children.
    - Subsections (e.g., `vzvirtualmachine.pdf`, `state-swift-enum.pdf`): Root page + children.
  - URLs appear in one PDF, sorted alphabetically, root page first.
- **Functional Requirements**:
  - Crawl URLs to build a comprehensive tree, using navigation/content selectors.
  - Split tree into section trees, identifying sections dynamically (nodes with children).
  - Deduplicate URLs within PDFs, normalize URLs (no trailing slashes/hashes).
  - Use AEST timezone for logs (ISO-like, e.g., `2025-05-28T09:26:00+10:00`).
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
- **Objective**: Implement `--split-sections` to generate ~3–5 PDFs per root URL, each for a dynamically identified section (root page + immediate children), with root pages first, deduplicated URLs, and alphabetical sorting.
- **Status**: Incomplete. Test (May 27, 2025, 7:35 PM AEST) produced two PDFs, missing root pages due to deduplication. Overnight test with `/virtualization` produced three PDFs, revealing hardcoded `vzvirtualmachine` logic.
- **Sub-Steps**:
  8.1. **Build URL Tree**:
     - **Description**: Crawl URLs to build a single tree with hierarchy (e.g., `{ url: "/virtualization", children: [{ url: "/vzvirtualmachine", children: ["/start()", { url: "/state-swift.enum", children: ["/stopped"] }] }] }`).
     - **Status**: Completed. Verified with 29 depth 1 children, 11 for `/state-swift.enum`.
     - **Actions**: Implemented `buildSectionTree`, optimized leaf node scraping.
  8.2. **Generate Section PDFs** (Current):
     - **Description**: Split URL tree into an array of section trees, each rooted at a section’s landing page with immediate children (no subsections). Generate one PDF per tree, starting with the root page.
     - **Issues**:
       - Hardcoded `vzvirtualmachine` logic in `collectSectionUrls` failed for `/virtualization`.
       - `globalProcessedUrls` skipped root pages and group URLs, producing only two PDFs.
       - No post-crawl analysis to split sections dynamically.
     - **Fix**:
       - Implement `splitSectionTrees` to:
         - Traverse URL tree, identify sections (nodes with children).
         - Create section trees for the main URL and children with grandchildren.
         - Exclude subsections from parent trees, making them separate trees.
       - Replace `collectSectionUrls` with dynamic grouping based on section trees.
       - Remove hardcoded patterns (e.g., `vzvirtualmachine`, `state-swift.enum`).
       - Reset `globalProcessedUrls` per section tree in `generatePDF`.
       - Ensure root pages are first, sorted with `localeCompare`.
       - Log section tree assignments and deduplication.
     - **Milestones**:
       - Code update: May 28, 2025, 6:00 PM AEST, post-test.
       - Test with `/vzvirtualmachine`, `/virtualization`: May 29, 2025, 12:00 PM AEST.
     - **Validation**:
       - Run `npm run build`.
       - Test command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/" "https://developer.apple.com/documentation/virtualization/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
       - Expect ~3–5 PDFs (e.g., `virtualization.pdf`, `vzvirtualmachine.pdf`, `state-swift-enum.pdf`), each starting with its root page.
       - Verify sorting, deduplication, and logs showing section tree splits.
  8.3. **Optimize Performance**:
     - **Description**: Reduce scraping time with `pLimit(2)` and caching.
     - **Actions**: Update `crawlLinks`, implement caching.
  8.4. **Add Section Metadata**:
     - **Description**: Embed section titles from `<h1>` or page titles.
     - **Actions**: Update `generateSinglePDF`.
  8.5. **Handle Edge Cases**:
     - **Description**: Test malformed URLs, missing selectors, network failures.
     - **Actions**: Add test cases, enhance error handling.
  8.6. **Implement Unit Tests**:
     - **Description**: Validate section splitting, deduplication, sorting with Jest.
     - **Actions**: Create tests for `splitSectionTrees`, `generatePDF`.
  8.7. **Support Local Timezone**:
     - **Description**: Use AEST with `toLocaleString` for logs.
     - **Actions**: Update `logWithTimestamp`.
- **Lessons Applied**:
  - Dynamic section detection (May 28, 2025).
  - Avoid hardcoded logic (May 28, 2025).
  - Root page inclusion, semantic grouping, regex validation, TypeScript fixes (May 27, 2025).

## Environment
- macOS 15.4.1 Sequoia, Node.js 20, TypeScript, AEST (UTC+10).
- Dependencies: Puppeteer, pdf-lib, p-limit, chrome-finder, TypeScript.

## Notes
- **Keybindings**: `Option+Command+A` (stage), `Option+Command+C` (commit). Pending: `Option+Command+P`, `git.commitAll` vs. `git.commit`.
- **File Rename**: `bin/index.js` in `package.json`, verify with `npx site2pdf --help`.
- **Testing**: Run `npm run build`, share logs, PDF counts, duplicates.
- **Contribution**: Maintain `LessonsLearned.md`, `README.md`, `LICENSE` (MIT), `.gitignore`.

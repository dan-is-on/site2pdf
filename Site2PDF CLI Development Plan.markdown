# Site2PDF CLI Project Requirements and Plan

## Project Overview
The Site2PDF CLI is a Node.js command-line tool designed to convert web-based documentation, primarily from developer.apple.com, into PDF files. It leverages Puppeteer for web scraping and pdf-lib for PDF generation, supporting customizable content and navigation selectors, URL patterns, and section-based PDF splitting. The tool aims to produce clean, deduplicated, and well-organized PDFs for technical documentation, with robust crawling to handle dynamic web content.

## Requirements
- **Input Parameters**:
  - Main URL (required, e.g., `https://developer.apple.com/documentation/virtualization/vzvirtualmachine/`).
  - URL pattern (optional, regex, default: `^main_url.*` to match all sub-links under the main URL).
  - Content selector (optional, default: `div.router-content div.content` for main content extraction).
  - Navigation selector (optional, default: `.card-body .vue-recycle-scroller__item-view a.leaf-link` for link extraction).
  - `--split-sections` flag (optional, enables separate PDFs for main page and sections).
- **Output**:
  - PDF files saved in the `out/` directory, named using URL slugs (e.g., `developer-apple-com-documentation-virtualization-vzvirtualmachine.pdf`).
  - With `--split-sections`, generate approximately 3–5 PDFs:
    - Main page PDF (e.g., `vzvirtualmachine.pdf`) containing the main URL and top-level methods/properties (e.g., `/start(completionhandler:)`, `/canstart`).
    - Section PDFs (e.g., `state-swift-enum.pdf`) grouping all child URLs under a section (e.g., `/state-swift.enum/stopped`, `/state-swift.enum/running`), excluding subsection top-level pages from parent PDFs to avoid duplication.
- **Functional Requirements**:
  - Crawl the main URL and sub-links matching the provided URL pattern, handling dynamic DOM structures with retries and delays.
  - Deduplicate URLs within and across PDFs using normalized URLs (removing trailing slashes and hashes).
  - Sort URLs alphabetically within each PDF for both split and non-split modes.
  - Use the local system timezone (AEST, UTC+10) for log timestamps, supporting daylight savings if applicable.
  - Support multi-page PDFs for long web content, ensuring no duplicate pages appear within or across PDFs.
  - Each web page appears in exactly one PDF, corresponding to its section or subsection.
- **Performance and Reliability**:
  - Use single concurrency (`pLimit(1)`) to minimize server-side throttling.
  - Implement 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s) for network errors.
  - Apply a 15-second post-scroll delay to ensure dynamic content loads.
  - Set a 30-second timeout for `page.goto` operations.
  - Use a User-Agent (`Chrome/91`) to mimic browser behavior and avoid bot detection.
  - Log detailed error context, including HTTP status, headers, and DOM structure for debugging.
- **Environment**:
  - Operating System: macOS 15.4.1 Sequoia
  - Node.js: Version 20
  - TypeScript: Latest stable version
  - Timezone: AEST (UTC+10, with daylight savings support)
  - Dependencies: Puppeteer (Apache-2.0), pdf-lib (MIT), p-limit (MIT), chrome-finder (MIT), TypeScript (Apache-2.0)

## Development Plan

### Step 8: Split Documentation into Sections (In Progress)
- **Objective**: Enhance the `--split-sections` functionality to generate approximately 3–5 PDFs, each corresponding to the main page or a major section (e.g., `/state-swift.enum`), grouping related URLs (e.g., all `/state-swift.enum/*` URLs in one PDF), with deduplication across PDFs and alphabetical URL sorting within each PDF.
- **Status**: Incomplete. The latest test (May 27, 2025, 2:47 AM AEST) generated 29 PDFs due to over-splitting, with duplicate URLs across PDFs and inefficient leaf node scraping.
- **Sub-Steps**:
  8.1. **Build URL Tree**:
     - **Description**: Develop `list-sections.ts` to recursively crawl section and subsection URLs, constructing a tree structure (e.g., `{ url: "/vzvirtualmachine", children: [{ url: "/state-swift.enum", children: ["/stopped", ...] }, ...] }`).
     - **Status**: Completed. Verified with `/vzvirtualmachine`, producing a tree with 29 children at depth 0 and 11 subsections for `/state-swift.enum` at depth 1. The tree correctly captures section hierarchies.
     - **Actions Taken**: Implemented `buildSectionTree` to export the URL tree, integrated with `normalizeURL` for consistent deduplication, and added logging for debugging.
  8.2. **Generate Section PDFs** (Current):
     - **Description**: Implement `--split-sections` to generate ~3–5 PDFs, each representing a main page or section, with all child URLs (e.g., `/state-swift.enum/stopped`) included in the parent section’s PDF (e.g., `state-swift-enum.pdf`). Ensure deduplication across PDFs, alphabetical URL sorting, and exclusion of subsection top-level pages from parent PDFs.
     - **Issue**: The current implementation in `index.ts` generated 29 PDFs (e.g., `state-swift-enum-stopped.pdf`, `start-completionhandler.pdf`) because `generateNodePDF` created a PDF for every `SectionNode`, regardless of depth. Duplicate URLs appeared across PDFs (e.g., `/state-swift.enum/stopped` in multiple PDFs) due to insufficient cross-PDF deduplication. Scraping leaf nodes (e.g., `/state-swift.enum/resuming`) was inefficient, taking ~20 seconds each despite returning empty link lists.
     - **Fix**:
       - Update `collectSectionUrls` in `index.ts` to group URLs by parent section for nodes at depth > 1 (e.g., all `/state-swift.enum/*` URLs under `/state-swift.enum`).
       - Modify `generateNodePDF` to generate PDFs only for depth 0 (main page) and depth 1 (sections), aggregating child URLs from deeper nodes into the parent section’s PDF.
       - Implement a global `processedUrls` set across all PDFs to prevent duplicate URL processing, ensuring each URL appears in exactly one PDF.
       - Optimize `buildSectionTree` in `list-sections.ts` to skip `getSectionLinks` for leaf nodes (depth > 1 with no children), reducing scraping overhead.
       - Add detailed logging in `generateNodePDF` to track section grouping, PDF counts, and skipped duplicates.
       - Ensure URLs are sorted alphabetically within each PDF using `localeCompare`.
     - **Milestones**:
       - Code implementation and artifact updates: May 28, 2025, 9:00 AM AEST.
       - Test execution and validation: May 28, 2025, 12:00 PM AEST.
     - **Validation**:
       - Run `npm run build` to compile updated `index.ts` and `list-sections.ts`.
       - Execute test command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
       - Expect ~3–5 PDFs in `out/` (e.g., `vzvirtualmachine.pdf`, `state-swift-enum.pdf`, possibly `graphicsdevices.pdf`).
       - Verify `state-swift-enum.pdf` includes all enum cases (e.g., `/stopped`, `/running`, `/paused`, approximately 12–15 pages total) without duplicates.
       - Confirm `vzvirtualmachine.pdf` includes top-level methods/properties (e.g., `/start(completionhandler:)`, `/canstart`) but excludes subsection top-level pages (e.g., `/state-swift.enum/stopped`).
       - Check logs for “Scraping sections from:” only at depth 0–1, “Skipping duplicate” for deduplicated URLs, and section grouping details.
       - Ensure no unexpected URLs (e.g., `/swift/true`) and no runtime errors or navigation timeouts.
  8.3. **Optimize Performance**:
     - **Description**: Reduce scraping time by introducing concurrent requests (e.g., `pLimit(2)`) for non-leaf nodes and caching frequently accessed pages.
     - **Status**: Pending, to be addressed after Step 8.2 completion.
     - **Actions Planned**: Modify `crawlLinks` and `buildSectionTree` to support limited concurrency, implement a cache for page content, and log performance metrics.
  8.4. **Add Section Metadata**:
     - **Description**: Enhance PDFs with section titles or metadata (e.g., extracted from `<h1>` or page titles) to improve readability and navigation.
     - **Status**: Pending.
     - **Actions Planned**: Update `generateSinglePDF` to extract titles and embed as PDF metadata or headers.
  8.5. **Handle Edge Cases**:
     - **Description**: Test and handle malformed URLs, missing selectors, and network failures to ensure robustness.
     - **Status**: Pending.
     - **Actions Planned**: Add test cases for invalid inputs and enhance error handling in `crawlLinks` and `generateSinglePDF`.
  8.6. **Implement Unit Tests**:
     - **Description**: Develop unit tests for section splitting, deduplication, and sorting to ensure reliability.
     - **Status**: Pending.
     - **Actions Planned**: Use Jest to create tests for `collectSectionUrls`, `generateNodePDF`, and `buildSectionTree`.
  8.7. **Support Local Timezone for Logs**:
     - **Description**: Configure `logWithTimestamp` to use the local system timezone (AEST, UTC+10, with daylight savings) via `toLocaleString`, ensuring ISO-like format with offset (e.g., `2025-05-27T17:26:07+10:00`).
     - **Status**: Pending.
     - **Actions Planned**: Update `logWithTimestamp` in `index.ts` and `list-sections.ts`, document in README.
- **Lessons Applied**:
  - Hierarchical section grouping to prevent over-splitting (May 27, 2025, 5:26 PM AEST).
  - Regular expression validation to avoid runtime errors (May 27, 2025).
  - Accurate URL pattern matching for complete tree construction (May 27, 2025).
  - Optimized URL normalization to reduce redundancy (May 27, 2025).
  - Robust crawling with dynamic selectors and anti-throttling measures (May 27, 2025).
  - Mandatory build updates to reflect code changes (May 27, 2025).
  - Explicit type casts and null guards for TypeScript and pdf-lib reliability (May 27, 2025).

## Environment
- **Operating System**: macOS 15.4.1 Sequoia
- **Node.js**: Version 20
- **TypeScript**: Latest stable version
- **Timezone**: AEST (UTC+10, with daylight savings support)
- **Dependencies**:
  - Puppeteer (Apache-2.0): Web scraping and page rendering
  - pdf-lib (MIT): PDF generation and merging
  - p-limit (MIT): Concurrency control
  - chrome-finder (MIT): Chrome executable detection
  - TypeScript (Apache-2.0): Static typing and compilation

## Notes
- **VS Code Keybindings**:
  - Configured: `Option+Command+A` for staging, `Option+Command+C` for committing.
  - Pending Confirmation: `Option+Command+P` for pushing, preference for `git.commitAll` or `git.commit`.
- **File Rename**:
  - `bin/site2pdf.js` renamed to `bin/index.js`.
  - Verify `package.json` includes `"bin": { "site2pdf": "bin/index.js" }` (artifact_id: `4ba5e453-f9e8-45c9-9dc6-fc9e1d4daf18`).
  - Test with `npx site2pdf --help` to confirm CLI functionality.
- **Testing Workflow**:
  - Run `npm run build` after modifying `src/index.ts` or `src/list-sections.ts` to update `dist/`.
  - Share test logs, PDF counts, and details of any duplicate pages or errors.
  - Current test command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
- **Contribution Guidelines**:
  - Maintain `LessonsLearned.md`, `README.md`, `LICENSE` (MIT), and `.gitignore` (excluding `node_modules`, `dist/`, `out/`).
  - Follow TypeScript style guidelines, include detailed test results, and document changes in `LessonsLearned.md`.
- **Dependency Licenses**: All dependencies are permissive and app store-compatible, requiring license notices in distribution.

## Example Usage (Current)
```bash
node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections
```
Generates separate PDFs for sections, but the latest test produced 29 PDFs with duplicates and unsorted URLs.

## Example Usage (Target for Step 8.2)
```bash
node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections
```
Expected to generate ~3–5 PDFs (e.g., `vzvirtualmachine.pdf`, `state-swift-enum.pdf`), with deduplicated, alphabetically sorted URLs, local timezone timestamps, and no duplicate pages.

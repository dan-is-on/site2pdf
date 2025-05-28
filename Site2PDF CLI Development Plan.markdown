# Site2PDF CLI Project Requirements and Plan

## Project Overview
The Site2PDF CLI is a Node.js command-line tool designed to convert web-based technical documentation, primarily from developer.apple.com, into organized PDF files. Utilizing Puppeteer for web scraping and pdf-lib for PDF generation, the tool supports customizable content and navigation selectors, URL patterns, and section-based PDF splitting. Its primary goal is to produce clean, deduplicated, and semantically grouped PDFs for efficient use by developers, with robust crawling to handle dynamic web content and server-side throttling.

## Requirements
- **Input Parameters**:
  - Main URL (required, e.g., `https://developer.apple.com/documentation/virtualization/vzvirtualmachine/`).
  - URL pattern (optional, regex, default: `^main_url.*` to match all sub-links under the main URL).
  - Content selector (optional, default: `div.router-content div.content` for extracting main content).
  - Navigation selector (optional, default: `.card-body .vue-recycle-scroller__item-view a.leaf-link` for extracting navigation links).
  - `--split-sections` flag (optional, enables separate PDFs for the main page and semantic section groups).
- **Output**:
  - PDF files saved in the `out/` directory, named using URL slugs (e.g., `developer-apple-com-documentation-virtualization-vzvirtualmachine.pdf`).
  - With `--split-sections`, generate approximately 3–5 PDFs, each representing a semantic group:
    - Main page PDF (e.g., `vzvirtualmachine.pdf`): Contains the main URL’s content (e.g., overview of `/vzvirtualmachine`).
    - Methods PDF (e.g., `methods.pdf`): Groups all method-related URLs (e.g., `/start(completionhandler:)`, `/pause()`, `/resume()`).
    - Properties PDF (e.g., `properties.pdf`): Groups all property-related URLs (e.g., `/state-swift.property`, `/canstart`, `/canpause`).
    - Enums PDF (e.g., `state-swift-enum.pdf`): Groups the enum section and its children (e.g., `/state-swift.enum/stopped`, `/state-swift.enum/running`).
    - Devices PDF (e.g., `devices.pdf`): Groups device-related URLs (e.g., `/consoledevices`, `/networkdevices`, `/graphicsdevices`).
  - Subsection top-level pages (e.g., `/state-swift.enum/stopped`) are included only in their parent section’s PDF (e.g., `state-swift-enum.pdf`), not in parent PDFs (e.g., `vzvirtualmachine.pdf`), to avoid duplication.
- **Functional Requirements**:
  - Crawl the main URL and sub-links matching the provided URL pattern, handling dynamic DOM structures with retries, delays, and anti-throttling measures.
  - Deduplicate URLs within and across PDFs using normalized URLs (removing trailing slashes and URL hashes).
  - Sort URLs alphabetically within each PDF (e.g., `/error`, `/paused`, `/running` in `state-swift-enum.pdf`) for both split and non-split modes.
  - Use the local system timezone (AEST, UTC+10, with daylight savings support) for log timestamps, formatted as ISO-like strings (e.g., `2025-05-27T19:05:10+10:00`).
  - Support multi-page PDFs for long web content, ensuring no duplicate pages appear within or across PDFs.
  - Ensure each web page appears in exactly one PDF, corresponding to its semantic section or subsection group.
- **Performance and Reliability**:
  - Use single concurrency (`pLimit(1)`) to minimize server-side throttling risks.
  - Implement 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s) for network errors during page loads.
  - Apply a 15-second post-scroll delay to ensure dynamic content loads fully.
  - Set a 30-second timeout for `page.goto` operations to handle slow server responses.
  - Use a User-Agent (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36`) to mimic browser behavior and avoid bot detection.
  - Log detailed error context, including HTTP status codes, response headers, and DOM structure (e.g., div classes, up to 5 body links) for failed selectors, to aid debugging.
- **Environment**:
  - Operating System: macOS 15.4.1 Sequoia
  - Node.js: Version 20
  - TypeScript: Latest stable version
  - Timezone: AEST (UTC+10, with daylight savings support)
  - Dependencies:
    - Puppeteer (Apache-2.0): Web scraping and page rendering
    - pdf-lib (MIT): PDF generation and merging
    - p-limit (MIT): Concurrency control
    - chrome-finder (MIT): Chrome executable detection
    - TypeScript (Apache-2.0): Static typing and compilation

## Development Plan

### Step 8: Split Documentation into Sections (In Progress)
- **Objective**: Enhance the `--split-sections` functionality to generate approximately 3–5 PDFs, each corresponding to a semantic section group (e.g., main page, methods, properties, enums, devices), with all related URLs (including subsections) included in the appropriate PDF, deduplicated across PDFs, and sorted alphabetically within each PDF.
- **Status**: Incomplete. The latest test (May 27, 2025, 7:05 PM AEST) generated individual PDFs for each depth 1 node (e.g., `start-completionhandler.pdf`, `start.pdf`), indicating a failure to group related URLs semantically, resulting in per-webpage PDFs instead of the expected ~3–5 grouped PDFs. The test was stopped after producing 5 PDFs, with more in progress.
- **Sub-Steps**:
  8.1. **Build URL Tree**:
     - **Description**: Develop `list-sections.ts` to recursively crawl section and subsection URLs, constructing a tree structure that captures the hierarchy of documentation pages (e.g., `{ url: "/vzvirtualmachine", children: [{ url: "/state-swift.enum", children: ["/stopped", "/running"] }, { url: "/start(completionhandler:)", children: [] }, ...] }`).
     - **Status**: Completed. The test on May 27, 2025, 7:05 PM AEST verified a tree with 29 children at depth 0 (main page URLs like `/start(completionhandler:)`, `/state-swift.enum`) and 11 children at depth 1 for `/state-swift.enum` (e.g., `/stopped`, `/running`). The tree correctly represents the section hierarchy.
     - **Actions Taken**: Implemented `buildSectionTree` to export the URL tree, integrated with `normalizeURL` for consistent deduplication, and added logging to debug tree construction. Optimized to skip link scraping for leaf nodes (depth > 1) to reduce overhead.
  8.2. **Generate Section PDFs** (Current):
     - **Description**: Implement `--split-sections` to produce ~3–5 PDFs, each representing a semantic section group:
       - Main page: `/vzvirtualmachine`.
       - Methods: All method-related URLs (e.g., `/start(completionhandler:)`, `/start()`, `/pause()`, `/resume()`, `/stop*`, `/requeststop*`, `/save*`, `/restore*`).
       - Properties: All property-related URLs (e.g., `/state-swift.property`, `/canstart`, `/canpause`, `/canresume`, `/canstop`, `/canrequeststop`).
       - Enums: `/state-swift.enum` and its children (e.g., `/stopped`, `/running`, `/paused`).
       - Devices: Device-related URLs (e.g., `/consoledevices`, `/memoryballoondevices`, `/networkdevices`, `/socketdevices`, `/directorysharingdevices`, `/usbcontrollers`, `/graphicsdevices`).
       Ensure each URL appears in exactly one PDF, with alphabetical sorting within PDFs and exclusion of subsection top-level pages from parent PDFs (e.g., `/state-swift.enum/stopped` only in `state-swift-enum.pdf`, not `vzvirtualmachine.pdf`).
     - **Issue**: The current implementation in `index.ts` (artifact_version_id: `e633d510-2510-4d7f-9c6c-ef965c4ae81a`) generates a PDF for each depth 1 node (e.g., `start-completionhandler.pdf`, `start.pdf`), as seen in the test stopped at 19:15:42 on May 27, 2025. The `generateNodePDF` function creates PDFs for every node at depth 0 or 1, and `collectSectionUrls` only groups depth > 1 URLs (e.g., `/state-swift.enum/stopped`) under their parent, treating depth 1 nodes individually. This results in per-webpage PDFs (~29 expected) instead of ~3–5 grouped PDFs. Additionally, insufficient cross-PDF deduplication allows URLs to appear in multiple PDFs, and a pattern mismatch for the main URL (`[27/05/2025, 19:05:16]`) indicates a regex issue.
     - **Fix**:
       - Redefine section grouping in `collectSectionUrls` to aggregate depth 1 nodes into semantic categories (main page, methods, properties, enums, devices), including their depth > 1 children where applicable (e.g., `/state-swift.enum/stopped` in `state-swift-enum.pdf`).
       - Modify `generateNodePDF` to create PDFs only for these semantic groups, not individual depth 1 nodes, limiting output to ~3–5 PDFs.
       - Enhance cross-PDF deduplication using a global `processedUrls` set to ensure each URL appears in exactly one PDF.
       - Fix the regex pattern mismatch in `buildSectionTree` to ensure the main URL (`/vzvirtualmachine`) passes the pattern test.
       - Add detailed logging in `generateNodePDF` to track grouping decisions (e.g., “Grouping /start(completionhandler:), /start() into methods.pdf”) and skipped duplicates.
       - Ensure alphabetical sorting of URLs within each PDF using `localeCompare`.
     - **Milestones**:
       - Code implementation and artifact updates: May 28, 2025, 9:00 AM AEST, pending approval for code changes.
       - Test execution and validation: May 28, 2025, 12:00 PM AEST, after code updates.
     - **Validation**:
       - Run `npm run build` to compile updated `index.ts` and `list-sections.ts`.
       - Execute test command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
       - Expect ~3–5 PDFs in `out/`:
         - `vzvirtualmachine.pdf` (~5 pages, main page content).
         - `methods.pdf` (~20–30 pages, all methods, e.g., `/start(completionhandler:)`, `/pause()`).
         - `properties.pdf` (~10–15 pages, e.g., `/canstart`, `/state-swift.property`).
         - `state-swift-enum.pdf` (~12–15 pages, e.g., `/stopped`, `/running`).
         - `devices.pdf` (~10–15 pages, e.g., `/consoledevices`, `/graphicsdevices`).
       - Verify `state-swift-enum.pdf` includes all enum cases (e.g., `/stopped`, `/running`, `/paused`) without duplicates, sorted alphabetically.
       - Confirm `methods.pdf` groups all methods, sorted alphabetically, with no duplicates.
       - Check `vzvirtualmachine.pdf` excludes subsection top-level pages (e.g., `/state-swift.enum/stopped`, `/start(completionhandler:)`).
       - Ensure logs show grouping details (e.g., “Grouping /start* into methods.pdf”), skipped duplicates, and no pattern mismatch for the main URL.
       - Validate no unexpected URLs (e.g., `/swift/true`) and no runtime errors or navigation timeouts.
  8.3. **Optimize Performance**:
     - **Description**: Reduce scraping time by introducing limited concurrent requests (e.g., `pLimit(2)`) for non-leaf nodes and caching frequently accessed pages to minimize redundant network calls.
     - **Status**: Pending, to be addressed after Step 8.2 completion.
     - **Actions Planned**: Modify `crawlLinks` and `buildSectionTree` to support controlled concurrency, implement a caching mechanism for page content, and log performance metrics (e.g., scraping time per URL).
  8.4. **Add Section Metadata**:
     - **Description**: Enhance PDFs with section titles or metadata (e.g., extracted from `<h1>` tags or page titles) to improve readability and provide context within each PDF.
     - **Status**: Pending.
     - **Actions Planned**: Update `generateSinglePDF` to extract titles and embed them as PDF metadata or section headers, ensuring compatibility with `pdf-lib`.
  8.5. **Handle Edge Cases**:
     - **Description**: Test and handle malformed URLs, missing selectors, and network failures to ensure the tool remains robust under adverse conditions.
     - **Status**: Pending.
     - **Actions Planned**: Add test cases for invalid inputs (e.g., broken URLs, incorrect selectors) and enhance error handling in `crawlLinks`, `getSectionLinks`, and `generateSinglePDF`.
  8.6. **Implement Unit Tests**:
     - **Description**: Develop unit tests to validate section splitting, deduplication, and alphabetical sorting, ensuring long-term reliability and regression prevention.
     - **Status**: Pending.
     - **Actions Planned**: Use Jest to create tests for key functions (`collectSectionUrls`, `generateNodePDF`, `buildSectionTree`), covering normal and edge cases.
  8.7. **Support Local Timezone for Logs**:
     - **Description**: Configure `logWithTimestamp` to use the local system timezone (AEST, UTC+10, with daylight savings) via `toLocaleString`, producing ISO-like timestamps with offset (e.g., `2025-05-27T19:05:10+10:00`).
     - **Status**: Partially implemented. Current logs use AEST (`[27/05/2025, 19:05:10]`), but Step 8.7 will formalize the format.
     - **Actions Planned**: Update `logWithTimestamp` in `index.ts` and `list-sections.ts` to use `toLocaleString` with explicit AEST formatting, document in README.
- **Lessons Applied**:
  - Semantic section grouping to prevent per-webpage PDFs and excessive output (May 27, 2025, 7:26 PM AEST).
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
  - Configured: `Option+Command+A` for staging changes, `Option+Command+C` for committing.
  - Pending Confirmation: `Option+Command+P` for pushing (if added), preference for `git.commitAll` or `git.commit`.
- **File Rename**:
  - `bin/site2pdf.js` renamed to `bin/index.js`.
  - Verify `package.json` includes `"bin": { "site2pdf": "bin/index.js" }` (artifact_id: `4ba5e453-f9e8-45c9-9dc6-fc9e1d4daf18`).
  - Test CLI functionality with `npx site2pdf --help` to confirm correct setup.
- **Testing Workflow**:
  - Run `npm run build` after modifying `src/index.ts` or `src/list-sections.ts` to update `dist/`.
  - Share test logs, PDF counts, and details of any duplicate pages or errors for debugging.
  - Current test command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
  - Latest test (May 27, 2025, 7:05 PM AEST) generated per-webpage PDFs (e.g., `start-completionhandler.pdf`, `start.pdf`), stopped after 5 PDFs, indicating a grouping failure.
- **Contribution Guidelines**:
  - Maintain `LessonsLearned.md`, `README.md`, `LICENSE` (MIT), and `.gitignore` (excluding `node_modules`, `dist/`, `out/`).
  - Follow TypeScript style guidelines, include detailed test results (logs, PDF counts, duplicates), and document changes in `LessonsLearned.md`.
- **Dependency Licenses**: All dependencies are permissive and app store-compatible, requiring license notices in distribution.

## Example Usage (Current)
```bash
node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections
```
Generates per-webpage PDFs (e.g., `start-completionhandler.pdf`, `start.pdf`), with ~29 PDFs expected if run to completion, due to incorrect grouping.

## Example Usage (Target for Step 8.2)
```bash
node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections
```
Expected to generate ~3–5 PDFs (e.g., `vzvirtualmachine.pdf`, `methods.pdf`, `state-swift-enum.pdf`, `properties.pdf`, `devices.pdf`), with deduplicated, alphabetically sorted URLs, local AEST timestamps, and no duplicate pages.

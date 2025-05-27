# Lessons Learned - Site2PDF CLI

This document captures lessons learned during the development of `site2pdf-cli`, a Node.js tool for converting web documentation into PDFs using Puppeteer for web scraping and pdf-lib for PDF generation. These insights, derived from development on macOS 15.4.1 Sequoia, guide ongoing and future work to ensure robust functionality, TypeScript compatibility, and efficient PDF output.

## Lessons Learned

### Initial Development and TypeScript Fixes (Steps 1–4)
1. **Ensure Puppeteer API Compatibility with TypeScript to Prevent Compilation Errors**
   - **Date**: May 27, 2025
   - **Context**: Early development faced TypeScript compilation errors when using `page.waitForTimeout`, which lacked consistent support in Puppeteer’s type definitions across versions.
   - **Issue**: The `waitForTimeout` method caused build failures due to missing type definitions, disrupting the crawling workflow in `index.ts`.
   - **Impact**: Blocked compilation, delaying implementation of core crawling and PDF generation features.
   - **Resolution**: Replace unsupported APIs with TypeScript-compatible alternatives, such as a custom `delay` function using `setTimeout`. Cross-reference Puppeteer’s documentation and type definitions to confirm compatibility.
   - **Action Taken**: Implemented a `delay` function in `index.ts` and `list-sections.ts` to handle timeouts reliably, ensuring TypeScript compliance.

2. **Use Explicit Type Casts for DOM Elements in Puppeteer Evaluations**
   - **Date**: May 27, 2025
   - **Context**: Extracting `href` attributes from links in `page.evaluate` triggered TypeScript errors because `Element` objects lacked `href` properties.
   - **Issue**: The generic `Element` type required casting to `HTMLAnchorElement` to safely access `href`, impacting link extraction in `crawlLinks` and `getSectionLinks`.
   - **Impact**: Compilation errors prevented the tool from collecting sub-links, halting URL tree construction.
   - **Resolution**: Cast `Element` to `HTMLAnchorElement` within `page.evaluate` using `as HTMLAnchorElement[]`. Validate DOM types against Puppeteer’s API and TypeScript’s lib.dom.d.ts.
   - **Action Taken**: Updated `crawlLinks` and `getSectionLinks` to use correct type casts, ensuring robust link extraction.

3. **Simplify Buffer Type Handling to Avoid Complex TypeScript Predicates**
   - **Date**: May 27, 2025
   - **Context**: Merging PDFs with `pdf-lib` caused TypeScript errors in `generatePDF` due to conflicts between `ArrayBufferLike` and `ArrayBuffer` when filtering `pdfBytesArray`.
   - **Issue**: Complex type predicates for `Buffer` objects were error-prone and overly verbose, complicating PDF merging logic.
   - **Impact**: Delayed implementation of multi-page PDF generation, risking runtime errors during buffer processing.
   - **Resolution**: Use direct type assertions (e.g., `as Buffer[]`) and add explicit null checks before `PDFDocument.load` to ensure type safety without convoluted predicates.
   - **Action Taken**: Simplified `generatePDF` with `as Buffer[]` assertions and null guards, streamlining PDF merging.

4. **Implement Null Guards for pdf-lib API Calls to Prevent Runtime Errors**
   - **Date**: May 27, 2025
   - **Context**: The `PDFDocument.load` method in `generateSinglePDF` assumed non-null input, causing runtime errors when `pdfBytes` was empty due to failed page loads.
   - **Issue**: TypeScript didn’t flag potential null returns, leading to crashes during PDF generation.
   - **Impact**: Unreliable PDF output, especially under network errors or timeouts, disrupted test runs.
   - **Resolution**: Add explicit null checks for `pdfBytes` before calling `PDFDocument.load`. Review `pdf-lib` API documentation to identify other potential null cases.
   - **Action Taken**: Added null guards in `generateSinglePDF` and `generatePDF`, ensuring stable PDF generation.

5. **Validate TypeScript Constructs to Avoid Syntax Errors During Fixes**
   - **Date**: May 27, 2025
   - **Context**: While fixing deduplication in `generatePDF`, a typo (`Set<string>()` instead of `new Set<string>()`) introduced new compilation errors.
   - **Issue**: Incorrect constructor syntax broke the `visited` Set instantiation, preventing URL deduplication.
   - **Impact**: Blocked test execution, requiring additional debugging cycles.
   - **Resolution**: Carefully review code changes for syntax accuracy, especially during fixes. Enable TypeScript linters (e.g., ESLint) to catch constructor errors.
   - **Action Taken**: Corrected to `new Set<string>()` in `index.ts`, reinforcing code review practices.

### Robust Crawling and Error Handling (Step 5)
6. **Build Robust Crawling Logic with Dynamic Selectors and Anti-Throttling Measures**
   - **Date**: May 27, 2025
   - **Context**: Initial crawling attempts failed due to incorrect selectors (`div.main`), dynamic DOM structures on developer.apple.com, and server-side rate limiting (`net::ERR_ABORTED` errors).
   - **Issue**: Hardcoded selectors missed content, high concurrency triggered throttling, and insufficient delays led to incomplete page loads. This affected `crawlLinks` and `getSectionLinks`, resulting in incomplete URL trees.
   - **Impact**: Failed to collect sub-links, producing incomplete or empty PDFs and blocking progress on PDF generation features.
   - **Resolution**:
     - Use specific, robust selectors (`div.router-content div.content` for content, `.card-body .vue-recycle-scroller__item-view a.leaf-link` for navigation).
     - Implement 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s) to handle transient network errors.
     - Add a 15-second post-scroll delay to ensure dynamic content loads, a 30-second `page.goto` timeout, and single concurrency (`pLimit(1)`) to avoid throttling.
     - Set a User-Agent (`Chrome/91`) to mimic browser behavior and reduce bot detection.
     - Log detailed error context, including HTTP status, headers, and DOM structure (div classes, up to 5 body links) for failed selectors.
     - Use ISO timestamps (via `logWithTimestamp`) to diagnose timing issues.
   - **Action Taken**: Updated `crawlLinks` and `getSectionLinks` with enhanced logic, retries, delays, and logging, ensuring reliable URL collection.

7. **Mandate Build Updates to Reflect Source Code Changes**
   - **Date**: May 27, 2025
   - **Context**: Tests run without `npm run build` used outdated `dist/index.js`, masking fixes made to `src/index.ts`.
   - **Issue**: Failure to rebuild after source changes caused persistent errors, as the runtime executed stale code.
   - **Impact**: Delayed debugging and feature validation, leading to confusion during test cycles.
   - **Resolution**: Require `npm run build` after any source file changes to update `dist/`. Explicitly document this step in test instructions and development workflows.
   - **Action Taken**: Added `npm run build` to all test instructions and emphasized its importance in development notes.

### Section Splitting and PDF Generation (Step 8)
8. **Enforce Hierarchical Section Grouping to Limit PDF Generation to Semantic Sections**
   - **Date**: May 27, 2025, 5:26 PM AEST
   - **Context**: The `--split-sections` flag in `index.ts` generated 29 PDFs (e.g., `state-swift-enum-stopped.pdf`, `start-completionhandler.pdf`) instead of the expected ~3–5 (e.g., `vzvirtualmachine.pdf`, `state-swift-enum.pdf` grouping all enum cases). This occurred during tests on May 27, 2025, 2:47 AM AEST.
   - **Issue**: The `generateNodePDF` function created a PDF for every `SectionNode` in the URL tree, regardless of depth or semantic role, misinterpreting Step 8.2’s requirement for “separate PDFs for main page, sections, and subsections.” Additionally, the absence of cross-PDF deduplication led to duplicate URLs (e.g., `/state-swift.enum/stopped` appearing in multiple PDFs). Inefficient scraping of leaf nodes (e.g., `/state-swift.enum/resuming`) further slowed execution.
   - **Impact**: The excessive number of PDFs (29 instead of ~3–5) bloated the output, reduced usability, and included redundant content, failing Step 8.2’s requirements. Slow scraping (~20 seconds per leaf node) extended test runtimes unnecessarily.
   - **Resolution**:
     - Define sections as nodes at depth 0 (main page) and depth 1 (major sections, e.g., `/state-swift.enum`), with semantic grouping for child URLs (e.g., all `/state-swift.enum/*` URLs in one PDF).
     - Modify `generateNodePDF` to generate PDFs only for depth 0–1 nodes, aggregating child URLs (depth > 1) into the parent section’s PDF.
     - Implement a global `processedUrls` set across all PDFs to prevent duplicate URL processing.
     - Optimize `list-sections.ts` to skip `getSectionLinks` for leaf nodes (depth > 1 with no children) to reduce scraping overhead.
     - Add detailed logging to track section grouping, PDF counts, and skipped duplicates.
     - Validate output against expected PDF count (~3–5) and page counts (e.g., `state-swift-enum.pdf` with ~12–15 pages for enum cases).
   - **Action Taken**: Updates in progress to `index.ts` for section grouping and deduplication, and to `list-sections.ts` for leaf node optimization. Test results pending.

9. **Validate Regular Expression Construction to Prevent Runtime Errors**
   - **Date**: May 27, 2025
   - **Context**: A test run failed with a `SyntaxError: Invalid regular expression` due to an unescaped `urlPattern` in `index.ts`’s `main` function, processing `args[1]` (`https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*`).
   - **Issue**: The `new RegExp(args[1])` call didn’t escape special characters (e.g., `://`, `/`, `.*`), producing an invalid regex pattern (`^https:\/`) that crashed the tool.
   - **Impact**: No PDFs were generated, completely blocking Step 8.2 progress and requiring urgent fixes.
   - **Resolution**: Implement an `escapeRegExp` function to sanitize regex strings. Wrap `new RegExp` in a try-catch block to validate patterns. Test regex construction with edge cases (e.g., URLs with slashes, wildcards).
   - **Action Taken**: Added `escapeRegExp` and try-catch validation in `index.ts`’s `main`, ensuring robust pattern handling.

10. **Ensure Accurate URL Pattern Matching for Complete URL Tree Construction**
    - **Date**: May 27, 2025
    - **Context**: Earlier tests (e.g., May 27, 2025, 1:39 AM AEST) produced only one PDF because `buildSectionTree` in `list-sections.ts` incorrectly skipped the main URL due to a pattern mismatch.
    - **Issue**: The `urlPattern.test(normalizedUrl)` check in `buildSectionTree` rejected valid URLs (e.g., `https://developer.apple.com/documentation/virtualization/vzvirtualmachine`) due to trailing `.*` or slash inconsistencies in the regex pattern.
    - **Impact**: An incomplete URL tree omitted section and subsection PDFs, failing Step 8.2’s requirement for comprehensive section splitting.
    - **Resolution**: Normalize regex patterns to match base URLs without trailing wildcards or slashes. Enhance logging to debug pattern mismatches, including the URL, pattern, and test result.
    - **Action Taken**: Simplified pattern testing in `list-sections.ts` to ensure valid URLs are included, with detailed logging for diagnostics.

11. **Optimize URL Normalization to Eliminate Redundant Processing**
    - **Date**: May 27, 2025
    - **Context**: Test logs (e.g., May 27, 2025, 1:39 AM AEST) showed multiple `Normalized URL` entries for the same URL in `buildSectionTree` and `collectSectionUrls`, indicating inefficiencies.
    - **Issue**: Repeated calls to `normalizeURL` in `index.ts` and `list-sections.ts` caused unnecessary processing overhead, as URLs were normalized multiple times during tree construction and PDF generation.
    - **Impact**: While not critical, the overhead slowed execution, particularly for large URL trees with many sub-links.
    - **Resolution**: Store pre-normalized URLs in `SectionNode` objects to avoid redundant calls. Restructure `collectSectionUrls` to use `node.url` directly, minimizing normalization.
    - **Action Taken**: Updated `collectSectionUrls` in `index.ts` to leverage pre-normalized URLs, improving performance.

### Planned Features (Steps 8–11)
12. **Enable Customizable Selectors for Broader Website Compatibility**
    - **Date**: Planned
    - **Context**: The tool’s hardcoded selectors (`div.router-content div.content`, `.card-body .vue-recycle-scroller__item-view a.leaf-link`) are tailored to developer.apple.com, limiting applicability to other websites with different DOM structures.
    - **Issue**: Lack of customizable selectors restricts the tool’s reusability for non-Apple documentation sites.
    - **Impact**: Reduces the tool’s versatility, requiring code changes for new websites.
    - **Resolution**: Implement `--content-div` and `--nav-div` CLI arguments to allow user-defined selectors, defaulting to current values. Update `crawlLinks` and `getSectionLinks` to prioritize user-provided selectors.
    - **Action Planned**: Add argument parsing in `index.ts` for Step 8, enhancing flexibility.

13. **Filter Irrelevant URLs to Enhance Crawling Efficiency**
    - **Date**: Planned
    - **Context**: Crawling irrelevant or external pages (e.g., `https://docs.oasis-open.org`) increases runtime, PDF size, and risks server-side throttling.
    - **Issue**: Without filtering, the tool processes unwanted URLs, bloating output and slowing execution.
    - **Impact**: Degrades performance and output quality, particularly for large documentation sites.
    - **Resolution**: Introduce a `--ignore` CLI argument for comma-separated regex patterns (e.g., `/vzerror/.*,https://docs\.oasis-open\.org/.*`) to skip unwanted URLs. Apply filtering in `crawlLinks` and `buildSectionTree`.
    - **Action Planned**: Implement URL filtering in `index.ts` and `list-sections.ts` for Step 9.

14. **Preserve README Content and Clarify Platform-Specific Dependencies**
    - **Date**: Planned
    - **Context**: Updating `README.md` risks overwriting valid content or making untested assumptions about platforms like Linux, which haven’t been validated.
    - **Issue**: Incorrect or unverified setup instructions could mislead users, particularly for non-macOS environments.
    - **Impact**: Reduces portability and user trust in the tool’s documentation.
    - **Resolution**: Retain original README content unless factually incorrect. Add detailed macOS 15.4.1 setup instructions using Homebrew (e.g., `brew install node`, `brew install --cask google-chrome`). Include Linux dependencies as untested, clearly marked. Document all CLI arguments and setup steps.
    - **Action Planned**: Revise README for Step 10, ensuring clarity and platform specificity.

15. **Adapt Tool for App Store Distribution with Non-CLI Dependencies**
    - **Date**: Planned
    - **Context**: The current Node.js implementation relies on CLI dependencies (e.g., Puppeteer with Chrome), which are incompatible with iOS, iPadOS, Android, macOS, and Windows app store sandboxing and GUI requirements.
    - **Issue**: Puppeteer’s Chrome dependency and CLI nature prevent app store distribution, limiting deployment options.
    - **Impact**: Restricts the tool to command-line use, excluding mobile and desktop app markets.
    - **Resolution**: Port the tool to C# using .NET MAUI for cross-platform GUI support. Replace Puppeteer with `HtmlAgilityPack` + `HttpClient` for static HTML crawling and WebView (`WKWebView`, `WebView`, `WebView2`) for dynamic content. Use `PDFSharp` (MIT license) for PDF generation. Implement a server-side crawling component to comply with mobile sandboxing. Ensure app store compliance with privacy manifests and native UI.
    - **Action Planned**: Design and prototype C# port for Step 11, focusing on app store requirements.

## Notes
- **Environment**: All lessons are based on development and testing on macOS 15.4.1 Sequoia, using Node.js 20, TypeScript, and AEST timezone (UTC+10).
- **Contribution Guidelines**: Maintain this file in the repository alongside `README.md`, `LICENSE` (MIT), and `.gitignore` (excluding `node_modules`, `dist/`, `out/`). Contributors should follow TypeScript style guidelines, run `npm run build` before testing, and include detailed test logs with PDF counts.
- **Testing Workflow**: Always run `npm run build` after modifying source files to update `dist/`. Share test logs, PDF counts, and any observed duplicates or errors to facilitate debugging.
- **Dependency Licenses**: Current dependencies (`puppeteer`: Apache-2.0, `pdf-lib`: MIT, `p-limit`: MIT, `chrome-finder`: MIT, `typescript`: Apache-2.0) are permissive and app store-compatible, requiring license notices. Planned C# dependencies (`HtmlAgilityPack`: MIT, `PDFSharp`: MIT) align with these requirements.

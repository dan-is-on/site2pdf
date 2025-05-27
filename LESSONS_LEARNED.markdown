# Lessons Learned - Site2PDF CLI

This document captures lessons learned during the development of `site2pdf-cli`, a Node.js tool for converting web documentation (primarily developer.apple.com) into PDFs using Puppeteer for web scraping and pdf-lib for PDF generation. These insights, derived from development on macOS 15.4.1 Sequoia, guide ongoing work to ensure robust crawling, efficient PDF output, and TypeScript compatibility.

## Lessons Learned

### Initial Development and TypeScript Fixes (Steps 1–4)
1. **Ensure Puppeteer API Compatibility with TypeScript to Prevent Compilation Errors**
   - **Date**: May 27, 2025
   - **Context**: Early development encountered TypeScript compilation errors in `index.ts` due to `page.waitForTimeout`, which lacked consistent support in Puppeteer’s type definitions across versions.
   - **Issue**: The use of `waitForTimeout` caused build failures, as TypeScript couldn’t resolve the method, disrupting the crawling workflow essential for URL collection.
   - **Impact**: Blocked compilation, delaying core features like link extraction and PDF generation, and requiring immediate workarounds.
   - **Resolution**: Replace unsupported APIs with TypeScript-compatible alternatives, such as a custom `delay` function implemented with `setTimeout`. Verify API compatibility by cross-referencing Puppeteer’s documentation and TypeScript type definitions.
   - **Action Taken**: Added a `delay` function in `index.ts` and `list-sections.ts` to handle timeouts reliably, ensuring TypeScript compliance and stable builds.

2. **Use Explicit Type Casts for DOM Elements in Puppeteer Evaluations**
   - **Date**: May 27, 2025
   - **Context**: Extracting `href` attributes from links within `page.evaluate` in `crawlLinks` and `getSectionLinks` triggered TypeScript errors, as `Element` objects lacked `href` properties.
   - **Issue**: The generic `Element` type required explicit casting to `HTMLAnchorElement` to access `href`, critical for building the URL tree.
   - **Impact**: Compilation errors halted link extraction, preventing the tool from collecting sub-links and constructing the section hierarchy.
   - **Resolution**: Cast `Element` to `HTMLAnchorElement` using `as HTMLAnchorElement[]` within `page.evaluate`. Validate DOM types against Puppeteer’s API and TypeScript’s `lib.dom.d.ts` to ensure correctness.
   - **Action Taken**: Updated `crawlLinks` and `getSectionLinks` to use proper type casts, enabling robust link extraction and tree construction.

3. **Simplify Buffer Type Handling to Avoid Complex TypeScript Predicates**
   - **Date**: May 27, 2025
   - **Context**: Merging PDFs in `generatePDF` caused TypeScript errors due to conflicts between `ArrayBufferLike` and `ArrayBuffer` when filtering `pdfBytesArray` for `pdf-lib`.
   - **Issue**: Complex type predicates for `Buffer` objects were error-prone and verbose, complicating the logic for combining multiple PDF pages.
   - **Impact**: Delayed multi-page PDF generation, risking runtime errors during buffer processing and slowing progress on PDF output features.
   - **Resolution**: Use direct type assertions (e.g., `as Buffer[]`) and explicit null checks before `PDFDocument.load` to ensure type safety without convoluted predicates. Review `pdf-lib` type definitions to confirm compatibility.
   - **Action Taken**: Simplified `generatePDF` with `as Buffer[]` assertions and null guards, streamlining PDF merging and improving reliability.

4. **Implement Null Guards for pdf-lib API Calls to Prevent Runtime Errors**
   - **Date**: May 27, 2025
   - **Context**: The `PDFDocument.load` method in `generateSinglePDF` assumed non-null input, leading to runtime errors when `pdfBytes` was empty due to failed page loads or network issues.
   - **Issue**: TypeScript did not flag potential null returns, causing crashes during PDF generation, particularly under unstable network conditions.
   - **Impact**: Unreliable PDF output disrupted test runs, requiring additional error handling to stabilize the tool.
   - **Resolution**: Add explicit null checks for `pdfBytes` before invoking `PDFDocument.load`. Review `pdf-lib` API documentation to identify other potential null cases and implement guards accordingly.
   - **Action Taken**: Added null guards in `generateSinglePDF` and `generatePDF`, ensuring stable PDF generation even under error conditions.

5. **Validate TypeScript Constructs to Avoid Syntax Errors During Fixes**
   - **Date**: May 27, 2025
   - **Context**: While addressing deduplication issues in `generatePDF`, a syntax error (`Set<string>()` instead of `new Set<string>()`) was introduced, breaking the `visited` Set instantiation.
   - **Issue**: The incorrect constructor syntax prevented URL deduplication, leading to compilation errors and redundant link processing.
   - **Impact**: Blocked test execution, necessitating additional debugging to identify and correct the typo.
   - **Resolution**: Conduct thorough code reviews for syntax accuracy during fixes. Enable TypeScript linters (e.g., ESLint with `typescript-eslint`) to catch constructor errors and enforce consistent syntax.
   - **Action Taken**: Corrected to `new Set<string>()` in `index.ts`, reinforcing rigorous code review practices to prevent similar errors.

### Robust Crawling and Error Handling (Step 5)
6. **Design Robust Crawling Logic with Dynamic Selectors and Anti-Throttling Measures**
   - **Date**: May 27, 2025
   - **Context**: Initial crawling attempts in `index.ts` and `list-sections.ts` failed due to incorrect selectors (`div.main`), dynamic DOM structures on developer.apple.com, and server-side rate limiting (`net::ERR_ABORTED` errors).
   - **Issue**: Hardcoded selectors missed critical content, high concurrency triggered throttling, and insufficient delays led to incomplete page loads. This affected `crawlLinks` and `getSectionLinks`, resulting in incomplete URL trees.
   - **Impact**: The tool failed to collect sub-links, producing incomplete or empty PDFs, blocking progress on section splitting and PDF generation features.
   - **Resolution**:
     - Implement specific, robust selectors (`div.router-content div.content` for content, `.card-body .vue-recycle-scroller__item-view a.leaf-link` for navigation) to target developer.apple.com’s DOM.
     - Add 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s) to handle transient network errors.
     - Introduce a 15-second post-scroll delay to ensure dynamic content loads, a 30-second `page.goto` timeout, and single concurrency (`pLimit(1)`) to avoid throttling.
     - Set a User-Agent (`Chrome/91`) to mimic browser behavior and reduce bot detection risks.
     - Enhance logging with `logWithTimestamp` to include HTTP status, headers, and DOM structure (div classes, up to 5 body links) for failed selectors, aiding debugging.
     - Use ISO-like timestamps with local timezone (AEST) to diagnose timing issues.
   - **Action Taken**: Updated `crawlLinks` and `getSectionLinks` with enhanced logic, retries, delays, and detailed logging, ensuring reliable URL collection across tests.

7. **Mandate Build Updates to Reflect Source Code Changes**
   - **Date**: May 27, 2025
   - **Context**: Running tests without executing `npm run build` used outdated `dist/index.js`, masking fixes applied to `src/index.ts`.
   - **Issue**: Failure to rebuild after source changes caused persistent errors, as the runtime executed stale code, leading to confusion during debugging.
   - **Impact**: Delayed validation of fixes, particularly for crawling and PDF generation, requiring repeated test cycles to identify the build issue.
   - **Resolution**: Require `npm run build` after any source file modifications to update `dist/`. Explicitly document this step in test instructions and development workflows to prevent oversight.
   - **Action Taken**: Incorporated `npm run build` into all test instructions and emphasized its critical role in development notes.

### Section Splitting and PDF Generation (Step 8)
8. **Define and Implement Semantic Section Grouping for PDF Generation**
   - **Date**: May 27, 2025, 7:26 PM AEST
   - **Context**: Tests on May 27, 2025 (2:47 AM and 7:05 PM AEST) revealed that the `--split-sections` flag in `index.ts` generated excessive PDFs (~29, e.g., `start-completionhandler.pdf`, `start.pdf`) instead of the expected ~3–5 (e.g., `vzvirtualmachine.pdf`, `state-swift-enum.pdf` grouping all `/state-swift.enum/*` URLs). The 7:05 PM test was stopped after generating per-webpage PDFs for depth 1 nodes.
   - **Issue**: The `generateNodePDF` function created a PDF for every `SectionNode` at depth 0 or 1, treating each depth 1 node (e.g., `/start(completionhandler:)`, `/state-swift.enum`) as a separate section. The `collectSectionUrls` function grouped depth > 1 URLs (e.g., `/state-swift.enum/stopped`) under their parent but treated depth 1 nodes individually, producing per-webpage PDFs. Insufficient cross-PDF deduplication allowed URLs to appear in multiple PDFs (e.g., `/start(completionhandler:)` in link lists). This misaligned with Step 8.2’s requirement for semantic grouping (e.g., all methods in one PDF, `/state-swift.enum/*` in another).
   - **Impact**: The excessive PDFs (~29 instead of ~3–5) bloated the output, reduced usability, and confused users expecting grouped sections. Per-webpage PDFs for methods and properties (e.g., `start.pdf`, `canstart.pdf`) failed to meet the goal of consolidated section PDFs, wasting processing time and disk space.
   - **Resolution**:
     - Redefine “sections” to group depth 1 nodes by semantic category: main page (`/vzvirtualmachine`), methods (e.g., `/start*`, `/pause*`), properties (e.g., `/canstart`, `/state-swift.property`), enums (e.g., `/state-swift.enum` with children), and devices (e.g., `/consoledevices`).
     - Update `collectSectionUrls` to aggregate depth 1 nodes into logical groups (e.g., all methods into one PDF), including their depth > 1 children where applicable.
     - Modify `generateNodePDF` to create PDFs only for these semantic groups, not individual depth 1 nodes, ensuring ~3–5 PDFs.
     - Strengthen cross-PDF deduplication using a global `processedUrls` set to ensure each URL appears in exactly one PDF.
     - Enhance logging in `generateNodePDF` to detail grouping decisions (e.g., “Grouping /start(completionhandler:), /start() into methods.pdf”) and skipped duplicates.
     - Validate output against expected PDF count (~3–5) and page counts (e.g., `state-swift-enum.pdf` with ~12–15 pages for enum cases).
   - **Action Taken**: Proposed updates to `index.ts` for semantic grouping and deduplication, pending approval for code changes. Test results from May 27, 2025, 7:05 PM AEST guide the fix.

9. **Validate Regular Expression Construction to Prevent Runtime Errors**
   - **Date**: May 27, 2025
   - **Context**: A test on May 27, 2025, 1:39 AM AEST failed with a `SyntaxError: Invalid regular expression` in `index.ts`’s `main` function, processing the URL pattern `https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*`.
   - **Issue**: The `new RegExp(args[1])` call did not escape special characters (e.g., `://`, `/`, `.*`), producing an invalid regex pattern (`^https:\/`) that crashed the tool.
   - **Impact**: No PDFs were generated, halting Step 8.2 progress and requiring urgent regex fixes.
   - **Resolution**: Implement an `escapeRegExp` function to sanitize regex strings. Wrap `new RegExp` in a try-catch block to validate patterns. Test regex construction with edge cases, including URLs with slashes and wildcards.
   - **Action Taken**: Added `escapeRegExp` and try-catch validation in `index.ts`’s `main`, ensuring robust pattern handling across tests.

10. **Ensure Accurate URL Pattern Matching for Complete URL Tree Construction**
    - **Date**: May 27, 2025
    - **Context**: Tests on May 27, 2025 (e.g., 1:39 AM AEST) generated incomplete outputs because `buildSectionTree` in `list-sections.ts` skipped valid URLs, including the main URL, due to pattern mismatches. The 7:05 PM test showed the main URL failing the pattern test (`[27/05/2025, 19:05:16]`).
    - **Issue**: The `urlPattern.test(normalizedUrl)` check in `buildSectionTree` rejected URLs (e.g., `https://developer.apple.com/documentation/virtualization/vzvirtualmachine`) due to trailing `.*` or slash inconsistencies in the regex pattern, though tree construction proceeded in some cases.
    - **Impact**: Incomplete URL trees risked missing section and subsection PDFs, failing Step 8.2’s requirement for comprehensive section splitting. The main URL mismatch in the 7:05 PM test indicates a lingering regex issue.
    - **Resolution**: Normalize regex patterns to match base URLs without trailing wildcards or slashes. Enhance logging to debug mismatches, capturing the URL, pattern, and test result. Test pattern matching with representative URLs.
    - **Action Taken**: Simplified pattern testing in `list-sections.ts` and added diagnostic logging, but further fixes are needed for the main URL mismatch.

11. **Optimize URL Normalization to Eliminate Redundant Processing**
    - **Date**: May 27, 2025
    - **Context**: Test logs (e.g., May 27, 2025, 1:39 AM and 7:05 PM AEST) showed multiple `Normalized URL` entries for the same URL in `buildSectionTree` and `collectSectionUrls`, indicating inefficiencies.
    - **Issue**: Repeated calls to `normalizeURL` in `index.ts` and `list-sections.ts` caused unnecessary processing overhead, as URLs were normalized multiple times during tree construction and PDF generation.
    - **Impact**: While not critical, the overhead slowed execution, particularly for large URL trees with numerous sub-links, affecting test performance.
    - **Resolution**: Store pre-normalized URLs in `SectionNode` objects to avoid redundant calls. Restructure `collectSectionUrls` to use `node.url` directly, minimizing normalization operations.
    - **Action Taken**: Updated `collectSectionUrls` in `index.ts` to leverage pre-normalized URLs, improving performance in recent tests.

### Planned Features (Steps 8–11)
12. **Enable Customizable Selectors for Broader Website Compatibility**
    - **Date**: Planned
    - **Context**: The tool’s hardcoded selectors (`div.router-content div.content`, `.card-body .vue-recycle-scroller__item-view a.leaf-link`) are optimized for developer.apple.com, limiting applicability to other documentation sites with different DOM structures.
    - **Issue**: Lack of customizable selectors restricts reusability, requiring code modifications for non-Apple websites.
    - **Impact**: Reduces the tool’s versatility, hindering adoption for diverse use cases.
    - **Resolution**: Implement `--content-div` and `--nav-div` CLI arguments to allow user-defined selectors, defaulting to current values. Update `crawlLinks` and `getSectionLinks` to prioritize user-provided selectors, falling back to defaults.
    - **Action Planned**: Add argument parsing in `index.ts` for Step 8, enhancing flexibility for future tests.

13. **Filter Irrelevant URLs to Enhance Crawling Efficiency**
    - **Date**: Planned
    - **Context**: Crawling irrelevant or external pages (e.g., `https://docs.oasis-open.org`) increases runtime, PDF size, and risks server-side throttling, as seen in early test logs.
    - **Issue**: Without filtering, the tool processes unwanted URLs, bloating output and slowing execution.
    - **Impact**: Degrades performance and output quality, particularly for large documentation sites with many external links.
    - **Resolution**: Introduce a `--ignore` CLI argument for comma-separated regex patterns (e.g., `/vzerror/.*,https://docs\.oasis-open\.org/.*`) to skip unwanted URLs. Apply filtering in `crawlLinks` and `buildSectionTree` before processing links.
    - **Action Planned**: Implement URL filtering in `index.ts` and `list-sections.ts` for Step 9, improving efficiency.

14. **Preserve README Content and Clarify Platform-Specific Dependencies**
    - **Date**: Planned
    - **Context**: Updating `README.md` risks overwriting valid content or making untested assumptions about platforms like Linux, which have not been validated in the project.
    - **Issue**: Incorrect or unverified setup instructions could mislead users, particularly for non-macOS environments, reducing accessibility.
    - **Impact**: Undermines user trust and portability of the tool, complicating adoption on diverse systems.
    - **Resolution**: Retain original README content unless factually incorrect. Add detailed macOS 15.4.1 setup instructions using Homebrew (e.g., `brew install node`, `brew install --cask google-chrome`). Document Linux dependencies as untested, clearly marked. Include all CLI arguments (`--content-div`, `--nav-div`, `--split-sections`) and setup steps.
    - **Action Planned**: Revise README for Step 10, ensuring clarity and platform specificity.

15. **Adapt Tool for App Store Distribution with Non-CLI Dependencies**
    - **Date**: Planned
    - **Context**: The Node.js implementation relies on CLI dependencies (e.g., Puppeteer with Chrome), which are incompatible with iOS, iPadOS, Android, macOS, and Windows app store sandboxing and GUI requirements.
    - **Issue**: Puppeteer’s Chrome dependency and CLI nature prevent app store distribution, limiting deployment to command-line environments.
    - **Impact**: Restricts the tool to CLI use, excluding mobile and desktop app markets where a GUI version could expand reach.
    - **Resolution**: Port the tool to C# using .NET MAUI for cross-platform GUI support. Replace Puppeteer with `HtmlAgilityPack` + `HttpClient` for static HTML crawling and WebView (`WKWebView`, `WebView`, `WebView2`) for dynamic content. Use `PDFSharp` (MIT license) for PDF generation. Implement a server-side crawling component to comply with mobile sandboxing. Ensure app store compliance with privacy manifests, code signing, and native UI.
    - **Action Planned**: Design and prototype C# port for Step 11, focusing on app store requirements.

## Notes
- **Environment**: Lessons are based on development and testing on macOS 15.4.1 Sequoia, using Node.js 20, TypeScript, and AEST timezone (UTC+10, with daylight savings support).
- **Contribution Guidelines**: Maintain this file in the repository alongside `README.md`, `LICENSE` (MIT), and `.gitignore` (excluding `node_modules`, `dist/`, `out/`). Contributors must follow TypeScript style guidelines, run `npm run build` before testing, and include detailed test logs with PDF counts and error details.
- **Testing Workflow**: Always run `npm run build` after modifying source files to update `dist/`. Share test logs, PDF counts, and details of any duplicates or errors to facilitate debugging. Current test command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/" "https://developer.apple.com/documentation/virtualization/vzvirtualmachine/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
- **Dependency Licenses**: Current dependencies (`puppeteer`: Apache-2.0, `pdf-lib`: MIT, `p-limit`: MIT, `chrome-finder`: MIT, `typescript`: Apache-2.0) are permissive and app store-compatible, requiring license notices. Planned C# dependencies (`HtmlAgilityPack`: MIT, `PDFSharp`: MIT) align with these requirements.

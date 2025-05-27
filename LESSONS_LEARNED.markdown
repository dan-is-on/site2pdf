# Lessons Learned - Site2PDF CLI

This document captures lessons learned during the development of `site2pdf-cli`, a Node.js tool for converting web documentation into PDFs using Puppeteer and pdf-lib. These insights ensure robust crawling, PDF generation, and TypeScript compatibility on macOS 15.4.1 Sequoia, guiding ongoing and future development.

## Lessons Learned

### Initial Development and TypeScript Fixes (Steps 1–4)
1. **Use Compatible Puppeteer APIs for TypeScript Compliance**
   - **Date**: May 27, 2025
   - **Context**: Early development faced TypeScript compilation errors with `page.waitForTimeout`, which lacked consistent support in Puppeteer’s type definitions.
   - **Issue**: Unsupported APIs caused build failures, disrupting crawling workflows.
   - **Impact**: Blocked feature implementation and testing.
   - **Resolution**: Replace unsupported APIs with alternatives, such as a `delay` function using `setTimeout`. Cross-check APIs against Puppeteer’s TypeScript definitions.
   - **Action Taken**: Implemented `delay` in `index.ts` and `list-sections.ts` for reliable timeouts.

2. **Ensure Proper Type Casting for DOM Elements in Puppeteer Evaluations**
   - **Date**: May 27, 2025
   - **Context**: Extracting `href` in `page.evaluate` triggered TypeScript errors because `Element` lacks `href`.
   - **Issue**: Missing casts to `HTMLAnchorElement` caused compilation failures.
   - **Impact**: Prevented link extraction for crawling.
   - **Resolution**: Explicitly cast `Element` to `HTMLAnchorElement` in `crawlLinks` and `getSectionLinks`. Validate DOM types against Puppeteer’s API.
   - **Action Taken**: Updated `page.evaluate` with `as HTMLAnchorElement[]`.

3. **Simplify Buffer Type Handling in pdf-lib Operations**
   - **Date**: May 27, 2025
   - **Context**: Merging PDFs with `pdf-lib` caused TypeScript errors due to `ArrayBufferLike` vs. `ArrayBuffer` mismatches in `pdfBytesArray`.
   - **Issue**: Complex type predicates for `Buffer` were error-prone and unnecessary.
   - **Impact**: Delayed PDF merging functionality.
   - **Resolution**: Use direct type assertions (e.g., `as Buffer[]`) and explicit null checks before `PDFDocument.load`. Avoid over-complicated type predicates.
   - **Action Taken**: Simplified `generatePDF` with `as Buffer[]` and null guards.

4. **Guard Against Null Returns in pdf-lib API Calls**
   - **Date**: May 27, 2025
   - **Context**: `PDFDocument.load` assumed non-null input, causing runtime errors for empty `pdfBytes`.
   - **Issue**: TypeScript didn’t flag potential nulls, leading to crashes during PDF merging.
   - **Impact**: Unreliable PDF generation.
   - **Resolution**: Add explicit null checks for `pdfBytes` before `PDFDocument.load`. Document API assumptions for safety.
   - **Action Taken**: Added guards in `generateSinglePDF` and `generatePDF`.

5. **Verify TypeScript Syntax During Code Fixes**
   - **Date**: May 27, 2025
   - **Context**: A fix for `generatePDF` introduced a typo (`Set<string>()` vs. `new Set<string>()`), causing new compilation errors.
   - **Issue**: Incorrect constructor syntax broke deduplication logic.
   - **Impact**: Blocked test execution and delayed progress.
   - **Resolution**: Review code changes for syntax accuracy. Enable TypeScript linters to catch constructor errors.
   - **Action Taken**: Corrected to `new Set<string>()` in `index.ts`.

### Robust Crawling and Deduplication (Steps 5–6)
6. **Implement Robust Crawling with Dynamic Selectors and Anti-Throttling Measures**
   - **Date**: May 27, 2025
   - **Context**: Initial crawling failed due to incorrect selectors (`div.main`), dynamic DOMs, and server-side rate limiting (`net::ERR_ABORTED`).
   - **Issue**: Hardcoded selectors missed content, and high concurrency triggered throttling. Insufficient delays led to incomplete page loads.
   - **Impact**: Generated incomplete URL trees and failed PDFs.
   - **Resolution**:
     - Use precise selectors (`div.router-content div.content`, `.card-body .vue-recycle-scroller__item-view a.leaf-link`).
     - Implement 5 retries with exponential backoff (1–16s), 15s post-scroll delay, 30s `page.goto` timeout, single concurrency (`pLimit(1)`), and User-Agent (`Chrome/91`).
     - Log HTTP status, headers, and DOM structure (div classes, 5 body links) for errors.
     - Add ISO timestamps via `logWithTimestamp` for timing diagnostics.
   - **Action Taken**: Updated `crawlLinks` and `getSectionLinks` with robust logic and enhanced logging.

7. **Ensure Builds Reflect Source Changes**
   - **Date**: May 27, 2025
   - **Context**: Tests used outdated `dist/index.js` because `npm run build` was skipped after updating `src/index.ts`.
   - **Issue**: Outdated builds masked fixes, causing persistent errors.
   - **Impact**: Delayed debugging and feature validation.
   - **Resolution**: Mandate `npm run build` after source changes. Include build instructions in all test workflows.
   - **Action Taken**: Added `npm run build` to test instructions.

8. **Normalize URLs Consistently to Prevent Duplication**
   - **Date**: May 27, 2025
   - **Context**: Trailing slashes and hashes caused duplicate URLs in crawling and PDF generation.
   - **Issue**: Inconsistent `normalizeURL` logic led to redundant processing (e.g., `/vzvirtualmachine` vs. `/vzvirtualmachine/`).
   - **Impact**: Bloated URL trees and duplicate PDF pages.
   - **Resolution**: Use `new URL` in `normalizeURL` to remove trailing slashes and hashes while preserving query parameters. Deduplicate in `visited` Set for crawling and `processedUrls` for PDFs.
   - **Action Taken**: Enhanced `normalizeURL` and added deduplication in `index.ts` and `list-sections.ts`.

### Section Splitting and PDF Generation (Step 8)
9. **Define Semantic Section Boundaries for PDF Generation**
   - **Date**: May 27, 2025, 5:12 PM AEST
   - **Context**: The `--split-sections` flag generated 29 PDFs (e.g., `state-swift-enum-stopped.pdf`) instead of ~3–5 (e.g., `state-swift-enum.pdf` for all enum cases).
   - **Issue**: `generateNodePDF` created a PDF for every `SectionNode`, ignoring hierarchical grouping requirements.
   - **Impact**: Bloated output, reduced usability, and failed Step 8.2.
   - **Resolution**: Group URLs by section (depth 0–1 or semantic parent, e.g., `/state-swift.enum/*`). Limit PDFs to top-level sections. Use global deduplication across PDFs.
   - **Action Taken**: Updating `index.ts` to group URLs in `collectSectionUrls` and restrict `generateNodePDF` to depth 0–1.

10. **Validate Regular Expressions to Prevent Runtime Failures**
    - **Date**: May 27, 2025
    - **Context**: A `SyntaxError: Invalid regular expression` halted execution due to unescaped `urlPattern` in `index.ts`.
    - **Issue**: `new RegExp(args[1])` didn’t escape special characters (e.g., `://`), producing an invalid pattern.
    - **Impact**: No PDFs generated, blocking Step 8.2.
    - **Resolution**: Escape regex characters with `escapeRegExp`. Validate patterns with try-catch. Test edge cases (e.g., URLs with `.*`).
    - **Action Taken**: Added `escapeRegExp` and validation in `index.ts` `main`.

11. **Ensure Accurate URL Pattern Matching for Tree Construction**
    - **Date**: May 27, 2025
    - **Context**: Tests generated only one PDF because the main URL was skipped due to a pattern mismatch in `buildSectionTree`.
    - **Issue**: Strict `urlPattern.test(normalizedUrl)` rejected valid URLs due to trailing `.*` or slash issues.
    - **Impact**: Incomplete URL tree, missing section PDFs.
    - **Resolution**: Normalize patterns to match base URLs. Debug mismatches with detailed logging (e.g., pattern source, test result).
    - **Action Taken**: Simplified pattern testing in `list-sections.ts`.

12. **Optimize URL Normalization to Reduce Redundancy**
    - **Date**: May 27, 2025
    - **Context**: Logs showed multiple `Normalized URL` entries for the same URL, indicating inefficiencies.
    - **Issue**: Repeated `normalizeURL` calls in `buildSectionTree` and `collectSectionUrls` caused performance overhead.
    - **Impact**: Slowed execution, though not critical.
    - **Resolution**: Store pre-normalized URLs in `SectionNode`. Minimize redundant calls in recursive functions.
    - **Action Taken**: Updated `collectSectionUrls` to use `node.url`.

### Planned Features (Steps 8–11)
13. **Enable Customizable Selectors for Cross-Website Compatibility**
    - **Date**: May 27, 2025
    - **Context**: Hardcoded selectors limit reusability across websites with different DOM structures.
    - **Issue**: Non-Apple documentation sites require flexible selectors.
    - **Impact**: Restricts tool applicability beyond developer.apple.com.
    - **Resolution**: Implement `--content-div` and `--nav-div` CLI arguments with defaults (`div.router-content div.content`, `.card-body .vue-recycle-scroller__item-view a.leaf-link`).
    - **Action Taken**: Added argument parsing in `index.ts` for Step 8.

14. **Filter Irrelevant URLs to Enhance Efficiency**
    - **Date**: Planned
    - **Context**: Crawling irrelevant pages (e.g., external links) increases runtime and PDF size.
    - **Issue**: Unfiltered URLs risk throttling and bloat outputs.
    - **Impact**: Slows execution and degrades output quality.
    - **Resolution**: Add `--ignore` CLI argument for regex patterns (e.g., `/vzerror/.*,https://docs\.oasis-open\.org/.*`) to skip unwanted URLs.
    - **Action Planned**: Implement filtering in `crawlLinks` and `buildSectionTree` for Step 9.

15. **Maintain Accurate and Platform-Specific README Content**
    - **Date**: Planned
    - **Context**: Updating `README.md` risks overwriting valid content or assuming untested platforms (e.g., Linux).
    - **Issue**: Incorrect assumptions reduce portability and mislead users.
    - **Impact**: Complicates setup for contributors.
    - **Resolution**: Retain original README unless incorrect. Add macOS 15.4.1 setup with `brew` commands, mark Linux as untested, and document all CLI features.
    - **Action Planned**: Update README for Step 10.

16. **Adapt for App Store Compliance with Non-CLI Dependencies**
    - **Date**: Planned
    - **Context**: CLI dependencies (e.g., Puppeteer with Chrome) are incompatible with app store sandboxing and GUI requirements.
    - **Issue**: Prevents iOS/Android distribution.
    - **Impact**: Limits deployment to CLI environments.
    - **Resolution**: Port to C# with .NET MAUI, using `HtmlAgilityPack` + `HttpClient` for crawling, WebView for dynamic content, and `PDFSharp` for PDFs. Implement GUI and server-side crawling.
    - **Action Planned**: Plan port for Step 11.

## Notes
- **Environment**: Lessons are derived from macOS 15.4.1 Sequoia, Node.js 20, TypeScript, AEST timezone (UTC+10).
- **Contribution**: Include this file in the repository with `README.md`, `LICENSE` (MIT), and `.gitignore` (`node_modules`, `dist/`, `out/`).
- **Testing**: Run `npm run build` after source changes to update `dist/`. Share logs, PDF counts, and page content for debugging.
- **Dependency Licenses**: Node.js dependencies (`puppeteer`: Apache-2.0, `pdf-lib`: MIT, `p-limit`: MIT, `chrome-finder`: MIT, `typescript`: Apache-2.0) and C# dependencies (`HtmlAgilityPack`: MIT, `PDFSharp`: MIT) are permissive, requiring license notices for app store compliance.

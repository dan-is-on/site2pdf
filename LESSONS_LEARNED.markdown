# Lessons Learned - Site2PDF CLI

This document captures lessons learned during the development of `site2pdf-cli`, a command-line tool for crawling websites and generating PDFs using Puppeteer and pdf-lib. These insights cover TypeScript fixes, crawling restoration, and planned features, intended to guide future development and contributions.

## Lessons Learned

| Step | Lesson | Action Taken |
|------|--------|--------------|
| 1 | `waitForTimeout` isn’t universally supported in Puppeteer type definitions, causing compilation errors. | Replaced `waitForTimeout` with a `delay` function using `setTimeout` to ensure TypeScript compatibility. |
| 2 | TypeScript requires explicit casting for DOM elements in `page.evaluate` to access properties like `href`. | Cast `Element` to `HTMLAnchorElement` for safe access to `href` in link extraction. |
| 3 | Complex type predicates for `Buffer` cause TypeScript errors due to `ArrayBufferLike` vs. `ArrayBuffer` conflicts. | Simplified `pdfBytesArray` filter with type assertion `as Buffer[]`, avoiding predicates. |
| 4 | Null checks are critical for type-safe API calls like `PDFDocument.load`, even if TypeScript doesn’t flag them. | Added explicit null guard for `pdfBytes` before `PDFDocument.load` to prevent runtime errors. |
| 4.1 | Typos in constructor calls (e.g., `Set` vs. `new Set`) can introduce new errors during fixes. | Corrected `Set<string>()` to `new Set<string>()` in `generatePDF` to fix instantiation. |
| 5 | Incorrect selectors (e.g., `div.main`) and insufficient specificity fail if the DOM is dynamic; high concurrency and insufficient delays trigger server-side rate limiting, causing `net::ERR_ABORTED`. | Used `div.router-content div.content` with `.link-block.topic a, a.inline-link`, added 5 retries with exponential backoff (1–16s), 15s post-scroll delay, single concurrency (`pLimit(1)`), 30s timeout, and User-Agent (`Chrome/91`); logged HTTP status/headers for errors. |
| 5 | Failing to build after updating `src/index.ts` causes outdated code to run, masking fixes. | Emphasized `npm run build` after replacing `src/index.ts` to ensure `dist/index.js` is updated. |
| 5 | Debugging logs must include enough context (e.g., sample URLs, DOM structure) to diagnose selector failures. | Enhanced logging to show div classes and up to 5 body links on selector failure. |
| 5 | Timestamps in logs are critical for diagnosing timing issues like throttling or timeout failures. | Added ISO timestamps to all logs via `logWithTimestamp`. |
| 5 | Server-side throttling requires sequential processing and delays to avoid bot detection. | Implemented single concurrency and 2s inter-request delay to mitigate rate limiting. |
| 8 (Planned) | Hardcoded selectors limit reusability across websites with different DOM structures. | Planned `--content-div` and `--nav-div` CLI arguments to allow custom selectors, defaulting to `div.router-content div.content` and `.card-body .vue-recycle-scroller__item-view a.leaf-link`. |
| 9 (Planned) | Crawling irrelevant pages increases runtime and PDF size, risking throttling. | Planned `--ignore` CLI argument for comma-separated regex patterns (e.g., `/vzerror/.*,https://docs\.oasis-open\.org/.*`) to skip unwanted URLs. |
| 10 (Planned) | README must preserve original content and separate platform dependencies to avoid assumptions about untested systems (e.g., Linux). | Planned to retain original README content unless incorrect, add macOS 15.4.1 setup with `brew` commands, and separate Linux dependencies (marked untested). |
| 11 (Planned) | CLI dependencies (e.g., `puppeteer` with Chrome) are incompatible with app store sandboxing and GUI requirements. | Planned C# port with .NET MAUI, using non-CLI libraries like `HtmlAgilityPack` + `HttpClient` for crawling and `PDFSharp` for PDF generation to enable app store distribution. |

## Notes
- **Contribution**: Include this file in the repository alongside `README.md`, `LICENSE` (MIT), and `.gitignore` (`node_modules`, `dist/`, `out/`) to document development insights.
- **App Store Context**: Lessons from Step 11 reflect the need for non-CLI dependencies (e.g., avoiding Chrome) to meet iOS/Android sandboxing and GUI requirements for app store apps.
- **macOS Testing**: All lessons are derived from development on macOS 15.4.1 (Sequoia), ensuring compatibility with the target environment.
# Lessons Learned - Site2PDF CLI

This document captures lessons learned during the development of `site2pdf-cli`, a Node.js tool for converting web documentation (primarily developer.apple.com) into PDFs using Puppeteer and pdf-lib. Developed on macOS 15.4.1 Sequoia, these insights ensure robust crawling, dynamic section splitting, and TypeScript compatibility.

## Lessons Learned

### Initial Development and TypeScript Fixes (Steps 1–4)
1. **Ensure Puppeteer API Compatibility with TypeScript**
   - **Context**: Early `index.ts` used `page.waitForTimeout`, unsupported in Puppeteer’s TypeScript definitions, causing build failures.
   - **Issue**: Unresolved methods disrupted crawling, delaying link extraction.
   - **Impact**: Blocked compilation, slowing core feature development.
   - **Resolution**: Replaced with `delay` using `setTimeout`, verified via Puppeteer docs.
   - **Action**: Added `delay` in `index.ts`, `list-sections.ts` for stable builds.
2. **Use Explicit Type Casts for DOM Elements**
   - **Context**: `page.evaluate` in `crawlLinks` failed to extract `href` due to `Element` type errors.
   - **Issue**: Missing `HTMLAnchorElement` casts halted link collection.
   - **Impact**: Prevented URL tree construction.
   - **Resolution**: Cast to `HTMLAnchorElement[]`, validated with `lib.dom.d.ts`.
   - **Action**: Updated `crawlLinks`, `getSectionLinks` for robust extraction.
3. **Simplify Buffer Type Handling**
   - **Context**: PDF merging in `generatePDF` had `ArrayBufferLike` conflicts.
   - **Issue**: Complex predicates complicated logic.
   - **Impact**: Delayed multi-page PDF generation.
   - **Resolution**: Used `as Buffer[]` with null checks, reviewed pdf-lib types.
   - **Action**: Simplified `generatePDF` for reliable merging.
4. **Implement Null Guards for pdf-lib**
   - **Context**: `PDFDocument.load` in `generateSinglePDF` crashed on empty `pdfBytes`.
   - **Issue**: Missing null checks caused runtime errors.
   - **Impact**: Unreliable PDF output under network issues.
   - **Resolution**: Added null guards, reviewed pdf-lib API.
   - **Action**: Updated `generateSinglePDF`, `generatePDF` for stability.
5. **Validate TypeScript Constructs**
   - **Context**: Deduplication fix used `Set<string>()` instead of `new Set<string>()`.
   - **Issue**: Syntax error broke `visited` Set.
   - **Impact**: Blocked testing, required debugging.
   - **Resolution**: Reviewed syntax, enabled ESLint with `typescript-eslint`.
   - **Action**: Corrected to `new Set<string>()`, enforced reviews.

### Robust Crawling and Error Handling (Step 5)
6. **Design Robust Crawling Logic**
   - **Context**: Initial crawling failed due to incorrect selectors and throttling.
   - **Issue**: Hardcoded selectors missed content, high concurrency triggered errors.
   - **Impact**: Incomplete URL trees, empty PDFs.
   - **Resolution**: Used robust selectors, 5 retries with backoff, 15s delay, single concurrency, Chrome/91 User-Agent, detailed logging.
   - **Action**: Updated `crawlLinks`, `getSectionLinks` for reliability.
7. **Mandate Build Updates**
   - **Context**: Tests used stale `dist/index.js` without `npm run build`.
   - **Issue**: Outdated code masked fixes.
   - **Impact**: Delayed validation, confused debugging.
   - **Resolution**: Required `npm run build` in workflows.
   - **Action**: Documented in test instructions.

### Section Splitting and PDF Generation (Step 8)
8. **Define and Implement Semantic Section Grouping**
   - **Context**: Test (May 27, 2025, 7:35 PM AEST) generated two PDFs, missing root pages and expected groups due to hardcoded `vzvirtualmachine` logic.
   - **Issue**: `generateNodePDF` created per-webpage PDFs, `collectSectionUrls` treated depth 1 nodes individually.
   - **Impact**: Bloated output (~29 PDFs), failed usability.
   - **Resolution**: Grouped depth 1 nodes semantically, updated `generatePDF`, ensured deduplication.
   - **Action**: Fixed `index.ts`, but hardcoded logic persisted.
9. **Validate Regular Expression Construction**
   - **Context**: Test (May 27, 2025, 1:39 AM) failed with regex `SyntaxError`.
   - **Issue**: Unescaped characters in `new RegExp` crashed the tool.
   - **Impact**: No PDFs generated.
   - **Resolution**: Added `escapeRegExp`, try-catch, tested edge cases.
   - **Action**: Updated `index.ts` main function.
10. **Ensure Accurate URL Pattern Matching**
    - **Context**: Tests showed main URL mismatches in `buildSectionTree`.
    - **Issue**: Regex inconsistencies skipped valid URLs.
    - **Impact**: Incomplete trees, missing PDFs.
    - **Resolution**: Normalized patterns, added debug logging.
    - **Action**: Updated `list-sections.ts`, pending validation.
11. **Optimize URL Normalization**
    - **Context**: Logs showed redundant `normalizeURL` calls.
    - **Issue**: Overhead slowed execution.
    - **Impact**: Minor performance hit.
    - **Resolution**: Stored pre-normalized URLs in `SectionNode`.
    - **Action**: Updated `collectSectionUrls` for efficiency.
12. **Define Explicit Index Signatures**
    - **Context**: Test (May 27, 2025, 7:32 PM) failed with `TS7053` for `groupNames`.
    - **Issue**: Missing index signature caused type errors.
    - **Impact**: Blocked compilation.
    - **Resolution**: Used `Record<string, string>` for `groupNames`.
    - **Action**: Fixed `index.ts`, enabled testing.
13. **Ensure Root Pages and Prevent Overzealous Deduplication**
    - **Context**: Test (May 27, 2025, 7:35 PM) omitted root pages and produced two PDFs.
    - **Issue**: `globalProcessedUrls` skipped root URLs, `vzvirtualmachine` group absorbed all URLs.
    - **Impact**: Missing root pages, fewer PDFs.
    - **Resolution**: Assigned root URLs to groups, reset `globalProcessedUrls` per group.
    - **Action**: Updated `index.ts`, partially fixed root pages.
14. **Implement Dynamic Section Detection**
    - **Context**: Test with `/virtualization` (May 27, 2025, overnight) produced three PDFs, revealing hardcoded `vzvirtualmachine` logic.
    - **Issue**: `collectSectionUrls` assumed `vzvirtualmachine` as main section, failing for other roots.
    - **Impact**: Non-dynamic solution violated requirements, produced incorrect PDFs.
    - **Resolution**: Dynamically identified sections as nodes with children, removed hardcoded checks.
    - **Action**: Updated `index.ts`, redrafted plan.
15. **Dynamically Identify Sections with Grandchildren**
    - **Context**: Test (May 27, 2025, 7:35 PM) and feedback (May 28, 2025) highlighted missing dynamic section identification.
    - **Issue**: `collectSectionUrls` used hardcoded patterns, missing children with grandchildren as sections.
    - **Impact**: Incorrect section splitting, fewer PDFs, subsections not separated.
    - **Resolution**: Implemented `splitSectionTrees` to split URL tree into section trees, treating children with grandchildren as sections.
    - **Action**: Updated `index.ts`, tested with multiple roots.
16. **Avoid Hardcoded Semantic Groups**
    - **Context**: Test (May 28, 2025) produced `vzvirtualmachine.pdf` with only its root page, as children were split into `methods`, `properties`, `devices`, `other`.
    - **Issue**: `collectSectionUrls` used hardcoded semantic groups, not aligning with section definition (nodes with children).
    - **Impact**: Incomplete `vzvirtualmachine.pdf`, fewer PDFs, non-dynamic solution.
    - **Resolution**: Replaced `collectSectionUrls` with `splitSectionTrees`, removed semantic groups, included all immediate children in section PDFs unless they are sections.
    - **Action**: Updated `index.ts`, tested with `/vzvirtualmachine`, `/virtualization`.
17. **Eliminate Hardcoded URL Path References and Filename Prefixes**
    - **Context**: Test (May 28, 2025) revealed hardcoded `/documentation/virtualization` selectors (lines 120, 144) and `developer-apple-com-documentation-` prefix (line 299, `index.ts`, artifact_version_id: `1f36b4ac-95c0-4092-877e-ed124a401d26`).
    - **Issue**: Selectors limited link collection to virtualization URLs; prefix assumed Apple-specific filenames, breaking dynamic behavior for other roots (e.g., `/swift`).
    - **Impact**: Restricted tool to Apple documentation, produced incorrect filenames, and risked file overwrites.
    - **Resolution**:
      - Replaced hardcoded selectors with `urlPattern`-based filtering.
      - Removed `developer-apple-com-documentation-` prefix, used `generateSlug` for filenames.
      - Added filename counter for unique slugs.
      - Reviewed codebase for hardcoded strings.
      - Tested with diverse URLs (e.g., `/swift`).
    - **Action**: Updated `index.ts`, tested with multiple roots, documented in test instructions.
18. **Ensure Recursive Section Splitting**
    - **Context**: Test (May 27, 2025) with `/virtualization` produced three PDFs, but failed to recurse subsections (e.g., `state-swift.enum` lacked children).
    - **Issue**: `splitSectionTrees` only processed immediate children, missing deeper sections with children.
    - **Impact**: Incomplete section PDFs, missing subsections like `state-swift.enum` with children (e.g., `/stopped`).
    - **Resolution**: Revise `splitSectionTrees` to recursively identify sections at all depths, ensuring subsections are separate trees with their immediate children.
    - **Action**: Update `index.ts`, test with `/virtualization` and `/vzvirtualmachine`, verify PDF outputs.
19. **Avoid Nesting Markdown Code Fences in Artifacts**
    - **Context**: Initial artifact for requirements and plan (May 28, 2025) included nested triple backticks within `text/markdown` content.
    - **Issue**: Nested code fences caused rendering issues, violating artifact formatting guidelines.
    - **Impact**: User had to manually fix the artifact, wasting time.
    - **Resolution**: Ensure `text/markdown` artifacts contain plain Markdown without additional code fences.
    - **Action**: Corrected artifact formatting, re-submitted plan.
20. **Ensure Proper Artifact Line Breaks and Whitespace**
    - **Context**: Artifacts (May 28, 2025) failed to render correctly due to potential line break or whitespace issues.
    - **Issue**: Incorrect line breaks or indentation within `<xaiArtifact>` tags caused rendering problems in the user’s client.
    - **Impact**: User could not easily copy or view the artifact content, leading to frustration.
    - **Resolution**: Ensure artifact content is a continuous block of plain Markdown with consistent line breaks and no extraneous whitespace.
    - **Action**: Reformatted artifacts to ensure proper rendering, re-submitted plan.
21. **Remove Depth Limits in URL Tree Construction**
    - **Context**: Test (June 1, 2025, 1:53 PM AEST) with `/virtualization` produced six PDFs, but failed to include subsections like `state-swift.enum` as a separate section tree.
    - **Issue**: `buildSectionTree` limited scraping to depth 1, preventing deeper subsections from being populated in the URL tree.
    - **Impact**: `splitSectionTrees` couldn’t identify `state-swift.enum` as a section with children, missing its PDF (e.g., `state-swift-enum.pdf`).
    - **Resolution**: Remove the depth limit in `buildSectionTree` to recursively scrape links at all depths, ensuring a complete URL tree.
    - **Action**: Update `list-sections.ts`, test with `/virtualization`, verify deeper subsections in the tree and resulting PDFs.

### Planned Features (Steps 8–11)
22. **Enable Customizable Selectors**
    - **Context**: Hardcoded selectors limit non-Apple site compatibility.
    - **Resolution**: Add `--content-div`, `--nav-div` arguments.
    - **Action**: Update `index.ts` for Step 8.
23. **Filter Irrelevant URLs**
    - **Context**: External URLs bloat output, risk throttling.
    - **Resolution**: Add `--ignore` regex argument.
    - **Action**: Implement filtering for Step 9.
24. **Preserve README Content**
    - **Context**: Updates risk incorrect platform assumptions.
    - **Resolution**: Retain valid content, document macOS setup.
    - **Action**: Revise README for Step 10.
25. **Adapt for App Store**
    - **Context**: CLI dependencies incompatible with app stores.
    - **Resolution**: Port to C# with .NET MAUI, use `HtmlAgilityPack`, `PDFSharp`.
    - **Action**: Prototype for Step 11.

## Notes
- **Environment**: macOS 15.4.1 Sequoia, Node.js 20, TypeScript, AEST.
- **Contribution Guidelines**: Maintain `LessonsLearned.md`, `README.md`, `LICENSE` (MIT), `.gitignore`. Run `npm run build`, share logs, PDF counts.
- **Testing Workflow**: Current command: `node bin/index.js "https://developer.apple.com/documentation/virtualization/" "https://developer.apple.com/documentation/virtualization/.*" --content-div="div.router-content div.content" --nav-div=".card-body .vue-recycle-scroller__item-view a.leaf-link" --split-sections`.
- **Dependency Licenses**: Puppeteer (Apache-2.0), pdf-lib (MIT), p-limit (MIT), chrome-finder (MIT), TypeScript (Apache-2.0).

# Porting "Open Selected Links" from CRX (CRXJS / Vite) to WXT — Conversion Plan

Status: Draft — No code changes will be made at this time. This document is a migration/spec plan only. Wait for explicit approval before applying any edits.

This document describes a concrete, step-by-step plan to port the existing CRX-based Chrome extension ("Open Selected Links") to the WXT framework. It is intentionally implementation-focused (what to change and where) but does not provide line-level diffs. Use it as a checklist and guide while performing the migration.

Summary of repository layout (relevant files)
- src/manifest.ts — manifest generation (CRXJS)
- src/background/index.ts — background/service worker logic (context menus, commands)
- src/contentScript/* — content script, extractor, message handling
- src/popup/* and html/popup.html — popup UI and its TypeScript entry
- src/options/* and html/options.html — options UI and its TypeScript entry
- src/common/* — shared logic: extract-links.ts, settings.ts
- vite.config.ts, tsconfig.json, package.json — build tooling and scripts
- src/global.d.ts — ambient types

Primary goals
- Produce a WXT-compatible package reproducing current functionality:
  - Context menu & command triggers
  - Content-script link extraction and highlighting
  - Popup and options UI (settings persistence)
  - Window/tab creation, tab-group handling, display selection, discarding/focus flags
- Minimize source-level churn by centralizing runtime differences behind a compatibility boundary if/when needed.
- Adjust build/packaging so WXT packaging artifacts are produced.

High-level migration strategy
1. Audit and inventory runtime APIs and manifest entries.
2. (Optional) Add a small compatibility wrapper if/when supporting multiple runtimes becomes necessary — for now we will not add a runtime shim (per current decision).
3. Produce a WXT-compatible manifest JSON derived from src/manifest.ts (or a build-time emitter).
4. Update build pipeline (vite.config.ts, package.json) to produce the WXT package (dist layout + pack step).
5. Adjust any code that depends on Chrome-only features without WXT equivalents (feature-detect and fallback).
6. Update typings and tests.

Detailed migration tasks

A. Inventory / Audit
- Search the codebase for all chrome.* usages and list which APIs are used:
  - chrome.tabs (create, update, query, sendMessage, discard)
  - chrome.windows (create, WINDOW_ID_NONE, WINDOW_ID_CURRENT)
  - chrome.tabGroups (query, group, update, TAB_GROUP_ID_NONE)
  - chrome.contextMenus (create, removeAll, onClicked)
  - chrome.commands (onCommand)
  - chrome.scripting (insertCSS, executeScript)
  - chrome.storage.local (get, set)
  - chrome.runtime.id
  - chrome.system.display (getInfo)
  - chrome.runtime.onMessage / runtime.sendMessage
- Document any programmatic content-script injection paths so the manifest or build step can register scripts declaratively if needed.

B. Manifest and packaging
- Generate a concrete manifest JSON suitable for WXT packaging. Options:
  - Add a build-step script that imports the CRX manifest generator and writes `dist/manifest.json` (this is safest).
  - Or author a WXT-target manifest JSON and maintain it alongside src/manifest.ts if you plan to keep CRX builds.
- Ensure the manifest includes:
  - background/service_worker registration in the shape WXT expects
  - content_scripts entries (or mark for programmatic injection)
  - permissions and host_permissions
  - web_accessible_resources (popup/options assets if needed)
- Confirm icons and public assets copy into the WXT package.

C. Build pipeline changes
- Add new npm script(s) for WXT packaging:
  - `wxt:build` — run the normal Vite build, then emit a WXT-ready manifest.json into the output directory.
  - (Optional) `wxt:pack` — run the WXT packer/CLI if available to create the final artifact.
- Update vite.config.ts so output directory and asset layout match WXT expectations (e.g., `dist/`).
- If currently using @crxjs/vite-plugin, avoid using it for the WXT flow or gate it behind conditional build profiles so CRX-specific behavior does not interfere.

D. Runtime compatibility (no shim for now)
- Decision: do not add a runtime shim at this time. Rationale:
  - WXT is being used as a build/test harness and will provide or the tests will mock chrome.* APIs (vitest-chrome is present in devDependencies).
  - Avoid early abstraction; add a targeted wrapper later only if multi-runtime support (e.g., Firefox) is required.
- Implication:
  - Existing code continues to call chrome.* directly.
  - Tests and WXT runtime must supply compatible mocks or polyfills when running in non-Chrome environments.

E. Messaging and content script interaction
- Ensure message semantics are validated in the target test harness:
  - If the test harness or WXT provides promise-based sendMessage, tests should align with that or use the provided polyfills.
- For programmatic injection (scripting.executeScript / insertCSS), prefer:
  - Declarative content_scripts in the manifest if WXT doesn't support programmatic injection during the same lifecycle.
  - Otherwise retain programmatic injection but confirm WXT permits the used APIs.

F. Feature detection and graceful degradation
- Identify features that might be missing in alternate runtimes and add guards:
  - chrome.tabGroups — if absent, hide tab-group UI, skip grouping.
  - chrome.system.display — if absent, hide display-select UI.
- Keep graceful fallbacks in code (feature-detect at runtime), so future porting is easier.

G. Types and test configuration
- Keep src/global.d.ts and @types/chrome for development.
- Configure Vitest/WXT test setup to register necessary globals/mocks (vitest.init.ts is present).
- If tests run in WXT harness, ensure that the harness exposes the expected chrome.* APIs or that tests stub them.

H. Tests and CI
- Update CI scripts:
  - Add a step that builds the WXT manifest and optionally packages the artifact for integration tests.
  - Run unit tests with vitest as before; ensure test setup provides chrome mocks.
- Add smoke tests that validate:
  - Popup/options UI loads and saves settings.
  - Background context menus appear and trigger actions.
  - Content script extraction works and highlight messages function properly.

I. Validation checklist (manual & automated)
- Popup opens and shows links from current tab.
- Options page persists and loads settings via chrome.storage.local.
- Context menu and keyboard commands trigger the correct background flows.
- makeTabsForLinks handles deduplication, discard, focus, and tab-group behavior.
- Content script injection and messaging across frames work as expected.

J. Documentation & next steps
- Update README with:
  - New `wxt:build` script and instructions for producing the WXT manifest.
  - Notes explaining that no runtime shim has been added yet and the reason.
- When ready to actually apply code changes:
  - Implement the manifest emitter or generator script.
  - Add build scripts and (optionally) a `scripts/generate-wxt-manifest.js` helper.
  - Run smoke tests and iterate.

Migration checklist (what to do, in order)
- [ ] Audit chrome.* API usage and document feature flags.
- [ ] Decide on a final manifest strategy (generate from src/manifest.ts vs. author a WXT manifest).
- [ ] Add `wxt:build` script that produces dist/ + manifest.wxt.json (no code changes yet).
- [ ] Update CI to exercise the `wxt:build` flow.
- [ ] Add runtime feature detection (tabGroups, system.display) where not already present.
- [ ] Run manual smoke tests in WXT/test harness and fix issues.
- [ ] If multi-runtime support becomes a goal, implement a small runtime wrapper/shim and add tests for it.

Estimated effort
- Minimal (manifest + packaging changes only): 1–2 days
- Moderate (add feature detection, test adjustments, iterative fixes): 3–5 days
- Larger (if core APIs lack equivalents and require redesign): 1+ weeks

Notes about future shim
- When/if Firefox or another runtime is targeted:
  - Add a small shim or wrapper module that centralizes all chrome.* usage.
  - Use Vite/TypeScript aliasing to swap the shim for test or alternate runtime implementations.
  - Keep the shim thin initially (pass-through) and add normalization only for APIs that differ meaningfully.

If you'd like, I can update this plan further (e.g., include a precise manifest mapping, a sample `scripts/generate-wxt-manifest.js` outline, or concrete package.json/vite changes). I will not make any source edits until you explicitly approve them.

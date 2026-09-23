# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Extension Does

"Open Selected Links" is a browser extension that extracts all HTTP/HTTPS links from selected text on a web page and opens them in tabs, a new window, or a tab group. It can be triggered via right-click context menu, keyboard shortcut, or the extension popup.

## Build Commands

Uses **Bun** as the package manager and **Vite** with CRXJS for bundling.

```bash
bun run build          # Chrome build (type-checks first)
bun run build-ff       # Firefox build (sets BUILD_TARGET=firefox)
bun run dev            # Dev server with hot reload
bun run test           # Run tests with Vitest
bun run coverage       # Run tests with coverage
bun run fmt            # Format with Prettier
bun run zip            # Build + zip for Chrome distribution
bun run zip-ff         # Build + zip for Firefox distribution
```

Output goes to `build/`. The `build/` and `package/` directories are generated; ignore them.

## Architecture

**Data flow:**
1. User selects text → triggers context menu / command / popup button
2. Background script (`src/background/index.ts`) creates an `OSLSession` and sends a message to the content script
3. Content script (`src/contentScript/index.ts`) calls the extractor and returns links + labels
4. `makeTabsForLinks()` in `src/common/extract-links.ts` creates tabs/windows/groups

**Key source files:**
- `src/background/index.ts` — Service worker; registers context menus, keyboard commands, and orchestrates sessions
- `src/contentScript/index.ts` + `src/contentScript/extractor.ts` — Injected into pages; DOM link extraction
- `src/popup/index.ts` — The most complex file (~1500 lines); handles UI, link filtering/deduplication, display detection, tab group UI
- `src/common/extract-links.ts` — `OSLSession` class (message-based communication) and `makeTabsForLinks()` (tab/window/group creation)
- `src/common/settings.ts` — Settings stored in `browser.storage.local`
- `src/manifest.ts` — Generates both Chrome and Firefox manifests
- `vite.config.ts` — Build config, including the Firefox manifest post-build plugin

All code uses `browser` from `webextension-polyfill` (never `chrome` directly).

## Firefox Compatibility

The extension maintains a **single source tree** for both Chrome and Firefox, using a graceful degradation model. Firefox support requires careful handling:

### Build-time manifest differences (`src/manifest.ts` + `vite.config.ts`)
When `BUILD_TARGET=firefox`, a post-build Vite plugin runs `generateFirefoxManifest()` which transforms the Chrome manifest:
- Replaces `background.service_worker` with `background.scripts` array
- Adds `browser_specific_settings.gecko.id: "@open-selected-links-ff"` (required for Firefox)
- Removes `system.display` permission (unsupported in Firefox)
- Removes `use_dynamic_url` from `web_accessible_resources` (unsupported in Firefox MV3)
- Removes the `key` field (Chrome-only signing key)

### Runtime feature detection
Firefox lacks the `system.display` API. Tab groups are supported in Firefox ESR 140+. The code handles this:
- `browser.system.display.getInfo()` is wrapped in try-catch; on failure, multi-display mode silently disables
- `browser.tabGroups` is checked for `undefined` before use; the tab group UI is hidden if unsupported (older browsers only)
- `getAllTabGroups()` returns `[]` on error

### Firefox quirk in popup (`src/popup/index.ts`)
`getCurrentTabId()` contains a retry on `TypeError` — it catches the error and retries the *exact same* `browser.tabs.query()` call. This was empirically discovered to work around a Firefox timing/race condition in popup initialization. Do not remove this.

### Keystroke redirect behaves differently in Chrome vs. Firefox (`src/popup/index.ts`)
`setupFilter()`'s `document.body` keypress listener redirects any keystroke into the filter by calling `filterInput.focus()` — it does *not* redispatch the original event (redispatching an event that's still mid-dispatch throws `InvalidStateError` regardless of target; this is a DOM-spec violation, not browser-specific, and was a real bug fixed in this codebase). In Chrome, moving focus synchronously while the native keypress is still bubbling is enough for the browser's own default action to insert that same character into the newly-focused filter. Firefox does not retroactively redirect the *character* — only focus moves; typing continues normally from the next keystroke. This is a genuine cross-browser timing difference, empirically verified via geckodriver — don't "fix" Firefox to match Chrome here, and don't assert character-for-character parity in cross-browser tests of this path.

## Testing

Tests live in `test/`. Uses Vitest with happy-dom for DOM simulation.
- `test/happydom.init.ts` — registers DOM globals
- `test/chrome.init.ts` — mocks `chrome.runtime.id` for the polyfill

happy-dom's `TreeWalker` with `SHOW_TEXT` does not descend into element children (`walker.firstChild()`/`nextNode()` return nothing past the root), so DOM-walking code like `highlightRegex` in `src/popup/index.ts` cannot be unit tested — it's covered by Playwright e2e tests instead (see below). happy-dom *does* correctly implement the `dispatchEvent` reentrancy check (throws `InvalidStateError` when a currently-dispatching event is redispatched), so that class of bug is unit-testable.

Run a single test file: `bunx vitest run test/filename.test.ts`

### E2E Tests

```bash
bun run test:e2e         # Chrome e2e (builds Chrome version first)
bun run test:e2e-ff      # Firefox e2e (builds Firefox version first)
```

**Chrome e2e** (`test/e2e.test.ts`): Uses Playwright's `chromium.launchPersistentContext` with `--load-extension`. Extension ID is stable due to the `key` field in `manifest.json`. Tests run headless=false (required for Chrome extensions).

**Firefox e2e** (`test/e2e-firefox.test.ts`): Uses geckodriver's HTTP API directly (not Playwright's Firefox). Requires `firefox-esr` and `firefox-esr-geckodriver` packages. The test `beforeAll`:
1. Spawns geckodriver on port 4455
2. Creates a Firefox session with a temp profile and `xpinstall.signatures.required: false`
3. Sideloads the extension as a temporary addon via `POST /session/{id}/moz/addon/install`
4. Polls `prefs.js` for `extensions.webextensions.uuids` to get the dynamic UUID
5. Navigates to `moz-extension://{uuid}/html/popup.html`

Firefox ESR 140 has `browser.tabGroups` defined (via `webextension-polyfill`), so the tab-group-ui shows. The tab group visibility test adapts to the actual runtime behavior rather than asserting a fixed value.

### Real link extraction in e2e tests
Both builds ship with `activeTab` only, no persistent host permissions — real users grant it by clicking the toolbar icon, a gesture neither Playwright nor WebDriver can simulate. `test/e2e.test.ts` and the original three `test/e2e-firefox.test.ts` tests only check static UI presence for this reason. Tests that need actual link rows use `test/e2e-helpers.ts`'s `buildPermissiveExtension()`, which copies `build/` to a temp dir and adds a narrow `host_permissions: ["http://127.0.0.1/*"]` grant so the content script can inject into local test pages — the checked-in manifest and `build/` output are never touched. `popup.html?tab=<id>` (read in `getCurrentTabId()`) lets tests point the popup at a specific tab instead of relying on "active tab in current window."

- `test/e2e-popup-behavior.test.ts` (Chrome) and the tests appended to `test/e2e-firefox.test.ts` (Firefox) use this pattern to drive real filtering, keyboard nav, and link-extraction scenarios end-to-end. They're excluded from the Vitest run (`vite.config.ts` `test.exclude`) since they're Playwright specs, and `playwright.config.ts`'s `testMatch` includes `e2e-popup-behavior.test.ts` for the `chromium` project.
- Firefox's WebDriver harness needs `execute/async` (not `execute/sync`) for any `browser.*` call that returns a Promise, and must navigate to an extension page *before* calling `browser.tabs.query(...)` — a fresh tab starts on `about:blank`, which has no `browser` global. Keyboard input goes through the W3C Actions endpoint using normalized key values (e.g. `U+E015` for ArrowDown, `U+E00D` for Space).

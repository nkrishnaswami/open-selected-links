# Porting "Open Selected Links" from CRX (CRXJS / Vite) to WXT — Conversion Plan

Status: Draft — No code changes will be made at this time. This document is a migration/spec plan only. Wait for explicit approval before applying any edits. All WXT artifacts will be generated in a separate sibling directory ../open-selected-links-xp to keep this repository unchanged until the migration is verified.

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

Important note about content scripts and WXT
- WXT is a build/test framework: it does not replace the browser's extension runtime APIs. However, WXT's source-level project configuration and test harness expect content scripts to be declared/registered differently from some CRX/Vite workflows that rely on dynamic runtime asset resolution via import assertions (e.g., import foo from '... ?script').
- The repository currently uses programmatic injection:
  - src/common/extract-links.ts imports the content script path using `import contentScriptPath from '../contentScript/index?script'` and injects it at runtime with `chrome.scripting.executeScript({ files: [contentScriptPath], ... })`
  - It also inserts CSS by importing contentCss from '../contentScript/index.css?inline' and calling `chrome.scripting.insertCSS`.
- For WXT testing/packaging you must ensure the content script and CSS are present in the final packaged layout at stable paths that your runtime code passes to chrome.scripting.executeScript / insertCSS or else register the content script declaratively in the manifest in a way WXT expects.
- In WXT projects, content scripts are typically declared in source via entrypoint files (for example, under an entrypoints/ directory), and WXT generates the manifest content_scripts from those definitions. If you choose that route later, you would move the current src/contentScript/index.ts logic into a WXT content-script entrypoint and configure matches/run_at/all_frames in source. This is optional if you keep programmatic injection for minimal change.

Two recommended migration approaches (both supported by WXT; choose based on test/packaging constraints) — all migration work will target a separate sibling directory: ../open-selected-links-xp

Option A — Keep programmatic injection (smallest runtime change)
- What to do:
  1. Ensure your build emits the content script file as a distinct entry or asset with a predictable path inside the package (for example build/assets/contentScript.[hash].js or build/contentScripts/index.js).
  2. Ensure that path is what contentScriptPath resolves to when you import it with ?script (CRXJS/Vite plugin currently handles that). If you switch away from @crxjs/vite-plugin for WXT builds, replicate that behavior by ensuring the bundler outputs a static file and that your manifest/wxt config does not strip or relocate it.
  3. Ensure web_accessible_resources and packaging rules allow the background/service worker to inject the file at runtime. Some packagers or test harnesses will block programmatic injection of files unless they are exposed as web-accessible resources.
  4. For CSS, either keep using insertCSS with the inline content (contentCss) or ensure a CSS asset is present and permitted to be injected.
  5. Update your WXT build step to copy any built content script/CSS into the package root or to an expected path; update any manifest generation step to preserve those paths.
- Pros:
  - Minimal changes to runtime code; OSLSession.setup continues to dynamically inject as before.
  - Keeps per-frame injection semantics and fine control over when scripts are added.
- Cons:
  - Slightly more fragile packaging: you must guarantee stable asset paths and that the packager exposes the assets for runtime injection.

Option B — Declare content script(s) in the manifest (recommended for test stability)
- What to do:
  1. Add a content_scripts entry to the manifest (or to the WXT source manifest) declaring your content script and CSS. Example conceptual fields:
     - matches: ['<all_urls>'] or a narrower set of matches
     - js: ['assets/contentScript.js'] (the path in the packaged artifact)
     - css: ['assets/contentScript.css'] (optional)
     - run_at: 'document_idle' (or whichever timing you need)
     - all_frames: true (if you need the script in all frames)
  2. Modify src/common/extract-links.ts OSLSession.setup to treat `chrome.tabs.sendMessage(... 'ping' ...)` returning an unexpected result as a signal that the content script wasn't injected, but do not attempt to executeScript if the manifest-declared script should already be present. You can keep a short fallback path that tries to inject if the ping fails (useful for dev pages), but for WXT packaged builds the manifest will guarantee the script is present.
  3. Ensure vite.config.ts builds the content script as a separate chunk that ends up at the path you list in the manifest. The existing rollup manualChunks can be used to force a contentScript chunk; alternatively add an explicit build entry for the content script so it gets emitted as a top-level file.
  4. Add the CSS to web_accessible_resources or as part of the content_scripts css array so it is injected automatically and not via insertCSS.
- Pros:
  - Simpler and more predictable packaging for WXT and test harnesses — content scripts are present automatically in every tab/frame that matches.
  - Less reliance on web_accessible_resources exposure rules for programmatic injection.
- Cons:
  - Changes runtime assumptions: the content script will run at page load rather than on-demand; you must ensure it is safe to run globally (the current content script already registers listeners and is passive, so this should be fine).
  - Slightly more source edits: manifest.ts must be updated to include the new content_scripts entry and vite.config.ts may need a tweak so the content script gets emitted correctly.

Concrete, file-level actions to prepare Option B (manifest-declared content script)
- src/manifest.ts
  - Add a content_scripts entry that references the packaged path(s) for your content script JS and CSS. Make sure to include run_at and all_frames if you rely on frame behavior.
  - Add the CSS to web_accessible_resources if your packer requires it.
- vite.config.ts
  - Ensure the content script entry is emitted as a separate file. Two approaches:
    - Add an explicit input in the Rollup build configuration to emit src/contentScript/index.ts as its own output file.
    - Or adapt manualChunks to ensure the content script chunk is named predictably (for example 'contentScript') and then reference that output path in the manifest generator.
- src/common/extract-links.ts
  - Make OSLSession.setup tolerant: first try the ping; if ping fails, log a warning and (a) either attempt programmatic injection as a fallback (useful for dev) or (b) throw a clear error if the packaged build relies on declarative content scripts.
  - If you choose to remove the executeScript path entirely, delete the executeScript/insertCSS calls and rely on ping only.
- html/popup.html (no change required unless you need to reference content script assets directly).
- test setup (vitest.init.ts / WXT harness)
  - Ensure test harness loads the content script into pages it creates (if using declarative manifest in test harness) or provide mocks for chrome.scripting.executeScript and chrome.tabs.sendMessage if keeping programmatic injection.

Concrete, file-level actions to prepare Option A (keep programmatic injection)
- vite.config.ts
  - Make sure your bundler outputs the content script as an asset/file that the background can reference. The CRX plugin's ?script resolver currently does this — replicate the behavior for WXT builds or keep the CRX plugin during the asset-building stage.
- Packaging / manifest generation
  - Ensure the generated WXT manifest/web_accessible_resources include the built content script path so that executeScript can load it at runtime.
- src/common/extract-links.ts
  - No runtime change required by default; keep current executeScript/insertCSS usage.
- Tests
  - Provide mocks for chrome.scripting.executeScript/insertCSS in the WXT test harness if the test harness does not implement them natively.

Which option to pick
- If you want the least runtime-code changes and are comfortable ensuring the build step exposes the assets reliably, choose Option A. For this repo, Option A is recommended to minimize source and tree changes and limit edits strictly to framework-required differences.
- If you prefer a more declarative, WXT-idiomatic setup for test stability, choose Option B (manifest-declared content scripts) as a follow-up iteration.

Detailed checklist for Option A (recommended — minimal change)
- [ ] Ensure the content script JS asset is emitted by the build with a stable, inject-able path that matches the value imported via `../contentScript/index?script` for the WXT build.
- [ ] Ensure the CSS from `../contentScript/index.css?inline` is either inlined (current behavior) or emitted and permitted for `chrome.scripting.insertCSS` under your packaging rules.
- [ ] Ensure the WXT-generated manifest preserves "scripting", required host_permissions or "activeTab", and does not strip any web_accessible_resources your packaging flow requires.
- [ ] Keep `OSLSession.setup()` as-is (ping then inject on failure); verify in tests that `chrome.scripting.executeScript` and `insertCSS` are available or mocked.
- [ ] Verify dynamic injection works with frameIds as implemented today.
  
Detailed checklist for Option B (alternative)
- [ ] Add content_scripts entry into src/manifest.ts that lists the content script JS and CSS paths that will be present in the WXT package. Example conceptual snippet (adapt paths to your build output):
  - content_scripts: [{ matches: ['<all_urls>'], js: ['assets/contentScript.js'], css: ['assets/contentScript.css'], run_at: 'document_idle', all_frames: true }]
- [ ] Modify vite.config.ts to emit content script as a standalone output file (or add a build input).
- [ ] Update manifest-writer/generator (scripts/generate-wxt-manifest.js or equivalent) to output the WXT manifest JSON with the content_scripts entry.
- [ ] Update OSLSession.setup() to attempt a ping and only fallback to injection when ping fails (keep fallback for dev).
- [ ] Ensure web_accessible_resources include any assets the popup or background injects at runtime (if still used).
- [ ] Update tests to rely on manifest-declared content scripts or add test harness code to inject them.

Validation steps (after implementing preferred option)
- Run build: ensure the content script and css appear in the built package at the paths referenced by your manifest.
  - Example: run your build and inspect the build directory for the content script file and css.
- Package for WXT: run the wxt packaging step (or your manual packaging command) and inspect the produced artifact to ensure the content script file is included.
- End-to-end smoke test in WXT/test harness:
  - Load a test page, select some text with links and trigger the popup or context menu action; verify that the ping/message flows succeed and links are returned.
  - Verify highlight/unhighlight messages work across frames if needed.
- Unit tests:
  - If you rely on declarative content scripts for tests, adjust your fixture pages to load the content script before running assertions.
  - If you keep programmatic injection, mock chrome.scripting.executeScript and chrome.tabs.sendMessage in vitest setup.

Implementation notes and pitfalls
- Asset path stability: hashed filenames are convenient for caching but complicate programmatic injection unless you map them reliably in a manifest generator step. Prefer deterministic outputs for content scripts (or a manifest generator that discovers hashed names).
- web_accessible_resources: programmatic injection often requires the injected file to be web-accessible — ensure your packaged manifest exposes the path.
- Module injection: MV3 supports module scripts in executeScript with the correct flags; if you use module-type content scripts, confirm that the target browser/test harness supports module injection. Manifest-declared scripts avoid this issue in many setups.
- Fallback behavior: keep a small fallback that tries to inject the script if ping fails — this helps ensure the extension still works in development environments or when packaging differs.

Suggested next steps (pick one)
- I can update src/manifest.ts to include a content_scripts entry and adjust vite.config.ts to emit a dedicated content script chunk (Option B). This will be a small, contained set of edits.
- Or I can add notes and a manifest-generation script that preserves programmatic injection but guarantees asset paths for Option A.
- Tell me which option you prefer and I will produce SEARCH/REPLACE blocks for the concrete file edits. I will not apply any edits until you confirm.

Example verification commands (run locally, from ../open-selected-links-xp)
```bash
npm run build
```
```bash
npm run test
```

If you want me to proceed and modify files to implement Option B (manifest-declared content scripts), reply "go ahead - Option B" and I'll prepare SEARCH/REPLACE blocks for src/manifest.ts, vite.config.ts, and a small change in src/common/extract-links.ts to add a tolerant fallback ping-only setup.

Hands-on: initialize a vanilla TypeScript WXT project and migrate this code (minimal-change Option A)

Goal: set up a clean WXT project and bring over this extension’s code with as few source/tree changes as possible. Keep dynamic content-script injection and existing HTML/pages. Limit edits to framework-required differences.

1) Scaffold a vanilla WXT + TypeScript project
- Create a new project next to your current repo (a sibling directory named ../open-selected-links-xp). Do not initialize inside this repository; keep the WXT project fully separate:
  - npm create wxt@latest ../open-selected-links-xp -- --template typescript
  - cd ../open-selected-links-xp
  - npm i -D @types/chrome vitest vitest-chrome prettier

2) Copy the current code and assets into the WXT project
- From the original repository root, set an env var pointing to the source tree; in the new WXT project run:
  - export OLD=../open-selected-links
- Copy source modules:
  - cp -R "$OLD/src/common" ./src/
  - mkdir -p ./src/background ./src/contentScript ./src/options ./src/popup
  - cp "$OLD/src/background/index.ts" ./src/background/
  - cp "$OLD/src/contentScript/index.ts" ./src/contentScript/
  - cp "$OLD/src/contentScript/extractor.ts" ./src/contentScript/
  - cp "$OLD/src/contentScript/index.css" ./src/contentScript/
  - cp "$OLD/src/options/index.ts" ./src/options/
  - cp "$OLD/src/options/index.css" ./src/options/
  - cp "$OLD/src/popup/index.ts" ./src/popup/
  - cp "$OLD/src/popup/index.css" ./src/popup/
  - cp "$OLD/src/global.d.ts" ./src/global.d.ts
- Copy HTML pages:
  - mkdir -p ./html
  - cp "$OLD/html/popup.html" ./html/
  - cp "$OLD/html/options.html" ./html/
- Copy icons and public assets:
  - mkdir -p ./public/img
  - cp "$OLD/public/img/"* ./public/img/
- Optional: bring test helpers (if you want to reuse vitest + vitest-chrome)
  - cp "$OLD/vitest.init.ts" ./vitest.init.ts
  - cp "$OLD/happydom.init.ts" ./happydom.init.ts
  - mkdir -p ./test && cp -R "$OLD/test/." ./test/  (if you plan to run your existing tests)

Do not copy the CRX-specific build config:
- Do not copy src/manifest.ts (CRXJS), vite.config.ts (CRXJS plugin), or src/zip.js. WXT will manage the manifest and packaging.
- Do not copy build/ or package/ output directories.

3) Create WXT config that mirrors your manifest and keeps dynamic injection
- In the WXT project, add a wxt.config.ts that “extends” the manifest with your current values, leaving the source files and HTML structure as-is. Example:

  import { defineConfig } from 'wxt';

  export default defineConfig({
    manifest: {
      manifest_version: 3,
      name: 'Open Selected Links',
      version: '1.8.2',
      description: 'Opens multiple links in the selected content in the current or new window or a tab group.  BETA TESTING RELEASE',
      background: {
        service_worker: 'src/background/index.ts',
        type: 'module',
      },
      options_page: 'html/options.html',
      action: {
        default_popup: 'html/popup.html',
        default_title: 'Open Selected Links',
        default_icon: 'img/icon48.png',
      },
      commands: {
        osl_in_tabs: {
          description: 'Open selected links in new tabs in the current window',
        },
        osl_in_window: {
          description: 'Open selected links in a new window',
        },
        osl_in_tab_group: {
          description: 'Open selected links in a new tab group in the current window',
        },
      },
      permissions: ['activeTab', 'contextMenus', 'system.display', 'scripting', 'storage', 'tabGroups'],
      icons: {
        16: 'img/icon16.png',
        32: 'img/icon32.png',
        48: 'img/icon48.png',
        128: 'img/icon128.png',
      },
      web_accessible_resources: [
        { resources: ['html/popup.html'], matches: ['<all_urls>'] },
      ],
      // If you need stable extension ID in dev: set "key" here (only for local builds).
      // key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...',
    },
    vite: {
      build: {
        rollupOptions: {
          // Emit the content script as a standalone entry so it can be injected dynamically.
          input: {
            'content-script': 'src/contentScript/index.ts',
          },
          output: {
            // Deterministic names for easier reference if you decide to use a hardcoded path
            entryFileNames: (chunk) =>
              chunk.name === 'content-script' ? 'content-script.js' : 'assets/[name].js',
            chunkFileNames: 'assets/[name].js',
          },
        },
      },
      test: {
        include: ['test/**/*.test.ts'],
        setupFiles: ['./vitest.init.ts'],
      },
    },
  });

4) Keep dynamic content-script injection with the smallest possible source edit (if needed)
- Your current code dynamically injects the content script via:
  - import contentScriptPath from '../contentScript/index?script';
  - chrome.scripting.executeScript({ files: [contentScriptPath], ... });
- CRXJS’s ?script import is not recognized by vanilla Vite under WXT. Two minimal approaches:
  1) Single import change + tiny helper file (simple and robust)
     - Create src/contentScript/path.ts in the WXT project that exports the final emitted filename:
       - export default 'content-script.js';
     - Update one import in src/common/extract-links.ts to:
       - import contentScriptPath from '../contentScript/path';
     - Keep everything else (executeScript/insertCSS) unchanged.
  2) Emulate ?script via a Vite plugin (advanced)
     - Implement a custom Vite plugin in wxt.config.ts that resolves ?script imports into emitted entry file paths. This keeps the original import statement unchanged but is more complex to implement correctly with Rollup’s emitFile/getFileName lifecycle.

- CSS injection: you currently import ../contentScript/index.css?inline and pass it to chrome.scripting.insertCSS({ css: contentCss, ... }). Verify that the WXT Vite build still inlines the CSS string. If it doesn’t, switch to a small string constant containing the CSS (copy from src/contentScript/index.css) or import as a raw string using vite’s ?raw query.

5) HTML, popup, and options
- Keep html/popup.html and html/options.html unchanged; WXT will bundle their <script type="module"> entrypoints. Ensure their paths match your project:
  - popup: /src/common/extract-links.ts and /src/popup/index.ts
  - options: /src/options/index.ts

6) Tests
- Bring vitest.init.ts and happydom.init.ts if you run DOM/unit tests; keep vitest-chrome to mock chrome.* APIs.
- Configure the test block in wxt.config.ts (as shown above) so tests run with your setup file.

7) Build and validate
- Run development and build:
  - npm run dev (or wxt dev) — verify popup/options load and background works.
  - npm run build (or wxt build) — confirm dist contains:
    - service worker bundle for background,
    - content-script.js at project root (or at the path you configured),
    - assets/ chunks,
    - html/ pages and public/img icons.
- Validate dynamic injection:
  - Ensure src/common/extract-links.ts still pings the content script and injects it when needed:
    - chrome.scripting.insertCSS({ css: ... })
    - chrome.scripting.executeScript({ files: ['content-script.js'], target: ... })

Notes and constraints (keeping changes minimal)
- We intentionally avoid moving files into WXT’s entrypoints/ folders; we reference existing paths in the manifest instead.
- We avoid adding a runtime shim.
- We preserve programmatic injection to minimize behavioral changes and only adjust how the content script path is resolved (via a tiny helper module).
- If in a later iteration you choose WXT’s defineContentScript flow, move src/contentScript/index.ts into a WXT entrypoint and remove the programmatic injection logic.

When you’re ready, I can prepare concrete edits for the minimal-change approach (create src/contentScript/path.ts in the WXT project and adjust the one import), and add a wxt.config.ts that mirrors your current manifest and build behavior.

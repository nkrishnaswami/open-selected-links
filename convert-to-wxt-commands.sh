#!/usr/bin/env bash
set -euo pipefail

# Run from the root of the original repository
OLD="$(pwd)"

echo "[1/6] Scaffold WXT project in sibling directory ../open-selected-links-xp"
npm create wxt@latest ../open-selected-links-xp -- --template typescript

echo "[2/6] Install dev dependencies in the new WXT project"
cd ../open-selected-links-xp
npm i -D @types/chrome vitest vitest-chrome prettier

echo "[3/6] Copy source code, HTML, assets, and tests from the original repo"
mkdir -p ./src/background ./src/contentScript ./src/options ./src/popup ./html ./public/img ./test
cp -R "$OLD/src/common" ./src/
cp "$OLD/src/background/index.ts" ./src/background/
cp "$OLD/src/contentScript/index.ts" ./src/contentScript/
cp "$OLD/src/contentScript/extractor.ts" ./src/contentScript/
cp "$OLD/src/contentScript/index.css" ./src/contentScript/
cp "$OLD/src/options/index.ts" ./src/options/
cp "$OLD/src/options/index.css" ./src/options/
cp "$OLD/src/popup/index.ts" ./src/popup/
cp "$OLD/src/popup/index.css" ./src/popup/
cp "$OLD/src/global.d.ts" ./src/global.d.ts
cp "$OLD/html/popup.html" ./html/
cp "$OLD/html/options.html" ./html/
cp "$OLD/public/img/"* ./public/img/ || true
cp "$OLD/vitest.init.ts" ./vitest.init.ts 2>/dev/null || true
cp "$OLD/happydom.init.ts" ./happydom.init.ts 2>/dev/null || true
cp -R "$OLD/test/." ./test/ 2>/dev/null || true

echo "[4/6] Create WXT config mirroring current manifest and build behavior"
cat > wxt.config.ts <<'EOF'
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
  },
  vite: {
    build: {
      rollupOptions: {
        // Emit the content script as a standalone entry so it can be injected dynamically.
        input: {
          'content-script': 'src/contentScript/index.ts',
        },
        output: {
          // Deterministic name for easier reference from runtime code.
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
EOF

echo "[5/6] Provide stable emitted filename for dynamic injection and update import"
printf "export default 'content-script.js';\n" > src/contentScript/path.ts
# Update only inside the WXT project copy; original repo remains unchanged.
sed -i "s|\\../contentScript/index?script|../contentScript/path|g" src/common/extract-links.ts

echo "[6/6] Build and (optionally) run tests in the WXT project"
npm run build
npm run test || true

echo "Done. WXT project is ready at: $(pwd)"

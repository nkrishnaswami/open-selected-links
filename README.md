# Open Selected Links
This is the source code for a Chrome extension to extract the `http` and `https` links from the user's selection on a web page, and open them all in a new window.  This is kicked off from a context menu item for the selection.

The extension is available on the Chrome Web Store as [Open Selected Links](https://chrome.google.com/webstore/detail/open-selected-links/hcihcignkpajeehfnomlncinacagapdf).

# Developing


When porting the 1.7.4 javascript to typescript, I built the scaffolding using [bun](https://bun.sh/) using the [`chrome-ext` template](https://github.com/guocaoyi/create-chrome-ext) as a `vanilla-ts` extension, which uses [Vite](https://vitejs.dev) to build/package and the [CRXJS](https://crxjs.dev/vite-plugin) plugin.

To build, execute `bun run build`; outputs will be written to the `build` subdirectory, which can be loaded as an unpacked extension.

Alternatively, a zip file can be produced with `bun run zip` or a CRX with `bun run crx`.


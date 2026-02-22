/// <reference types="vitest" />
import { defineConfig } from 'vite'
import fs from 'fs';
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest'
import { generateFirefoxManifest } from './src/manifest'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    build: {
      emptyOutDir: true,
      outDir: 'build',
	sourcemap: true,
	minify: false,
      target: ['esnext', 'edge89', 'firefox89', 'chrome89', 'safari15'],
      rollupOptions: {
        output: {
	  format: 'module',
          chunkFileNames: 'assets/[name].js',
	  manualChunks: {
	    'common': ['src/common/extract-links.ts', 'src/common/settings.ts'],
	    'background': ['src/background/index.ts'],
	    'contentScript': ['src/contentScript/index.ts', 'src/contentScript/extractor.ts'],
	    'options': ['src/options/index.ts'],
	    'popup': ['src/popup/index.ts'],
	  },
        },
      },
    },
    plugins: [crx({ manifest }), {
      name: 'generate-firefox-manifest',
      enforce: 'post',
      closeBundle() {
        if (process.env.BUILD_TARGET === 'firefox') {
          generateFirefoxManifest();
          fs.renameSync('build/manifest-firefox.json', 'build/manifest.json');
        }
      }
    }],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: './vitest.init.ts',
    },
  }
})

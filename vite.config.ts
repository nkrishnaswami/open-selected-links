import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest'

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
          chunkFileNames: 'assets/[name]-[hash].js',
	  manualChunks: {
	    'common': ['src/common/extract-links.ts', 'src/common/settings.ts'],
	    'background': ['src/background/index.ts'],
	    'contentScript': ['src/contentScript/index.ts', 'src/contentScript/index.css'],
	    'options': ['src/options/index.ts', 'src/options/index.css'],
	    'popup': ['src/popup/index.ts'],
	  },
        },
      },
    },

    plugins: [crx({ manifest })],
  }
})

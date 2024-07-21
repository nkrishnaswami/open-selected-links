// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: 'src/**/*.ts',
    },
    test: {
      // Add this line to your Vitest config (if you don't have it yet)
      setupFiles: './vitest.init.ts',
    }
  },
})

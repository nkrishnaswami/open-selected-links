import { defineConfig } from '@playwright/test';
import path from 'path';

// Chrome binary bundled with playwright (full binary, supports extensions)
const CHROME_EXECUTABLE = path.join(
  process.env.HOME!,
  '.cache/ms-playwright/chromium-1217/chrome-linux64/chrome'
);

export default defineConfig({
  testDir: './test',
  testMatch: ['**/e2e.test.ts'],
  timeout: 30000,
  use: {
    headless: false,  // Chrome extensions require non-headless or headed mode
  },
  projects: [
    {
      name: 'chromium',
      use: {
        executablePath: CHROME_EXECUTABLE,
      },
    },
    // Firefox e2e uses geckodriver directly (not playwright's Firefox).
    // Tests in e2e-firefox.test.ts control Firefox via the geckodriver HTTP API.
    // Requires: /usr/bin/firefox-esr and /usr/bin/geckodriver (firefox-esr-geckodriver package).
    {
      name: 'firefox',
      testMatch: ['**/e2e-firefox.test.ts'],
    },
  ],
});

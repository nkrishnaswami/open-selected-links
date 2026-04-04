import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Extension ID is stable because manifest.json includes a fixed public key.
const CHROME_EXTENSION_ID = 'hcihcignkpajeehfnomlncinacagapdf';
const EXTENSION_PATH = path.resolve(__dirname, '../build');

let context: BrowserContext;

test.beforeEach(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    executablePath: (test.info().project.use as any).executablePath,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });
  // Wait for the service worker to register before each test
  if (context.serviceWorkers().length === 0) {
    await context.waitForEvent('serviceworker');
  }
});

test.afterEach(async () => {
  await context.close();
});

test('service worker registers', async () => {
  const workers = context.serviceWorkers();
  expect(workers).toHaveLength(1);
  expect(workers[0].url()).toContain(CHROME_EXTENSION_ID);
});

test('popup renders and tab group UI is visible on Chrome', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${CHROME_EXTENSION_ID}/html/popup.html`);
  await page.waitForLoadState('domcontentloaded');
  // Wait for popup JS to initialize
  await page.waitForFunction(() => document.getElementById('open-button') !== null);

  // Tab group UI should be visible on Chrome (browser.tabGroups is defined)
  const tabGroupUi = page.locator('#tab-group-ui');
  await expect(tabGroupUi).not.toHaveCSS('display', 'none');
});

test('popup core controls are present', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${CHROME_EXTENSION_ID}/html/popup.html`);
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('#open-button')).toBeVisible();
  await expect(page.locator('#new-window-checkbox')).toBeVisible();
  await expect(page.locator('#filter')).toBeVisible();
});

test('context menu and commands APIs available in service worker', async () => {
  const worker = context.serviceWorkers()[0];
  // In Chrome service workers, chrome.* APIs are always global
  const hasApis = await worker.evaluate(() => {
    return (
      typeof chrome !== 'undefined' &&
      typeof chrome.contextMenus !== 'undefined' &&
      typeof chrome.commands !== 'undefined'
    );
  });
  expect(hasApis).toBe(true);
});

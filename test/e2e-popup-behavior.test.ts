import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPermissiveExtension, startTestServer, type TestServer } from './e2e-helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Extension ID is stable because manifest.json includes a fixed public key;
// it's unaffected by copying the build to a temp dir with host_permissions added.
const CHROME_EXTENSION_ID = 'hcihcignkpajeehfnomlncinacagapdf';

const TEST_PAGE_HTML = `<!DOCTYPE html>
<html><body>
<p id="content">Check out <a href="https://example.com/first">first item</a> and
<a href="https://example.com/second">last item</a></p>
</body></html>`;

let extensionPath: string;
let context: BrowserContext;
let server: TestServer;

test.beforeAll(() => {
  extensionPath = buildPermissiveExtension(path.resolve(__dirname, '../build'));
});

test.beforeEach(async () => {
  server = await startTestServer(TEST_PAGE_HTML);
  context = await chromium.launchPersistentContext('', {
    headless: false,
    executablePath: (test.info().project.use as any).executablePath,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });
  if (context.serviceWorkers().length === 0) {
    await context.waitForEvent('serviceworker');
  }
});

test.afterEach(async () => {
  await context.close();
  server.close();
});

// Opens the popup pointed at the given tab (via the `?tab=` query param the
// popup supports for tests) and waits for link rows to render.
async function openPopupForTab(tabId: number): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${CHROME_EXTENSION_ID}/html/popup.html?tab=${tabId}`);
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForFunction(() => document.getElementById('open-button') !== null);
  await popup.waitForFunction(() => document.querySelectorAll('div.row').length > 0, { timeout: 5000 });
  return popup;
}

async function getTestPageTabId(): Promise<number> {
  const worker = context.serviceWorkers()[0];
  return await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const t = tabs.find((t) => t.url && t.url.startsWith('http'));
    return t!.id!;
  });
}

async function selectTestPageContent(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('content')!;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

test('filtering does not crash when a match ends at the very end of the link list', async () => {
  const page = await context.newPage();
  await page.goto(server.url);
  await selectTestPageContent(page);
  const tabId = await getTestPageTabId();
  const popup = await openPopupForTab(tabId);

  const pageErrors: string[] = [];
  popup.on('pageerror', (err) => pageErrors.push(String(err)));

  // "last item" is the very last text in #select-links-div; matching "item" here
  // (and again earlier in "first item") reproduces the reverse-order highlightRegex
  // crash: the end-of-text match is processed first and used to throw on
  // node.nodeValue when walker.nextNode() returns null, aborting the earlier match.
  await popup.evaluate(() => {
    const el = document.getElementById('filter')!;
    el.innerText = 'item';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await popup.waitForTimeout(300);

  expect(pageErrors).toEqual([]);
  await expect(popup.locator('#select-links-div span.highlight')).toHaveCount(2);
});

test('typing while focus is elsewhere redirects into the filter without throwing', async () => {
  const page = await context.newPage();
  await page.goto(server.url);
  await selectTestPageContent(page);
  const tabId = await getTestPageTabId();
  const popup = await openPopupForTab(tabId);

  const pageErrors: string[] = [];
  popup.on('pageerror', (err) => pageErrors.push(String(err)));

  await popup.click('#toggle-button'); // focus something that is NOT the filter
  await popup.keyboard.press('x');
  await popup.waitForTimeout(200);

  expect(pageErrors).toEqual([]);
  await expect(popup.locator('#filter')).toBeFocused();
  expect(await popup.locator('#filter').textContent()).toBe('x');
});

test('typing directly into the already-focused filter does not throw', async () => {
  const page = await context.newPage();
  await page.goto(server.url);
  await selectTestPageContent(page);
  const tabId = await getTestPageTabId();
  const popup = await openPopupForTab(tabId);

  const pageErrors: string[] = [];
  popup.on('pageerror', (err) => pageErrors.push(String(err)));

  await popup.click('#filter');
  await popup.keyboard.type('Article');
  await popup.waitForTimeout(200);

  expect(pageErrors).toEqual([]);
  expect(await popup.locator('#filter').textContent()).toBe('Article');
});

test('a real Chrome error opening links shows a friendly title with the error as subtitle', async () => {
  const page = await context.newPage();
  await page.goto(server.url);
  await selectTestPageContent(page);
  const tabId = await getTestPageTabId();
  const popup = await openPopupForTab(tabId);

  await popup.locator('input[name="select-links"]').first().check();
  // A numeric tab-group id that doesn't exist makes the real
  // browser.tabs.group() call reject (groupTabs doesn't catch it).
  await popup.fill('#tab-group-name', '999999999');
  await popup.click('#open-button');
  await popup.waitForTimeout(500);

  await expect(popup.locator('#error')).toHaveText('Unable to open links');
  const subtitle = await popup.locator('#error_sub').textContent();
  expect(subtitle).toBeTruthy();
  // The popup stays open on error instead of calling window.close().
  expect(popup.isClosed()).toBe(false);
});

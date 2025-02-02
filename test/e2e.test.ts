import { afterEach, beforeEach, expect, test } from 'vitest';
import puppeteer from 'puppeteer';
import path from 'path';
import packageData from '../package.json'

let browser;

const EXTENSION_ID = packageData.openSelectedLinks.extension_id;

beforeEach(async () => {
  const pathToExtension = path.join(process.cwd(), 'build');
  browser = await puppeteer.launch({
    browser: 'chrome',
    executablePath: '/usr/bin/chromium-browser',
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });
});

afterEach(async () => {
  await browser.close();
  browser = undefined;
});


test("Extension has service worker", async () => {
  const serviceWorkerTarget = await browser.waitForTarget(
    target => target.type() === 'service_worker'
  );
  const serviceWorker = await serviceWorkerTarget.worker();
  expect(serviceWorker).toBeTruthy;
}, 3000);


test("Extension registers rules", async () => {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${EXTENSION_ID}/html/popup.html`);
 
  expect(page.evaluate(`chrome.contextMenus.onClicked.hasListener(
    handleOpenSelectedLinkMenuClick)`)).toBeTruthy;
  expect(page.evaluate(`chrome.commands.onCommand.hasListener(
    handleOpenSelectedLinksCommand)`)).toBeTruthy;
});

test("Context menu works", async () => {});

test("Popup works", async () => {});

import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess, execSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPermissiveExtension, startTestServer, type TestServer } from './e2e-helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../build');
const GECKODRIVER = '/usr/bin/geckodriver';
const FIREFOX_ESR = '/usr/bin/firefox-esr';
const ADDON_ID = '@open-selected-links-ff';
const GD_PORT = 4455;
const GD_BASE = `http://localhost:${GD_PORT}`;

// W3C WebDriver normalized key values for the Actions API.
const ARROW_DOWN = '';
const SPACE = '';

// Mirrors the fixtures in test/e2e-popup-behavior.test.ts (the Chrome
// equivalent of these tests) so both browsers exercise the same scenarios.
const TEST_PAGE_HTML = `<!DOCTYPE html>
<html><body>
<p id="content">Check out <a href="https://example.com/first">first item</a> and
<a href="https://example.com/second">last item</a></p>
</body></html>`;

const AREA_AND_FORMACTION_HTML = `<!DOCTYPE html>
<html><body>
<div id="content">
  <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7"
       usemap="#planmap" width="10" height="10">
  <map name="planmap">
    <area shape="rect" coords="0,0,10,10" href="https://example.com/room-one" alt="Room One">
  </map>
  <form>
    <button formaction="https://example.com/submit-link">Submit Link</button>
  </form>
</div>
</body></html>`;

let geckodriverProcess: ChildProcess;
let sessionId: string;
let extensionUuid: string;
let profileDir: string;
let basicServer: TestServer;
let areaServer: TestServer;

async function gd(method: string, endpoint: string, body?: any): Promise<any> {
  const res = await fetch(`${GD_BASE}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as any;
  if (json.value?.error) {
    throw new Error(`Geckodriver error: ${json.value.error} — ${json.value.message}`);
  }
  return json.value;
}

async function navigateTo(url: string) {
  await gd('POST', `/session/${sessionId}/url`, { url });
}

async function findElement(selector: string): Promise<string> {
  const result = await gd('POST', `/session/${sessionId}/element`, {
    using: 'css selector',
    value: selector,
  });
  return result['element-6066-11e4-a52e-4f735466cecf'];
}

async function getCss(elementId: string, property: string): Promise<string> {
  return gd('GET', `/session/${sessionId}/element/${elementId}/css/${property}`);
}

async function executeScript(script: string, args: any[] = []): Promise<any> {
  return gd('POST', `/session/${sessionId}/execute/sync`, { script, args });
}

async function executeAsyncScript(script: string, args: any[] = []): Promise<any> {
  return gd('POST', `/session/${sessionId}/execute/async`, { script, args });
}

async function click(elementId: string) {
  await gd('POST', `/session/${sessionId}/element/${elementId}/click`, {});
}

async function sendKeys(elementId: string, text: string) {
  await gd('POST', `/session/${sessionId}/element/${elementId}/value`, { text });
}

async function keyPress(value: string) {
  await gd('POST', `/session/${sessionId}/actions`, {
    actions: [{ type: 'key', id: 'kbd', actions: [{ type: 'keyDown', value }, { type: 'keyUp', value }] }],
  });
}

async function getWindowHandle(): Promise<string> {
  return gd('GET', `/session/${sessionId}/window`);
}

async function switchWindow(handle: string) {
  await gd('POST', `/session/${sessionId}/window`, { handle });
}

// Waits for the popup's link rows to render — content-script injection and
// the round trip to get_links happen asynchronously after navigation.
async function waitForRows(timeoutMs = 10000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await executeScript(`return document.querySelectorAll('div.row').length;`);
    if (count > 0) return count;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return 0;
}

// Opens `pageUrl` in the session's original window, selects its #content
// element, opens a second tab for the popup pointed at that tab (via the
// `?tab=` query param the popup supports for tests), and waits for its link
// rows to render. Also installs a window-level error listener in the popup
// so tests can assert no uncaught exceptions occurred. Returns the original
// window's handle — pass it to closePopupWindow() for cleanup.
async function openTestPageAndPopup(pageUrl: string): Promise<{ homeHandle: string; tabId: number }> {
  const homeHandle = await getWindowHandle();
  await navigateTo(pageUrl);
  await executeScript(`
    const el = document.getElementById('content');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  `);

  await gd('POST', `/session/${sessionId}/window/new`, { type: 'tab' });
  const handles: string[] = await gd('GET', `/session/${sessionId}/window/handles`);
  const popupHandle = handles.find(h => h !== homeHandle)!;
  await switchWindow(popupHandle);

  // Navigate to an extension page first so `browser.*` is available in this
  // context — a fresh tab starts on about:blank, which has no such API.
  await navigateTo(`moz-extension://${extensionUuid}/html/popup.html`);
  await new Promise(resolve => setTimeout(resolve, 500));

  const tabId = await executeAsyncScript(`
    const callback = arguments[arguments.length - 1];
    browser.tabs.query({}).then(tabs => {
      const t = tabs.find(t => t.url && t.url.startsWith('http'));
      callback(t ? t.id : null);
    });
  `);

  await navigateTo(`moz-extension://${extensionUuid}/html/popup.html?tab=${tabId}`);
  await executeScript(`
    window.__oslErrors = [];
    window.addEventListener('error', (e) => window.__oslErrors.push(String(e.error || e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__oslErrors.push(String(e.reason)));
  `);
  await waitForRows();

  return { homeHandle, tabId };
}

async function closePopupWindow(homeHandle: string) {
  await gd('DELETE', `/session/${sessionId}/window`);
  await switchWindow(homeHandle);
}

test.beforeAll(async () => {
  basicServer = await startTestServer(TEST_PAGE_HTML);
  areaServer = await startTestServer(AREA_AND_FORMACTION_HTML);

  profileDir = mkdtempSync(path.join(tmpdir(), 'ff-osl-test-'));

  geckodriverProcess = spawn(GECKODRIVER, [`--port=${GD_PORT}`, '--log=warn'], {
    stdio: 'pipe',
  });

  // Wait for geckodriver to be ready
  await new Promise<void>(resolve => setTimeout(resolve, 1500));

  // Create Firefox session with a temp profile
  const session = await gd('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'firefox',
        'moz:firefoxOptions': {
          binary: FIREFOX_ESR,
          args: ['--profile', profileDir],
          prefs: { 'xpinstall.signatures.required': false },
        },
      },
    },
  });
  sessionId = session.sessionId;

  // Chrome's activeTab-equivalent gesture (a real toolbar click) can't be
  // simulated via WebDriver either; sideload a copy of the build with a
  // narrow, localhost-only host_permissions grant instead — same technique
  // test/e2e-helpers.ts uses for the Chrome e2e suite. The extra permission
  // doesn't affect the pre-existing UI-presence tests below.
  const permissiveDir = buildPermissiveExtension(EXTENSION_PATH);
  const xpiPath = path.join(tmpdir(), 'osl-ff-test.zip');
  execSync(`cd "${permissiveDir}" && zip -r "${xpiPath}" . -x "*.map"`, { stdio: 'ignore' });

  // Sideload the extension via geckodriver's addon install endpoint
  const xpiBase64 = readFileSync(xpiPath).toString('base64');
  await gd('POST', `/session/${sessionId}/moz/addon/install`, {
    addon: xpiBase64,
    temporary: true,
  });

  // Poll prefs.js until Firefox writes the extension UUID (up to 10s)
  let prefsContent = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      prefsContent = readFileSync(path.join(profileDir, 'prefs.js'), 'utf-8');
      if (prefsContent.includes('webextensions.uuids')) break;
    } catch { /* file not yet written */ }
  }

  const match = prefsContent.match(/user_pref\("extensions\.webextensions\.uuids",\s*"(.+?)"\)/);
  if (!match) throw new Error('Extension UUID not found in prefs.js after install');
  // The pref value is a JSON string with escaped quotes
  const uuids = JSON.parse(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  extensionUuid = uuids[ADDON_ID];
  if (!extensionUuid) throw new Error(`UUID for ${ADDON_ID} not found in prefs.js`);
});

test.afterAll(async () => {
  if (sessionId) await gd('DELETE', `/session/${sessionId}`).catch(() => {});
  geckodriverProcess?.kill();
  basicServer?.close();
  areaServer?.close();
});

test('extension loads and popup page is accessible on Firefox', async () => {
  await navigateTo(`moz-extension://${extensionUuid}/html/popup.html`);
  await new Promise(resolve => setTimeout(resolve, 1000));

  const openButton = await findElement('#open-button');
  expect(openButton).toBeTruthy();
});

test('popup core controls are present on Firefox', async () => {
  await navigateTo(`moz-extension://${extensionUuid}/html/popup.html`);
  await new Promise(resolve => setTimeout(resolve, 1000));

  expect(await findElement('#open-button')).toBeTruthy();
  expect(await findElement('#new-window-checkbox')).toBeTruthy();
  expect(await findElement('#filter')).toBeTruthy();
});

test('tab group UI visibility matches tabGroups support on Firefox', async () => {
  await navigateTo(`moz-extension://${extensionUuid}/html/popup.html`);
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check at runtime whether browser.tabGroups is defined in the extension context
  const tabGroupsDefined = await executeScript(
    'return typeof browser !== "undefined" && typeof browser.tabGroups !== "undefined"',
  );

  const tabGroupUiId = await findElement('#tab-group-ui');
  const display = await getCss(tabGroupUiId, 'display');

  // src/popup/index.ts:187 hides #tab-group-ui when browser.tabGroups is undefined
  if (tabGroupsDefined) {
    expect(display).not.toBe('none');
  } else {
    expect(display).toBe('none');
  }
});

test('filter regex ending at the very end of the link list does not crash on Firefox', async () => {
  const { homeHandle } = await openTestPageAndPopup(basicServer.url);
  try {
    // "last item" is the very last text in #select-links-div; matching "item"
    // here (and again earlier in "first item") reproduces the reverse-order
    // highlightRegex crash fixed in src/popup/index.ts.
    await executeScript(`
      const el = document.getElementById('filter');
      el.innerText = 'item';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await new Promise(resolve => setTimeout(resolve, 300));

    const errors = await executeScript(`return window.__oslErrors;`);
    const highlightCount = await executeScript(
      `return document.querySelectorAll('#select-links-div span.highlight').length;`,
    );
    expect(errors).toEqual([]);
    expect(highlightCount).toBe(2);
  } finally {
    await closePopupWindow(homeHandle);
  }
});

test('typing while focus is elsewhere moves focus to the filter without throwing on Firefox', async () => {
  const { homeHandle } = await openTestPageAndPopup(basicServer.url);
  try {
    const toggleBtn = await findElement('#toggle-button'); // focus something that is NOT the filter
    await click(toggleBtn);
    await keyPress('x');
    await new Promise(resolve => setTimeout(resolve, 300));

    const errors = await executeScript(`return window.__oslErrors;`);
    const activeIsFilter = await executeScript(
      `return document.activeElement && document.activeElement.id === 'filter';`,
    );
    expect(errors).toEqual([]);
    expect(activeIsFilter).toBe(true);
    // Unlike Chrome, Firefox doesn't retroactively redirect the triggering
    // keystroke's *character* into the newly-focused element — only the
    // no-crash and focus-redirect behavior are asserted here. See the note
    // in setupFilter (src/popup/index.ts) for why the removed redispatch
    // could never have caused insertion in either browser.
  } finally {
    await closePopupWindow(homeHandle);
  }
});

test('shows a friendly error message on a real tab-group failure on Firefox', async () => {
  const { homeHandle } = await openTestPageAndPopup(basicServer.url);
  try {
    await executeScript(`document.querySelector('input[name="select-links"]').checked = true;`);
    // A numeric tab-group id that doesn't exist makes the real
    // browser.tabs.group() call reject (groupTabs doesn't catch it).
    const tabGroupInput = await findElement('#tab-group-name');
    await sendKeys(tabGroupInput, '999999999');
    const openBtn = await findElement('#open-button');
    await click(openBtn);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const errorTitle = await executeScript(`return document.getElementById('error').textContent;`);
    const errorSub = await executeScript(`return document.getElementById('error_sub').textContent;`);
    expect(errorTitle).toBe('Unable to open links');
    expect(errorSub).toBeTruthy();
  } finally {
    await closePopupWindow(homeHandle);
  }
});

test('keyboard navigation (ArrowDown/Space) selects a link without a mouse on Firefox', async () => {
  const { homeHandle } = await openTestPageAndPopup(basicServer.url);
  try {
    await keyPress(ARROW_DOWN); // focuses the first row
    await keyPress(ARROW_DOWN); // focuses the second row
    await keyPress(SPACE); // toggles the second row's checkbox
    await new Promise(resolve => setTimeout(resolve, 300));

    const result = await executeScript(`
      const rows = document.querySelectorAll('div.row');
      return {
        secondFocused: document.activeElement === rows[1],
        secondChecked: rows[1].querySelector('input[type=checkbox]').checked,
        firstChecked: rows[0].querySelector('input[type=checkbox]').checked,
      };
    `);
    expect(result).toEqual({ secondFocused: true, secondChecked: true, firstChecked: false });
  } finally {
    await closePopupWindow(homeHandle);
  }
});

test('extracts links from image-map areas and formaction buttons on Firefox', async () => {
  const { homeHandle } = await openTestPageAndPopup(areaServer.url);
  try {
    const result = await executeScript(`
      const anchors = Array.from(document.querySelectorAll('#select-links-div a'));
      return { links: anchors.map(a => a.href), labels: anchors.map(a => a.textContent) };
    `);
    expect(result.links).toEqual(['https://example.com/room-one', 'https://example.com/submit-link']);
    expect(result.labels).toEqual(['Room One', 'Submit Link']);
  } finally {
    await closePopupWindow(homeHandle);
  }
});

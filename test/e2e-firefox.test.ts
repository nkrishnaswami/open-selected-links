import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess, execSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../build');
const GECKODRIVER = '/usr/bin/geckodriver';
const FIREFOX_ESR = '/usr/bin/firefox-esr';
const ADDON_ID = '@open-selected-links-ff';
const GD_PORT = 4455;
const GD_BASE = `http://localhost:${GD_PORT}`;

let geckodriverProcess: ChildProcess;
let sessionId: string;
let extensionUuid: string;
let profileDir: string;

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

test.beforeAll(async () => {
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

  // Create XPI from the Firefox build directory
  const xpiPath = path.join(tmpdir(), 'osl-ff-test.zip');
  execSync(`cd "${EXTENSION_PATH}" && zip -r "${xpiPath}" . -x "*.map"`, { stdio: 'ignore' });

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
    } catch {}
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

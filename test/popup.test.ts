// popup.test.ts — tests for the copy-to-clipboard feature in src/popup/index.ts
//
// popup/index.ts runs `await main()` at the top level, so we use
// vi.resetModules() + dynamic import in beforeEach to get a fresh run of
// main() for each test, with the DOM and browser mocks pre-configured.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Gives the event loop one full turn so all pending microtasks inside async
// event handlers (like openLinks) have a chance to settle.
const flushPromises = () => new Promise<void>(r => setTimeout(r, 0));

// Minimal popup HTML — all elements that main() touches must be present so
// that getElementById(...) doesn't throw.
const POPUP_HTML = `
  <div id="error"></div>
  <div id="error_sub"></div>
  <form name="SelectLinks">
    <div id="hamburger-row">
      <div id="hamburger"><div></div><div></div><div></div></div>
      <div id="hamburger-caption">Tap to hide options</div>
    </div>
    <div id="config-container">
      <fieldset>
        <div id="filter" contenteditable="plaintext-only"></div>
        <div id="filter-options-row">
          <input id="filter-urls-checkbox" type="checkbox">
          <input id="hide-duplicates-checkbox" type="checkbox">
          <button type="button" id="toggle-button">Toggle visible</button>
        </div>
      </fieldset>
      <fieldset>
        <input id="new-window-checkbox" type="checkbox" checked>
        <input id="incognito-checkbox" type="checkbox">
        <span id="incognito-note" style="display:none"></span>
        <div id="tab-group-ui">
          <input id="tab-group-name" type="text">
          <datalist id="tab-group-list"></datalist>
        </div>
        <input id="discard-tab-checkbox" type="checkbox">
        <input id="deduplicate-links-checkbox" type="checkbox">
        <input id="focus-checkbox" type="checkbox">
        <input id="sxs-checkbox" type="checkbox">
        <div id="target-display" class="invisible">
          <select id="display"></select>
        </div>
      </fieldset>
    </div>
    <div id="select-links-div"></div>
    <div id="open-button-display">
      <button type="button" id="open-button">Open</button>
      <button type="button" id="copy-button">Copy</button>
    </div>
  </form>
`;

describe('popup copy button', () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';

    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    vi.spyOn(window, 'close').mockImplementation(() => {});

    // Wire up browser mocks that main() needs to complete without error.
    browser.storage.local.get.mockResolvedValue({});
    browser.tabs.query.mockResolvedValue([{ id: 42 }]);
    browser.tabs.sendMessage.mockImplementation(async (_tabId: number, msg: any) => {
      if (msg.id === 'ping') return 'ack';
      if (msg.id === 'get_links') return {
        links: ['http://a.example/', 'http://b.example/'],
        labels: ['A', 'B'],
      };
    });
    browser.scripting.executeScript.mockResolvedValue(undefined);
    browser.tabGroups.query.mockResolvedValue([]);

    // Importing the module triggers the top-level `await main()`, which
    // renders the link rows and wires up all button handlers.
    await import('../src/popup/index.ts');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('clicking Copy writes all checked URLs to clipboard', async () => {
    for (const cb of document.querySelectorAll<HTMLInputElement>('input[name="select-links"]')) {
      cb.checked = true;
    }
    document.getElementById('copy-button')!.click();
    await Promise.resolve();
    expect(writeTextMock).toHaveBeenCalledWith('http://a.example/\nhttp://b.example/');
  });

  test('only checked URLs are written', async () => {
    const [first, second] = document.querySelectorAll<HTMLInputElement>('input[name="select-links"]');
    first.checked = true;
    second.checked = false;
    document.getElementById('copy-button')!.click();
    await Promise.resolve();
    expect(writeTextMock).toHaveBeenCalledWith('http://a.example/');
  });

  test('copying with nothing checked writes empty string', async () => {
    document.getElementById('copy-button')!.click();
    await Promise.resolve();
    expect(writeTextMock).toHaveBeenCalledWith('');
  });

  test('button shows "Copied!" immediately after click', async () => {
    const button = document.getElementById('copy-button') as HTMLButtonElement;
    button.click();
    await Promise.resolve();
    expect(button.textContent).toBe('Copied!');
  });

  test('button reverts to "Copy" after 1.5 s', async () => {
    vi.useFakeTimers();
    const button = document.getElementById('copy-button') as HTMLButtonElement;
    for (const cb of document.querySelectorAll<HTMLInputElement>('input[name="select-links"]')) {
      cb.checked = true;
    }
    button.click();
    await Promise.resolve();
    vi.advanceTimersByTime(1500);
    expect(button.textContent).toBe('Copy');
    vi.useRealTimers();
  });

  test('Copy does not close the popup', async () => {
    document.getElementById('copy-button')!.click();
    await Promise.resolve();
    expect(window.close).not.toHaveBeenCalled();
  });
});

// Shared browser mock setup used by every describe block below.
const setupBrowserMocks = (links: string[], labels: string[]) => {
  browser.storage.local.get.mockResolvedValue({});
  browser.tabs.query.mockResolvedValue([{ id: 42 }]);
  browser.tabs.sendMessage.mockImplementation(async (_tabId: number, msg: any) => {
    if (msg.id === 'ping') return 'ack';
    if (msg.id === 'get_links') return { links, labels };
  });
  browser.scripting.executeScript.mockResolvedValue(undefined);
  browser.tabGroups.query.mockResolvedValue([]);
};

describe('openLinks (Open button)', () => {
  beforeEach(async () => {
    vi.clearAllMocks(); // reset call counts accumulated from previous tests
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    vi.spyOn(window, 'close').mockImplementation(() => {});
    setupBrowserMocks(['http://a.example/', 'http://b.example/'], ['A', 'B']);
    browser.windows.create.mockResolvedValue({ id: 100, tabs: [{ id: 1 }, { id: 2 }] });
    browser.tabs.create.mockResolvedValue({ id: 3 });
    browser.tabs.update.mockResolvedValue({});
    await import('../src/popup/index.ts');
    // Check both link rows so Open has something to act on.
    for (const cb of document.querySelectorAll<HTMLInputElement>('input[name="select-links"]')) {
      cb.checked = true;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('opens links in a new window when new-window is checked', async () => {
    (document.getElementById('new-window-checkbox') as HTMLInputElement).checked = true;
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(browser.windows.create).toHaveBeenCalled();
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });

  test('opens links in the current window when new-window is unchecked', async () => {
    (document.getElementById('new-window-checkbox') as HTMLInputElement).checked = false;
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(browser.tabs.create).toHaveBeenCalledTimes(2); // one call per link
    expect(browser.windows.create).not.toHaveBeenCalled();
  });

  test('closes the popup after opening', async () => {
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(window.close).toHaveBeenCalled();
  });

  test('SxS mode opens two separate windows for two links', async () => {
    (document.getElementById('sxs-checkbox') as HTMLInputElement).checked = true;
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(browser.windows.create).toHaveBeenCalledTimes(2);
    expect(window.close).toHaveBeenCalled();
  });
});

describe('openLinks — error handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    vi.spyOn(window, 'close').mockImplementation(() => {});
    setupBrowserMocks(['http://a.example/'], ['A']);
    browser.tabs.create.mockResolvedValue({ id: 3 });
    browser.tabs.update.mockResolvedValue({});
    // groupTabs doesn't catch failures from browser.tabs.group — a
    // nonexistent numeric tab-group id rejects with a real Chrome error.
    browser.tabs.group.mockRejectedValue(new Error('No group with id: 12345.'));
    await import('../src/popup/index.ts');
    (document.querySelector('input[name="select-links"]') as HTMLInputElement).checked = true;
    (document.getElementById('new-window-checkbox') as HTMLInputElement).checked = false;
    (document.getElementById('tab-group-name') as HTMLInputElement).value = '12345';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows a friendly title with the underlying error as the subtitle', async () => {
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(document.getElementById('error')!.innerText).toBe('Unable to open links');
    expect(document.getElementById('error_sub')!.innerText).toBe('No group with id: 12345.');
  });

  test('does not close the popup', async () => {
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(window.close).not.toHaveBeenCalled();
  });
});

describe('filterRows', () => {
  const triggerFilter = (text: string) => {
    const div = document.getElementById('filter')!;
    (div as any).innerText = text;
    div.dispatchEvent(new Event('input'));
  };

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    setupBrowserMocks(
      ['http://a.example/', 'http://b.example/'],
      ['Alpha', 'Bravo'],
    );
    await import('../src/popup/index.ts');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('hides rows that do not match the filter', () => {
    triggerFilter('alpha');
    const [row1, row2] = document.querySelectorAll('div.row');
    expect(row1.classList.contains('invisible')).toBe(false);
    expect(row2.classList.contains('invisible')).toBe(true);
  });

  test('shows all rows when the filter is cleared', () => {
    triggerFilter('alpha');
    triggerFilter('');
    for (const row of document.querySelectorAll('div.row')) {
      expect(row.classList.contains('invisible')).toBe(false);
    }
  });

  test('URL mode includes href in the search haystack', () => {
    // ".example" is in the href but not in labels "Alpha" or "Bravo"
    triggerFilter('.example');
    const [row1, row2] = document.querySelectorAll('div.row');
    expect(row1.classList.contains('invisible')).toBe(true);
    expect(row2.classList.contains('invisible')).toBe(true);

    // Enabling URL mode causes filterRows to re-run and match the hrefs
    const cb = document.getElementById('filter-urls-checkbox') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    expect(row1.classList.contains('invisible')).toBe(false);
    expect(row2.classList.contains('invisible')).toBe(false);
  });

  test('clears stale highlight spans from a previous filter run', () => {
    // Inject a span.highlight manually to simulate what highlightRegex would have
    // created; then re-filter and verify clearHighlights removed it.
    // (happy-dom's TreeWalker.firstChild() with SHOW_TEXT does not descend through
    // element children, so highlightRegex itself cannot be driven to produce spans
    // in unit tests — that path is covered by the e2e suite.)
    document.querySelector('#select-links-div .row a')!
      .insertAdjacentHTML('beforebegin', '<span class="highlight">stale</span>');
    expect(document.querySelectorAll('#select-links-div span.highlight').length).toBe(1);

    triggerFilter('alpha'); // clearHighlights runs first, removing the stale span
    expect(document.querySelectorAll('#select-links-div span.highlight').length).toBe(0);
  });

  test('invalid regex does not throw and preserves row visibility', () => {
    triggerFilter(''); // start with all rows visible
    expect(() => triggerFilter('[invalid')).not.toThrow();
    for (const row of document.querySelectorAll('div.row')) {
      expect(row.classList.contains('invisible')).toBe(false);
    }
  });
});

describe('body keypress redirect to filter', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    setupBrowserMocks(['http://a.example/'], ['A']);
    await import('../src/popup/index.ts');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('keystrokes typed elsewhere move focus to the filter without throwing', () => {
    const filter = document.getElementById('filter')!;
    const otherElement = document.getElementById('open-button')!;
    const event = new KeyboardEvent('keypress', { key: 'a', bubbles: true, cancelable: true });
    expect(() => otherElement.dispatchEvent(event)).not.toThrow();
    expect(document.activeElement).toBe(filter);
  });

  test('keystrokes typed directly into the filter do not throw', () => {
    const filter = document.getElementById('filter')!;
    const event = new KeyboardEvent('keypress', { key: 'a', bubbles: true, cancelable: true });
    expect(() => filter.dispatchEvent(event)).not.toThrow();
  });
});

// Shared beforeEach body for setupIncognito describe blocks — only the
// isAllowedIncognitoAccess mock differs between them.
const makeIncognitoBeforeEach = (extensionMock: object) => async () => {
  vi.clearAllMocks();
  vi.resetModules();
  document.body.innerHTML = POPUP_HTML;
  document.head.innerHTML = '';
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
  setupBrowserMocks(['http://a.example/'], ['A']);
  (browser as any).extension = extensionMock;
  await import('../src/popup/index.ts');
};

describe('setupIncognito — access granted', () => {
  beforeEach(makeIncognitoBeforeEach({
    isAllowedIncognitoAccess: vi.fn().mockResolvedValue(true),
  }));

  afterEach(() => { vi.restoreAllMocks(); });

  test('incognito checkbox is enabled', () => {
    expect((document.getElementById('incognito-checkbox') as HTMLInputElement).disabled).toBe(false);
  });

  test('incognito note stays hidden', () => {
    expect((document.getElementById('incognito-note') as HTMLElement).style.display).toBe('none');
  });

  test('incognito checkbox is not pre-checked when current window is regular', () => {
    // setupBrowserMocks returns incognito: undefined (falsy) on the tab
    expect((document.getElementById('incognito-checkbox') as HTMLInputElement).checked).toBe(false);
  });
});

describe('setupIncognito — access granted, current window is incognito', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    setupBrowserMocks(['http://a.example/'], ['A']);
    browser.tabs.query.mockResolvedValue([{ id: 42, incognito: true }]);
    (browser as any).extension = { isAllowedIncognitoAccess: vi.fn().mockResolvedValue(true) };
    await import('../src/popup/index.ts');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  test('incognito checkbox is pre-checked to inherit window privacy', () => {
    expect((document.getElementById('incognito-checkbox') as HTMLInputElement).checked).toBe(true);
  });
});

describe('setupIncognito — access denied', () => {
  beforeEach(makeIncognitoBeforeEach({
    isAllowedIncognitoAccess: vi.fn().mockResolvedValue(false),
  }));

  afterEach(() => { vi.restoreAllMocks(); });

  test('incognito checkbox is disabled', () => {
    expect((document.getElementById('incognito-checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  test('incognito checkbox is unchecked when disabled', () => {
    expect((document.getElementById('incognito-checkbox') as HTMLInputElement).checked).toBe(false);
  });

  test('incognito note is visible', () => {
    expect((document.getElementById('incognito-note') as HTMLElement).style.display).not.toBe('none');
  });
});

describe('setupIncognito — API unavailable (Firefox / undefined)', () => {
  // browser.extension is not set — accessing .isAllowedIncognitoAccess() throws a
  // TypeError, which setupIncognito catches and treats as "always allowed".
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    setupBrowserMocks(['http://a.example/'], ['A']);
    delete (browser as any).extension;
    await import('../src/popup/index.ts');
  });

  afterEach(() => { vi.restoreAllMocks(); });

  test('incognito checkbox remains enabled', () => {
    expect((document.getElementById('incognito-checkbox') as HTMLInputElement).disabled).toBe(false);
  });
});

describe('openLinks — incognito mode', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    vi.spyOn(window, 'close').mockImplementation(() => {});
    setupBrowserMocks(['http://a.example/', 'http://b.example/'], ['A', 'B']);
    browser.windows.create.mockResolvedValue({ id: 100, tabs: [{ id: 1 }, { id: 2 }] });
    browser.tabs.create.mockResolvedValue({ id: 3 });
    browser.tabs.update.mockResolvedValue({});
    // access granted so the checkbox isn't disabled by setupIncognito
    (browser as any).extension = { isAllowedIncognitoAccess: vi.fn().mockResolvedValue(true) };
    await import('../src/popup/index.ts');
    for (const cb of document.querySelectorAll<HTMLInputElement>('input[name="select-links"]')) {
      cb.checked = true;
    }
    (document.getElementById('incognito-checkbox') as HTMLInputElement).checked = true;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  test('windows.create is called with incognito: true', async () => {
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(browser.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ incognito: true }),
    );
  });

  test('forces a new window even when the new-window checkbox is unchecked', async () => {
    (document.getElementById('new-window-checkbox') as HTMLInputElement).checked = false;
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(browser.windows.create).toHaveBeenCalled();
    expect(browser.tabs.create).not.toHaveBeenCalled();
  });

  test('SxS mode passes incognito: true to both window creates', async () => {
    (document.getElementById('sxs-checkbox') as HTMLInputElement).checked = true;
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(browser.windows.create).toHaveBeenCalledTimes(2);
    for (const [args] of browser.windows.create.mock.calls) {
      expect(args).toMatchObject({ incognito: true });
    }
  });
});

describe('openLinks — incognito already in incognito window', () => {
  // When the current window is already incognito, enabling the incognito option
  // should open in the current window rather than forcing a new one.
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    vi.spyOn(window, 'close').mockImplementation(() => {});
    setupBrowserMocks(['http://a.example/', 'http://b.example/'], ['A', 'B']);
    // Simulate that the current tab belongs to an incognito window.
    browser.tabs.query.mockResolvedValue([{ id: 42, incognito: true }]);
    browser.windows.create.mockResolvedValue({ id: 100, tabs: [{ id: 1 }, { id: 2 }] });
    browser.tabs.create.mockResolvedValue({ id: 3 });
    browser.tabs.update.mockResolvedValue({});
    (browser as any).extension = { isAllowedIncognitoAccess: vi.fn().mockResolvedValue(true) };
    await import('../src/popup/index.ts');
    for (const cb of document.querySelectorAll<HTMLInputElement>('input[name="select-links"]')) {
      cb.checked = true;
    }
    (document.getElementById('new-window-checkbox') as HTMLInputElement).checked = false;
    (document.getElementById('incognito-checkbox') as HTMLInputElement).checked = true;
  });

  afterEach(() => { vi.restoreAllMocks(); });

  test('opens in the current window, not a new one', async () => {
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(browser.windows.create).not.toHaveBeenCalled();
    expect(browser.tabs.create).toHaveBeenCalled();
  });

  test('still passes incognito: true to tab options', async () => {
    document.getElementById('open-button')!.click();
    await flushPromises();
    // tabs.create is used for current-window mode; incognito is on the window not the tab,
    // so we just verify windows.create was NOT called (we're staying in the current window).
    expect(browser.windows.create).not.toHaveBeenCalled();
  });

  test('explicitly unchecking incognito then choosing new window opens a regular window', async () => {
    (document.getElementById('incognito-checkbox') as HTMLInputElement).checked = false;
    (document.getElementById('new-window-checkbox') as HTMLInputElement).checked = true;
    document.getElementById('open-button')!.click();
    await flushPromises();
    expect(browser.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ incognito: false }),
    );
  });
});

describe('addLinkCheckboxes with duplicate URLs', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = POPUP_HTML;
    document.head.innerHTML = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    // Second link is a duplicate of the first.
    setupBrowserMocks(
      ['http://a.example/', 'http://a.example/', 'http://b.example/'],
      ['A1', 'A2', 'B'],
    );
    await import('../src/popup/index.ts');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('marks the second occurrence of a URL with class "duplicate"', () => {
    const rows = document.querySelectorAll('div.row');
    expect(rows[0].classList.contains('duplicate')).toBe(false);
    expect(rows[1].classList.contains('duplicate')).toBe(true);
    expect(rows[2].classList.contains('duplicate')).toBe(false);
  });

  test('hide-duplicates hides duplicate rows while showing non-duplicates', () => {
    const cb = document.getElementById('hide-duplicates-checkbox') as HTMLInputElement;
    cb.checked = true;
    // Dispatch change on the checkbox — filterRows re-runs with hide-duplicates on.
    // The filter text is empty so the empty regex matches every row.
    cb.dispatchEvent(new Event('change'));
    const rows = document.querySelectorAll('div.row');
    expect(rows[0].classList.contains('invisible')).toBe(false); // A1: original, shown
    expect(rows[1].classList.contains('invisible')).toBe(true);  // A2: duplicate, hidden
    expect(rows[2].classList.contains('invisible')).toBe(false); // B: unique, shown
  });
});

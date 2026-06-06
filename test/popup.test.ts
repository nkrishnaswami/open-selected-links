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

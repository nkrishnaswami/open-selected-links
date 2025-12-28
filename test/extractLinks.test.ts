// import { describe, it, expect, test, mock } from 'bun:test';
import { describe, it, expect, test, vi } from 'vitest';
import { OSLSession, MakeTabOptions, makeTabsForLinks } from '../src/common/extract-links';


test('creating OSL session', () => {
  const session = new OSLSession(1);
  expect(session.tabId).toEqual(1)
})


interface Message {
  id: string,
  index?: number,
}

browser.tabs.sendMessage = vi.fn();

const fakeSendMessage = async (tabId, msg, frameId) => {
  if (msg.id == 'ping') {
    return 'ack'
  } else if (msg.id == 'get_links') {
    return {'links': ['http://localhost/a'], 'labels': ['a']}
  } else if (msg.id == 'set_highlight') {
    return;
  } else if (msg.id == 'clear_highlights') {
    return;
  } else {
    throw Error(`Invalid message: ${msg}`)
  }
};

test('getting links and labels', async () => {
  browser.scripting = {
    executeScript: vi.fn(),
    insertCSS: vi.fn(),
  }
  browser.tabs.sendMessage.mockReset();
  const session = new OSLSession(1);
  expect(session.tabId).toEqual(1)
  browser.tabs.sendMessage.mockImplementation(fakeSendMessage);
  const {links, labels} = await session.getLinksAndLabels();
  expect(links).toHaveLength(1);
  expect(links).toContain('http://localhost/a')
  expect(labels).toContain('a')
})


test('highlighting', async () => {
  browser.scripting = {
    executeScript: vi.fn(),
    insertCSS: vi.fn(),
  }
  const session = new OSLSession(1);
  expect(session.tabId).toEqual(1)
  browser.tabs.sendMessage.mockReset();
  var has_raised = false;
  browser.tabs.sendMessage.mockImplementation(async (t, m, f) => {
    if (!has_raised) {
      has_raised = true;
      throw Error('no listeners for message');
    }
    return fakeSendMessage(t, m, f);
  });
  const {links, labels} = await session.getLinksAndLabels();
  expect(links).toHaveLength(1);
  await session.highlight(0);
  expect(browser.scripting.insertCSS.mock.calls.length).toEqual(1)
  await session.highlight(0);
  expect(browser.scripting.insertCSS.mock.calls.length).toEqual(1)
  await session.unhighlight();
})

const BASE_WINDOW_ID = 1;
const BASE_TAB_ID = 100;

const setup_extra_chrome_mocks = () => {
  let base_window_id = BASE_WINDOW_ID;
  let base_tab_id = BASE_TAB_ID;

  browser.windows.create.mockReset();
  browser.windows.create.mockImplementation(async (options) => {
    console.log('browser.windows.create', options);
    const {window_id, focused, url} = options;
    const tabs = []
    for (const one_url of url) {
      tabs.push(await browser.tabs.create(
	{url: one_url, window_id, active: focused}))
    }
    if (window_id == browser.windows.WINDOW_ID_NONE) {
      return {id: base_window_id++, tabs, focused};
    }
    return {id: window_id, tabs, focused};
  });

  browser.tabs.create.mockReset();
  browser.tabs.create.mockImplementation(async (options) => {
    console.log('browser.tabs.create', options);
    const {url, window_id, active} = options;
    return {id: base_tab_id++};
  });

  browser.tabs.group = vi.fn(async(options) => {
    console.log('browser.tabs.group', options);
    return 1001;
  });

  browser.tabs.discard = vi.fn(async(options) => {
    console.log('browser.tabs.discard', options);
  });

  browser.tabGroups = {
    TAB_GROUP_ID_NONE: -1,
    update: vi.fn(),
  }
  browser.tabGroups.update.mockReset();
  browser.tabGroups.update.mockImplementation(async (options) => {
    console.log('browser.tabGroups.update', options)
  })
}

test("incrementing mocks work", async () => {
  setup_extra_chrome_mocks();
  var val = await browser.tabs.create({url: 'url', window_id: 9, focused: false});
  console.log('val is', val);
  expect(val.id).toEqual(100);
  val = await browser.tabs.create({url: 'url', window_id: 9, focused: true});
  console.log('val is', val);
  expect(val.id).toEqual(101);
})

describe('make_tabs_for_links: new window', () => {
  test.each([
    [undefined, false, false, false],
    [undefined, true , false, false],
    [undefined, false, true , false],
    [undefined, false, false, true ],
    ["tabGrp",  false, false, false],
    ["tabGrp",  true , false, false],
    ["tabGrp",  false, true , false],
    ["tabGrp",  false, false, true ],
    [1001,  false, false, false],
    [1001,  true , false, false],
    [1001,  false, true , false],
    [1001,  false, false, true ],
    [-1,  false, false, false],
    [-1,  true , false, false],
    [-1,  false, true , false],
    [-1,  false, false, true ],
  ])('tabGroupName: %p, discard: %p, deduplicate: %p, focus: %p',
     async (tabGroupName, discard, deduplicate, focus) => {
       console.log('Test case:', tabGroupName, discard, deduplicate, focus);
       setup_extra_chrome_mocks();
       const tabs = [{id: BASE_TAB_ID}] 
       if (!deduplicate) {
	 tabs.push({id: BASE_TAB_ID + 1})
       }
       await makeTabsForLinks(["http://localhost/a", "http://localhost/a"], {
	 windowId: browser.windows.WINDOW_ID_NONE,
	 frameId: undefined,
	 tabGroupName,
	 discard,
	 deduplicate,
	 focus,    
       });
       expect(browser.windows.create).toHaveBeenCalled()
       expect(browser.windows.create.mock.calls[0][0].url).toHaveLength(tabs.length)
       expect(browser.windows.create.mock.calls[0][0].url).toContain('http://localhost/a')
       expect(browser.windows.create.mock.calls[0][0].focused).toEqual(focus)
       if (discard) {
	 expect(browser.tabs.discard).toHaveBeenCalled();
       }
       
       if (tabGroupName !== undefined && tabGroupName !== browser.tabGroups.TAB_GROUP_ID_NONE) {
 	 expect(browser.tabs.group).toHaveBeenCalled()
	 expect(browser.tabs.group.mock.calls[0][0].tabIds).toEqual(tabs.map((x) => x.id))
	 if (tabGroupName instanceof String) {
	   expect(browser.tabGroups.update).toHaveBeenCalled()
	   expect(browser.tabGroups.update.mock.calls[0][0].title).toEqual(tabGroupName)
	 }
       }
     });
});

describe('make_tabs_for_links: new tabs', () => {
  test.each([
    [undefined, false, false, false],
    [undefined, true , false, false],
    [undefined, false, true , false],
    [undefined, false, false, true ],
    ["tabGrp",  false, false, false],
    ["tabGrp",  true , false, false],
    ["tabGrp",  false, true , false],
    ["tabGrp",  false, false, true ],
    [1001,  false, false, false],
    [1001,  true , false, false],
    [1001,  false, true , false],
    [1001,  false, false, true ],
    [-1,  false, false, false],
    [-1,  true , false, false],
    [-1,  false, true , false],
    [-1,  false, false, true ],
  ])('tabGroupName: %p, discard: %p, deduplicate: %p, focus: %p',
     async (tabGroupName, discard, deduplicate, focus) => {
       setup_extra_chrome_mocks();

       const tabs = [{id: BASE_TAB_ID}] 
       if (!deduplicate) {
	 tabs.push({id: BASE_TAB_ID + 1})
       }
       console.log('options', {tabGroupName, discard, deduplicate, focus})
       
       await makeTabsForLinks(["http://localhost/a", "http://localhost/a"], {
	 windowId: browser.windows.WINDOW_ID_CUR,
	 frameId: undefined,
	 tabGroupName,
	 discard,
	 deduplicate,
	 focus,    
       });
       expect(browser.tabs.create).toHaveBeenCalled()
       expect(browser.tabs.create.mock.calls).toHaveLength(tabs.length)
       if (discard) {
	 expect(browser.tabs.discard).toHaveBeenCalled();
       }
       if (tabGroupName !== undefined && tabGroupName !== browser.tabGroups.TAB_GROUP_ID_NONE) {
	 expect(browser.tabs.group).toHaveBeenCalled()
	 expect(browser.tabs.group.mock.calls[0][0].tabIds).toEqual(tabs.map((x) => x.id))
	 if (tabGroupName instanceof String) {
	   expect(browser.tabGroups.update).toHaveBeenCalled()
	   expect(browser.tabGroups.update.mock.calls[0][0].title).toEqual(tabGroupName)
	 }
       }
     });
});

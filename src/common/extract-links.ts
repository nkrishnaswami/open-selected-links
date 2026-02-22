import browser from 'webextension-polyfill';
import contentScriptPath from '../contentScript/index?script';
import contentCss from '../contentScript/index.css?inline';

interface LinksAndLabels {
  links: string[],
  labels: string[],
}

export class OSLSession {
  tabId: number
  frameId: number

  constructor(tabId: number, frameId?: number) {
    this.tabId = tabId;
    this.frameId = frameId || 0;
  }

  async setup() {
    try {
      const response = await browser.tabs.sendMessage(
        this.tabId,
        { id: 'ping' },
        { frameId: this.frameId });
      if (response != 'ack') {
        throw new Error(`Unexpected response; reinjecting content script: ${response}`)
      }
    } catch (e) {
      console.log(e)
      console.log('inserting CSS')
      try {
        await browser.scripting.insertCSS({
          css: contentCss,
          target: { tabId: this.tabId, frameIds: [this.frameId] },
        });
      } catch (cssErr) {
        console.log('insertCSS failed (continuing):', cssErr);
      }
      console.log('executing script')
      await browser.scripting.executeScript({
        files: [contentScriptPath],
        target: { tabId: this.tabId, frameIds: [this.frameId] }
      });
      console.log('script executed')
      await new Promise((resolve, reject) => { setTimeout(() => { resolve(void 1); }, 10) });
      console.log('yielded and returned')
    }
  }

  async getLinksAndLabels(): Promise<LinksAndLabels> {
    await this.setup();
    const results = await browser.tabs.sendMessage(
      this.tabId,
      { id: 'get_links' },
      { frameId: this.frameId });
    console.log('results:', results)
    return results as LinksAndLabels;
  }

  async highlight(index: number) {
    console.log('Highlighting', index)
    await browser.tabs.sendMessage(
      this.tabId,
      { id: 'set_highlight', index: index },
      { frameId: this.frameId });
  }

  async unhighlight() {
    console.log('Unhighlighting')
    await browser.tabs.sendMessage(
      this.tabId,
      { id: 'clear_highlights' },
      { frameId: this.frameId });
  }
}

export interface MakeTabOptions {
  windowId?: number,
  frameId?: number,
  tabGroupName?: string,
  discard?: boolean,
  deduplicate?: boolean,
  focus?: boolean,
  position?: 'left' | 'right',
  display?: any
}

export const makeTabsForLinks = async (links: string[], options: MakeTabOptions) => {
  if (!links || links.length === 0) {
    console.log('No links in selection')
    return
  }
  var tabIds: number[];
  if (options.deduplicate) {
    links = Array.from(new Set(links))
  }
  if (options.windowId === browser.windows.WINDOW_ID_NONE) {
    tabIds = await createWindow(links, options)
  } else {
    tabIds = await createTabs(links, options)
  }
  if (options.tabGroupName) {
    await groupTabs(tabIds, options.windowId, options.tabGroupName)
  }
}

interface ScreenDetailed extends Screen {
  top: number
  left: number
  availTop: number
  availLeft: number
}

interface Bounds {
  height: number;
  width: number;
  top: number;
  left: number;
}

const discardTabs = (tabIds: number[]) => {
  return new Promise((resolve, reject) => {
    const tabIdSet = new Set(tabIds);
    const listener = async (tabId: number, info: any, tab: any) => {
      if (info.status != "complete") {
	return;
      }
      if (tabIdSet.has(tabId)) {
	try {
          console.log('Discarding tab', tabId);
          await browser.tabs.discard(tabId);
	} catch (e) {
          console.error('Error discarding tab', browser.runtime.lastError, e);
	}
	tabIdSet.delete(tabId);
	if (tabIdSet.size == 0) {
          console.log('Removing listener');
          browser.tabs.onUpdated.removeListener(listener);
	  resolve(undefined)
	}
      }
    };
    browser.tabs.onUpdated.addListener(listener)
  });
}

const createWindow = async (links: string[], options: MakeTabOptions): Promise<number[]> => {
  console.log(`Creating window with ${links.length} tabs`)
  var workArea: Bounds | undefined;
  if (options.display) {
    workArea = options.display.workArea;
  } else if (window?.screen) {
    const screen = window.screen as ScreenDetailed
    workArea = {
      height: screen.availHeight ?? screen.height,
      width: screen.availWidth ?? screen.width,
      top: screen.availTop ?? screen.top,
      left: screen.availLeft ?? screen.left,
    }
  }
  console.log('Creating window: workArea:', workArea)
  const windowCreateOptions: browser.Windows.CreateCreateDataType = {
    url: links,
    focused: options.focus,
  };
  if (workArea) {
    if (options.position === 'left') {
      windowCreateOptions.top = workArea.top;
      windowCreateOptions.left = workArea.left;
      windowCreateOptions.width = Math.floor(workArea.width / 2);
      windowCreateOptions.height = workArea.height;
      windowCreateOptions.focused = true;
    } else if (options.position === 'right') {
      windowCreateOptions.top = workArea.top;
      windowCreateOptions.left = workArea.left + Math.floor(workArea.width / 2);
      windowCreateOptions.width = Math.floor(workArea.width / 2);
      windowCreateOptions.height = workArea.height;
      windowCreateOptions.focused = false;
    } else if (options.display) {
      // User explicitly requested a display
      windowCreateOptions.top = workArea.top;
      windowCreateOptions.left = workArea.left;
    }
  }
  console.log('Creating window: options:', windowCreateOptions)
  var newWindow;
  const tabIds: number[] = []
  try {
    newWindow = await browser.windows.create(windowCreateOptions)
  } catch (e) {
    console.error('Error creating tab', browser.runtime.lastError, e);
    return tabIds
  }
  console.log('Created window:', newWindow)
  options.windowId = newWindow.id
  if (!newWindow.tabs) {
    return tabIds;
  }
  for (const tab of newWindow.tabs) {
    if (tab.id !== undefined) {
      console.log('Returning tab', tab.id);
      tabIds.push(tab.id)
    }
  }
  if (options.focus) {
    console.log('Giving focus to tab', tabIds[0]);
    await browser.tabs.update(tabIds[0], { active: true })
  }
  if (options.discard) {
    await discardTabs(tabIds)
  }
  return tabIds
}

const createTabs = async (links: string[], options: MakeTabOptions): Promise<number[]> => {
  console.log(`Creating ${links.length} tabs in window ${options.windowId}`)
  const tabIds: number[] = []
  for (const link of links) {
    console.log(`Creating tab for ${link}`)
    var tab;
    try {
      tab = await browser.tabs.create({
        url: link,
        windowId: options.windowId,
        active: false,
      })
    } catch (e) {
      console.error('Error creating tab', browser.runtime.lastError, e);
      continue
    }
    console.log(`Created tab`, tab)
    if (!tab.id) {
      continue;
    }
    tabIds.push(tab.id)
  }
  if (options.focus) {
    console.log('Making first tab active');
    await browser.tabs.update(tabIds[0], { active: true })
  }
  if (options.discard) {
    await discardTabs(tabIds)
  }
  return tabIds
}

const groupTabs = async (tabIds: number[], windowId: number | undefined, tabGroupName: string) => {
  const groupId = parseInt(tabGroupName)
  if (!isNaN(groupId)) {
    if (groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) {
      console.log('Grouping tabs in existing group');
      await browser.tabs.group({ tabIds, groupId })
    }
  } else {
    console.log('Grouping tabs in new group', tabGroupName);
    const groupId = await browser.tabs.group({ tabIds, createProperties: { windowId: windowId } })
    await browser.tabGroups.update(groupId, { title: tabGroupName })
  }
}

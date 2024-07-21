interface LinksAndLabels {
  links: string[],
  labels: string[],
}

export class OSLSession {
  tabId: number
  frameId: number
  
  constructor(tabId: number, frameId?: number) {
    this.tabId = tabId
    this.frameId = frameId || 0
  }

  async getLinksAndLabels(): Promise<LinksAndLabels> {
    const results: LinksAndLabels = await chrome.tabs.sendMessage(
      this.tabId,
      { id: 'get_links' },
      { frameId: this.frameId },
    ) as unknown as LinksAndLabels;
    console.log(results)
    return results
  }

  async highlight(index: Number) {
    console.log('Highlighting', index)
    await chrome.tabs.sendMessage(
      this.tabId,
      { id: 'set_highlight', index },
      { frameId: this.frameId });
  }

  async unhighlight() {
    console.log('Unhighlighting')
    await chrome.tabs.sendMessage(
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
  if (options.windowId === chrome.windows.WINDOW_ID_NONE) {
    tabIds = await createWindow(links, options)
  } else {
    tabIds = await createTabs(links, options)
  }
  if (options.tabGroupName) {
    await groupTabs(tabIds, options.windowId, options.tabGroupName)
  }
}

const createWindow = async (links: string[], options: MakeTabOptions): Promise<number[]> => {
  console.log(`Creating window with ${links.length} tabs`)
  const window = await chrome.windows.create({
    focused: options.focus,
    url: links,
  })
  console.log('Window details:', window)
  options.windowId = window.id
  const tabIds: number[] = []
  if (!window.tabs) {
    return tabIds;
  }
  for (const tab of window.tabs) {
    if (tab.id !== undefined) {
      if (options.discard) {
	chrome.tabs.discard(tab.id)
      }
      tabIds.push(tab.id)
    }
  }
  if (options.focus) {
    await chrome.tabs.update(tabIds[0], { active: true })
  }
  return tabIds
}

const createTabs = async (links: string[], options: MakeTabOptions): Promise<number[]> => {
  console.log(`Creating ${links.length} tabs in window ${options.windowId}`)
  const tabIds: number[] = []
  for (const link of links) {
    console.log(`Creating tab for ${link}`)
    const tab = await chrome.tabs.create({
      url: link,
      windowId: options.windowId,
      active: false,
    })
    if (!tab.id) {
      continue;
    }
    if (options.discard) {
      chrome.tabs.discard(tab.id)
    }
    tabIds.push(tab.id)
    console.log('Tab:', tab)
  }
  if (options.focus) {
    await chrome.tabs.update(tabIds[0], { active: true })
  }
  return tabIds
}

const groupTabs = async (tabIds: number[], windowId: number | undefined, tabGroupName: string) => {
  console.log(`Grouping tabs with ID ${tabGroupName}: ${tabIds}`)
  try {
    const groupId = parseInt(tabGroupName)
    if (groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      console.log(`Adding ${tabIds.length} tabs to tab group {tabGroupId}}`)
      await chrome.tabs.group({ tabIds, groupId })
    }
  } catch (e) {
    const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId: windowId } })
    await chrome.tabGroups.update(groupId, { title: tabGroupName })
  }
}

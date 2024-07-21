export class OSLSession {
  constructor(tabId, frameId) {
    self.tabId = tabId;
    self.frameId = frameId || 0;
    self.script = undefined;
  }

  async Start() {
    self.script = chrome.scripting ?
      chrome.scripting.executeScript(
        {
          target: {frameIds: [self.frameId], tabId},
          files: ['/scripts/get_links_in_selection.js'],
        }) :
      chrome.tabs.executeScript(
        tabId,
        {
          frameId: self.frameId,
          file: '/scripts/get_links_in_selection.js'
        });
    const results = await self.script;
    if (!results[0].result.success) {
      console.log({
	'msg': 'Content script did not complete successfully',
	'result': results[0]
      })

      throw {'msg': 'Content script did not complete successfully',
	     'result': results[0]
	    }
    }
  }

  async GetLinksAndLabels() {
    const results = await chrome.tabs.sendMessage(self.tabId, {id: 'get_links'}, {frameId: self.frameId});
    console.log(results);
    return results;
  }

  async Highlight(index) {
    console.log('Highlighting', index)
    await chrome.tabs.sendMessage({id: 'set_highlight', index})
  }

  async Unhighlight() {
    console.log('Highlighting', index)
    await chrome.tabs.sendMessage({id: 'clear_highlights'})
  }

  async Stop() {
    await chrome.tabs.sendMessage({id: 'shut_down'})
    existing_sessions.delete(self.tabId)
  }
}

export const MakeTabsForLinks = async function(links, options) {
  if (!links || links.length === 0) {
    console.log('No links in selection');
    return;
  }
  var tabIds;
  if (options.deduplicate) {
    links = Array.from(new Set(links));
  }
  if (options.windowId === chrome.windows.WINDOW_ID_NONE) {
    tabIds = await CreateWindow(links, options);
  } else {
    tabIds = await CreateTabs(links, options);
  }
  if (options.tabGroupName != undefined) {
    await GroupTabs(tabIds, options.windowId, options.tabGroupName);
  }
}

const CreateWindow = async function(links, options) {
  console.log(`Creating window with ${links.length} tabs`);
  const window = await chrome.windows.create({
    focused: options.focus,
    url: links,
  });
  console.log('Window details:', window);
  options.windowId = window.id;
  const tabIds = [];
  for (const tab of window.tabs) {
    if (options.discard) {
      chrome.tabs.discard(tab.id);
    }
    tabIds.push(tab.id);
  }
  if (options.focus) {
    await chrome.tabs.update(tabIds[0], {active: true})
  }
  return tabIds;
}

const CreateTabs = async function(links, options) {
  console.log(`Creating ${links.length} tabs in window ${options.windowId}`);
  const tabIds = [];
  for (const link of links) {
    console.log(`Creating tab for ${link}`);
    const tab = await chrome.tabs.create({
      url: link,
      windowId: options.windowId,
      active: false,
    });
    if (options.discard) {
	chrome.tabs.discard(tab.id);
    }
    tabIds.push(tab.id);
    console.log('Tab:', tab);
  }
  if (options.focus) {
    await chrome.tabs.update(tabIds[0], {active: true})
  }
  return tabIds;
}

const GroupTabs = async function(tabIds, windowId, tabGroupName) {
  console.log(`Grouping tabs with ID ${tabGroupName}: ${tabIds}`);
  try {
    const groupId = parseInt(options.tabGroupName);
    if (groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      console.log(`Adding ${tabIds.length} tabs to tab group {tabGroupId}}`);
      await chrome.tabs.group({tabIds, groupId});
    }
  } catch (e) {
    const groupId = await chrome.tabs.group({tabIds, createProperties: {windowId: windowId}});
    await chrome.tabGroups.update(groupId, {title: tabGroupName});
  }
}

export const GetLinksFromSelection = async function(tabId, frameId) {
  const scriptResults = chrome.scripting ?
        (await chrome.scripting.executeScript(
          {
            target: {frameIds: [frameId || 0], tabId},
            files: ['get_links_in_selection.js'],
          }))[0].result :
        (await chrome.tabs.executeScript(
          tabId,
          {
            frameId: frameId || 0,
            file: 'get_links_in_selection.js'
          }))[0];
  console.log('GetLinksFromSelection results:', scriptResults);
  return scriptResults;
}

export const MakeTabsForLinks = async function(links, options) {
  if (!links || links.length === 0) {
    console.log('No links in selection');
    return;
  }
  const tabIds = [];
  if (options.windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log(`Creating window with ${links.length} tabs`);
    const window = await chrome.windows.create({
      focused: true,
      url: links,
    });
    console.log('Window details:', window);
    options.windowId = window.id;
    for (const tab of window.tabs) {
      if (options.discard) {
	chrome.tabs.discard(tab.id);
      }
      tabIds.push(tab.id);
    }
  } else {
    console.log(`Creating ${links.length} tabs in window ${options.windowId}`);
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
  }
  if (options.tabGroupName) {
    try {
      const groupId = parseInt(options.tabGroupName);
      if (groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        console.log(`Adding ${tabIds.length} tabs to tab group {tabGroupId}}`);
        await chrome.tabs.group({tabIds, groupId});
      }
    } catch (e) {
      const groupId = await chrome.tabs.group({tabIds, createProperties: {windowId: options.windowId}});
      await chrome.tabGroups.update(groupId, {title: options.tabGroupName});
    }
  }
}

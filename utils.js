import {Promisify} from './promisify.js';

export const GetLinksFromSelection = async function(tabId, frameId) {
  const scriptResults = await Promisify(chrome.tabs.executeScript)(
    tabId,
    {
      frameId: frameId || 0,
      file: 'get_links_in_selection.js'
    });
  console.log('GetLinksFromSelection results:', scriptResults);
  if (scriptResults == undefined || scriptResults.length == 0) {
    return {};
  }
  return scriptResults[0];
}

export const MakeTabsForLinks = async function(links, windowId) {
  if (!links || links.length === 0) {
    console.log('No links in selection');
    return;
  }
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log(`Creating window with ${links.length} tabs`);
    const window = await Promisify(chrome.windows.create)({
      focused: true,
      setSelfAsOpener: true,
      url: links,
    });
    console.log('Window details:', window);
  } else {
    console.log(`Creating ${links.length} tabs in window ${windowId}`);
    for (const link of links) {
      console.log(`Creating tab for ${link}`);
      const tab = await Promisify(chrome.tabs.create)({
	url: link,
	windowId: windowId,
	active: false,
      });
      console.log('Tab:', tab);
    }
  }
}

import {GetLinksFromSelection, MakeTabsForLinks} from './utils.js';

const kCurWindowMenuItemId = 'open-selected-links-cur-window';
const kNewWindowMenuItemId = 'open-selected-links-new-window';

const OpenLinksInSelection = async function(info, tab) {
  console.log('Got menu click: ', info.menuItemId);
  let windowId;
  if (info.menuItemId === kCurWindowMenuItemId) {
    windowId = chrome.windows.WINDOW_ID_CURRENT;
  } else if (info.menuItemId === kNewWindowMenuItemId) {
    windowId = chrome.windows.WINDOW_ID_NONE;
  } else {
    // Not our circus, not our monkeys.
    return;
  }
  const {links} = await GetLinksFromSelection(tab.id, info.frameId);
  await MakeTabsForLinks(links, windowId);
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Installing menu listeners');
  await chrome.contextMenus.create({
    id: kNewWindowMenuItemId,
    contexts: ["selection"],
    type: 'normal',
    title: 'Open all selected links in a new window',
    visible: true,
  }, ()=>{console.log('Added menu item')});

  await chrome.contextMenus.create({
    id: kCurWindowMenuItemId,
    contexts: ["selection"],
    type: 'normal',
    title: 'Open all selected links in the current window',
    visible: true,
  }, ()=>{console.log('Added menu items')});

  chrome.contextMenus.onClicked.addListener(OpenLinksInSelection);
});


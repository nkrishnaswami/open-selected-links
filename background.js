import {GetLinksFromSelection, MakeTabsForLinks} from './utils.js';

const kCurWindowMenuItemId = 'open-selected-links-cur-window';
const kNewWindowMenuItemId = 'open-selected-links-new-window';
const kNewTabGroupMenuItemId = 'open-selected-links-new-tab-group';

const OpenLinksInSelection = async function(info, tab) {
  console.log('Got menu click: ', info.menuItemId);
  const options = {};
  if (info.menuItemId === kCurWindowMenuItemId) {
    options.windowId = chrome.windows.WINDOW_ID_CURRENT;
  } else if (info.menuItemId === kNewWindowMenuItemId) {
    options.windowId = chrome.windows.WINDOW_ID_NONE;
  } else if (info.menuItemId === kNewTabGroupMenuItemId) {
    options.windowId = chrome.windows.WINDOW_ID_CURRENT;
    options.tabGroupName = "New Tab Group";
  } else {
    // Not our circus, not our monkeys.
    return;
  }
  const {links} = await GetLinksFromSelection(tab.id, info.frameId);
  await MakeTabsForLinks(links, options);
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Creating context menus');
  await chrome.contextMenus.create({
    id: kNewWindowMenuItemId,
    contexts: ["selection"],
    type: 'normal',
    title: 'Open all selected links in a new window',
    visible: true,
  }, ()=>{console.log('Added new-window menu item')});

  await chrome.contextMenus.create({
    id: kCurWindowMenuItemId,
    contexts: ["selection"],
    type: 'normal',
    title: 'Open all selected links in the current window',
    visible: true,
  }, ()=>{console.log('Added cur-window menu item')});

  if (chrome.tabGroups !== undefined) {
    await chrome.contextMenus.create({
      id: kNewTabGroupMenuItemId,
      contexts: ["selection"],
      type: 'normal',
      title: 'Open all selected links in a new tab group',
      visible: true,
    }, ()=>{console.log('Added new-tab-group menu item')});
  }
});

chrome.contextMenus.onClicked.addListener(OpenLinksInSelection);

import {GetLinksFromSelection, MakeTabsForLinks} from './utils.js';

const kCurWindowMenuItemId = 'open-selected-links-cur-window';
const kNewWindowMenuItemId = 'open-selected-links-new-window';

const OpenLinksInSelectionInCurrentWindow = async function(info, tab) {
  console.log('Got menu click: ', info.menuItemId);
  if (info.menuItemId !== kCurWindowMenuItemId) {
    // Not our circus, not our monkeys.
    return;
  }
  const {links} = await GetLinksFromSelection(tab.id, info.frameId);
  await MakeTabsForLinks(links, chrome.windows.WINDOW_ID_CURRENT)
}

const OpenLinksInSelectionInNewWindow = async function(info, tab) {
  console.log('Got menu click: ', info.menuItemId);
  if (info.menuItemId !== kNewWindowMenuItemId) {
    // Not our circus, not our monkeys.
    return;
  }
  const {links} = await GetLinksFromSelection(tab.id, info.frameId);
  await MakeTabsForLinks(links, chrome.windows.WINDOW_ID_NONE)
}

chrome.contextMenus.onClicked.addListener(OpenLinksInSelectionInNewWindow);
chrome.contextMenus.onClicked.addListener(OpenLinksInSelectionInCurrentWindow);
console.log('Added listeners')

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: kNewWindowMenuItemId,
    contexts: ["selection"],
    type: 'normal',
    title: 'Open all selected links in a new window',
    visible: true,
  }, ()=>{console.log('Added menu item')});
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: kCurWindowMenuItemId,
    contexts: ["selection"],
    type: 'normal',
    title: 'Open all selected links in the current window',
    visible: true,
  }, ()=>{console.log('Added menu item')});
})

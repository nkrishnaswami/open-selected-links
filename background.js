import {GetLinksFromSelection, OpenLinksInNewWindow} from './utils.js';

const kMenuItemId = 'open-selected-links';

const OpenLinksInSelection = async function(info, tab) {
  console.log('Got menu click: ', info.menuItemId);
  if (info.menuItemId !== kMenuItemId) {
    // Not our circus, not our monkeys.
    return;
  }
  const {links} = await GetLinksFromSelection(tab.id, info.frameId);
  await OpenLinksInNewWindow(links)
}

chrome.contextMenus.onClicked.addListener(OpenLinksInSelection);
console.log('Added listener')

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: kMenuItemId,
    contexts: ["selection"],
    type: 'normal',
    title: 'Open all selected links in a new window',
    visible: true,
  }, ()=>{console.log('Added menu item')});
});

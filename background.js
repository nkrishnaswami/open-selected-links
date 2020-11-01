/*
 * Converts a function taking a callback receiving values into a
 * Promise.
 *
 * @param {Function} func This is a function taking one or more
 *     arguments, the last of which is a callback function. Its return
 *     value, if any, is discarded. Note that if the callback is
 *     expected to take an error argument, this will be resolved
 *     rather than rejected.
 * @return {Promise} A promise that resolves to the callback's
 *     arguments as an array.
 */
const promisify = function(func) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      args.push((...cb_args) => {
	resolve(cb_args);
      });
      func(...args);
    });
  }
}

const kMenuItemId = 'open-selected-links';

const OpenLinksInSelection = async function(info, tab) {
  console.log('Got menu click: ', info.menuItemId);
  if (info.menuItemId !== kMenuItemId) {
    return;
  }
  const {frameId} = info;
  const links = (await promisify(chrome.tabs.executeScript)(
    tab.id,
    {
      frameId: frameId,
      file: 'get_links_in_selection.js'
    })).flat(2);
  console.log('links are', links);
  if (links.length === 0) {
    console.log('No links in selection');
    return;
  }
  console.log(`Creating window with ${links.length} tabs`);
  const window = (await promisify(chrome.windows.create)({
    focused: false,
    setSelfAsOpener: true,
    url: links,
  }))[0];
  console.log('Window details:', window);
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

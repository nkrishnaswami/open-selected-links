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

export const OpenLinksInNewWindow = async function(links) {
  if (!links || links.length === 0) {
    console.log('No links in selection');
    return;
  }
  console.log(`Creating window with ${links.length} tabs`);
  const window = await Promisify(chrome.windows.create)({
    focused: true,
    setSelfAsOpener: true,
    url: links,
  });
  console.log('Window details:', window);
}

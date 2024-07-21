import {LoadSettings} from './settings.js';
import {OSLSession, MakeTabsForLinks} from './utils.js';


const OSLTargets = [
  {
    id: 'current_window',
    title: 'Open all selected links in a new window',
    menu_item_id: 'open-selected-links-cur-window',
    command: "osl_in_tabs",
  }, {
    id: 'new_window',
    title: 'Open all selected links in the current window',
    menu_item_id: 'open-selected-links-new-window',
    command: "osl_in_window",
  }, {
    id: 'new_tab_group',
    title: 'Open all selected links in a new tab group',
    menu_item_id: 'open-selected-links-new-tab-group',
    command: "osl_in_tab_group",
  } 
];

const OSLTargetsByMenuItemID = Object.fromEntries(
  OSLTargets.map(oslTarget => [oslTarget.menu_item_id, oslTarget.id]));

const OSLTargetsByCommand = Object.fromEntries(
  OSLTargets.map(oslTarget => [oslTarget.command, oslTarget.id]));

const ProcessOSLRequest = async function(osl_request_id, tab, frame_id) {
  const settings = await GetSettings();
  const options = {discard: settings.auto_discard};
  if (osl_target_id == 'current_window') {
    options.windowId = chrome.windows.WINDOW_ID_CURRENT;
  } else if (osl_target_id == 'new_window') {
    options.windowId = chrome.windows.WINDOW_ID_NONE;
  } else if (osl_target_id == 'new_tab_group') {
    options.windowId = chrome.windows.WINDOW_ID_CURRENT;
    options.tabGroupName = settings.new_tab_group_name || "New Tab Group";
  } else {
    // Not our circus, not our monkeys.
    return;
  }
  const session = new OSLSession(tab.id, frameId);
  await session.Start();
  const {links} = await session.GetLinksAndLabels();
  await MakeTabsForLinks(links, options);
}

const HandleOpenSelectedLinkMenuClick = async function(info, tab) {
  console.log('Got menu click: ', info.menuItemId);
  await ProcessOSLRequest(OSLTargetsByMenuItemID[info.menuItemId], tab, info.frameId)
}

const HandleOpenSelectedLinksCommand = async function(command, tab) {
  console.log('Got command: ', command);
  await ProcessOSLRequest(OSLTargetsByCommand[command], tab, info.frameId)
}

const SetupOSLActions() {
  chrome.contextMenus.removeAll();
  for (const oslTarget of OSLTargets) {
    chrome.contextMenus.create({
      id: oslTarget.menu_item_id,
      contexts: ["selection"],
      type: 'normal',
      title: oslTarget.title,
      visible: true,
    }, ()=>{console.log('Added new-window menu item', oslTarget)});
  }
  chrome.contextMenus.onClicked.addListener(HandleOpenSelectedLinkMenuClick);
  chrome.commands.onCommand.addListener(HandleOpenSelectedLinksCommand);
}

SetupOSLActions();

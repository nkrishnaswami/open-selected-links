import {MakeTabOptions, OSLSession, makeTabsForLinks} from '../common/extract-links';
import {loadSettings} from '../common/settings';


enum OSLRequestID {
  CurrentWindow = 'current_window',
  NewWindow = 'new_window',
  NewTabGroup = 'new_tab_group',
}

enum OSLMenuItemID {
  CurrentWindow = 'open-selected-links-cur-window',
  NewWindow = 'open-selected-links-new-window',
  NewTabGroup = 'open-selected-links-new-tab-group',
}

enum OSLCommandID {
  CurrentWindow = 'osl_in_tabs',
  NewWindow = 'osl_in_window',
  NewTabGroup = 'osl_in_tab_group',
}

interface OSLRequestSpec {
  id: OSLRequestID,
  title: string,
  menu_item_id: OSLMenuItemID,
  command: OSLCommandID,
}

const oslRequestSpecs: OSLRequestSpec[] = [
  {
    id: OSLRequestID.CurrentWindow,
    title: 'Open all selected links in the current window',
    menu_item_id: OSLMenuItemID.CurrentWindow,
    command: OSLCommandID.CurrentWindow,
  }, {
    id: OSLRequestID.NewWindow,
    title: 'Open all selected links in a new window',
    menu_item_id: OSLMenuItemID.NewWindow,
    command: OSLCommandID.NewWindow,
  }, {
    id: OSLRequestID.NewTabGroup,
    title: 'Open all selected links in a new tab group',
    menu_item_id: OSLMenuItemID.NewTabGroup,
    command: OSLCommandID.NewTabGroup,
  } 
];

const oslRequestIDsByMenuItemID = Object.fromEntries(
  oslRequestSpecs.map(oslRequestSpec => [oslRequestSpec.menu_item_id, oslRequestSpec.id]));

const oslRequestIDsByCommand = Object.fromEntries(
  oslRequestSpecs.map(oslRequestSpec => [oslRequestSpec.command, oslRequestSpec.id]));

const processOSLRequest = async (osl_request_id: OSLRequestID, tab: chrome.tabs.Tab, frame_id?: number) => {
  const settings = await loadSettings();
  const options: MakeTabOptions = {
    discard: settings.auto_discard,
    deduplicate: settings.deduplicate,
    focus: settings.focus,
  };
  if (osl_request_id == 'current_window') {
    options.windowId = chrome.windows.WINDOW_ID_CURRENT;
  } else if (osl_request_id == 'new_window') {
    options.windowId = chrome.windows.WINDOW_ID_NONE;
  } else if (osl_request_id == 'new_tab_group') {
    options.windowId = chrome.windows.WINDOW_ID_CURRENT;
    options.tabGroupName = settings.new_tab_group_name || "New Tab Group";
  } else {
    // Not our circus, not our monkeys.
    return;
  }
  if (!tab.id) {
    console.log('No tab ID found');
    return;
  }
  const session = new OSLSession(tab.id, frame_id);
  const {links} = await session.getLinksAndLabels();
  await makeTabsForLinks(links, options);
}

const handleOpenSelectedLinkMenuClick = async (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab | undefined) => {
  console.log('Got menu click: ', info.menuItemId);
  if (!tab) {
    console.log('No tab found');
    return;
  }
  const osl_request_id = oslRequestIDsByMenuItemID[info.menuItemId]
  if (osl_request_id) {
    await processOSLRequest(osl_request_id, tab, info.frameId)
  }
}

const handleOpenSelectedLinksCommand = async (command: string, tab: chrome.tabs.Tab) => {
  console.log('Got command: ', command);
  const osl_request_id = oslRequestIDsByCommand[command as OSLCommandID];
  if (osl_request_id) {
    await processOSLRequest(osl_request_id, tab)
  }
}

const setupOSLActions = () => {
  chrome.contextMenus.removeAll();
  for (const oslRequestSpec of oslRequestSpecs) {
    chrome.contextMenus.create({
      id: oslRequestSpec.menu_item_id,
      contexts: ["selection"],
      type: 'normal',
      title: oslRequestSpec.title,
      visible: true,
    }, ()=>{console.log('Added OSL menu item', oslRequestSpec.id)});
  }
  chrome.contextMenus.onClicked.addListener(handleOpenSelectedLinkMenuClick);
  chrome.commands.onCommand.addListener(handleOpenSelectedLinksCommand);
}

setupOSLActions();

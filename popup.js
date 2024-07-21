import {LoadSettings} from './settings.js';
import {OSLSession, MakeTabsForLinks} from './utils.js';

const ShowError = function(title, subtitle) {
  document.getElementById('error').innerText = title
  if (subtitle) {
    document.getElementById('error_sub').innerText = subtitle
  }
}


const ApplySettings = async function() {
  const setting_to_id = new Map([
    ['use_new_window', 'new-window-checkbox'],
    ['new_tab_group_name', 'tab-group-name'],
    ['auto_discard', 'discard-tab-checkbox'],
    ['deduplicate', 'deduplicate-links-checkbox'],
    ['focus', 'focus-checkbox'],
  ]);
  const settings = await LoadSettings();
  console.log('settings', settings)
  for (const [setting, id] of setting_to_id) {
    const element = document.getElementById(id)
    console.log('ApplySettings:', setting, settings[setting], element)
    if (element.type == 'checkbox') {
      element.checked = settings[setting]
    } else if (element.type == 'text') {
      element.value = settings[setting] ? settings[setting] : null;
    }
  }
}

const GetCurrentTabId = async function() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    console.log('GetCurrentTabId: Getting current tab:', tab);
    return tab.id;
  } catch(e) {
    if (e.name === 'TypeError') {
      var [tab] = await chrome.tabs.query({
	active: true,
	currentWindow: true
      });
    }
    console.log('GetCurrentTabId: Getting current tab:', tab);
    return tab.id;
  }
}

const GetAllTabGroups = async function() {
  try {
    return await chrome.tabGroups.query({});
  } catch(e) {
    return [];
  }
}

const OpenLinks = async function(event) {
  console.log('OpenLinks: Button pressed! Form is', event);
  const form = event.target.parent;
  console.log('OpenLinks: Form:', form);
  const links = [];
  const inputs = document.querySelectorAll('input[name="select-links"]:checked');
  console.log('OpenLinks: Checked', inputs);
  console.log('OpenLinks: Links:', links);
  const options = {
    windowId: document.getElementById('new-window-checkbox').checked ?
      chrome.windows.WINDOW_ID_NONE : chrome.windows.WINDOW_ID_CURRENT,
    tabGroupName: document.getElementById('tab-group-name').value || undefined,
    discard: document.getElementById('discard-tab-checkbox').checked,
    deduplicate: document.getElementById('deduplicate-links-checkbox').checked,
    focus: document.getElementById('focus-checkbox').checked
  };
  try {
    await MakeTabsForLinks(links, options);
  } catch(e) {
    ShowError(String(e));
    throw e
  }
  // window.close();
}

const AddLinkCheckboxes = async function(links, labels, session) {
  // Set up the link selector inputs.
  const formElement = document.getElementById('select-links-div');
  const seen = new Set()
  for(var idx=0; idx < links.length; ++idx) {
    const link = links[idx];
    const label = labels[idx];
    const duplicate = seen.has(link);
    seen.add(link);
    console.log('RenderForm: Link is', link, 'and label is', label);
    const rowElement = document.createElement('div');
    rowElement.className = 'row';
    if (duplicate) {
      rowElement.classList.add('duplicate');
    }
    formElement.appendChild(rowElement);
    const inputElement = document.createElement('input');
    inputElement.id = `input-${idx}`;
    inputElement.type = 'checkbox';
    inputElement.name = 'select-links';
    inputElement.value = link;
    rowElement.appendChild(inputElement);
    
    const labelElement = document.createElement('label');
    labelElement.for = inputElement.id;
    const anchorElement = document.createElement('a');
    anchorElement.href = link;
    anchorElement.title = link;
    anchorElement.textContent = label.trim() || link;

    labelElement.addEventListener('onmouseover', async () => {
      console.log('mouseenter');
      await session.Highlight(idx);
    })
    labelElement.addEventListener('onmouseout', async () => {
      console.log('mouseleave');
      await session.Unhighlight(idx)
    });


    labelElement.appendChild(anchorElement);
    rowElement.appendChild(labelElement);
  }
}

const RenderForm = async function(links, labels, session) {
  if (chrome.tabGroups === undefined) {
    console.log('Tab groups not supported: hiding UI');
    document.getElementById('tab-group-ui').style.display = 'none';
  }
  if (!links) {
    ShowError('No links selected');
    document.querySelector('form[name="SelectLinks"]').style.display = 'none';
    return;
  }
  await AddLinkCheckboxes(links, labels, session);
}

const HighlightRegex = function(root, regex) {
  console.log("Matching", regex);
  const matches = Array.from(root.textContent.matchAll(regex)).reverse();
  console.log("Found", matches.length, "matches")
  for (const matchItem of matches) {
    console.log(`Processing match "${matchItem[0]}" (${matchItem.index}:${matchItem.index + matchItem[0].length})`)
    const match = matchItem[0]
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    const startIndex = matchItem.index
    const endIndex = startIndex + match.length;
    var curIndex = 0; // index into root.textContent
    var nodeIndex = 0; // index into current nodeValue
    var matchedCount = 0; // number of matched characters highlighted

    let node = walker.firstChild();
    let nodeMatchStart = 0
    // find the start of the match
    while (node && startIndex >= curIndex + node.nodeValue.length) {
      curIndex += node.nodeValue.length;
      node = walker.nextNode()
    }
    if (!node) {
      console.log("No match start");
      return;
    }
    // how far into the node value does the match start?
    nodeMatchStart = startIndex - curIndex;
    console.log(`Found match start ${startIndex} at ${curIndex}+${nodeMatchStart}: ${node.nodeValue.slice(nodeMatchStart)}`);

    // Highlight subspans till the end of the match
    while (node && curIndex <= endIndex) {
      const text = node.nodeValue;
      console.log(`Looking for match end ${endIndex} in node (${curIndex}, ${curIndex + text.length})`);
      let replacements = []
      if (nodeMatchStart > 0) {
	console.log("prefix text:", text.slice(0, nodeMatchStart))
	replacements.push(text.slice(0, nodeMatchStart));
      }
      const span = document.createElement('span');
      span.className = 'highlight';
      let nodeMatchEnd;
      if (curIndex + text.length > endIndex) {
	nodeMatchEnd = endIndex - curIndex;
      } else {
	nodeMatchEnd = text.length;
      }
      span.innerText = text.slice(nodeMatchStart, nodeMatchEnd);
      console.log('Content text:', nodeMatchStart, nodeMatchEnd, span.innerText);
      replacements.push(span);
      if (nodeMatchEnd < text.length) {
	console.log("suffix text:", text.slice(nodeMatchEnd))
	replacements.push(text.slice(nodeMatchEnd));
      }
      console.log('Replacing', node, "with", replacements);
      const nextNode = walker.nextNode();
      node.replaceWith(...replacements)
      curIndex += text.length;
      nodeMatchStart = 0
      node = nextNode;
      console.log("Next node is", node.nodeValue);
    }
  }
}

const ClearHighlights = function(root) {
  for (const element of root.querySelectorAll('span.highlight')) {
    element.replaceWith(element.textContent)
  }
}

const SetupFilter = function(e) {
  const filter = document.getElementById('filter');
  filter.focus();
  filter.addEventListener('input', () => {
    console.log(`filter change event: value is ${filter.innerText}`);
    for (const row of document.querySelectorAll('div.row')) {
      console.log('Processing', row);
      if (row.textContent.match(RegExp(filter.innerText, 'i'))) {
        console.log('Showing');
	row.classList.remove('invisible');
      } else {
        console.log('Hiding')
	row.classList.add('invisible');
      }
    }
    ClearHighlights(document.getElementById('select-links-div'));
    if (filter.innerText.length != 0) {
      HighlightRegex(document.getElementById('select-links-div'), new RegExp(filter.innerText, 'ig'));
    }
  });
}

const ToggleVisibleLinks = function(event) {
  for (const visibleLink of document.querySelectorAll(
    'div.row:not(.invisible) > input[name="select-links"]')) {
    visibleLink.checked = !visibleLink.checked;
  }
}

const SetupToggleButton = function() {
  const toggleElement = document.getElementById('toggle-button');
  toggleElement.addEventListener('click', ToggleVisibleLinks);
}

const SetupOpenButton = function() {
  const buttonElement = document.getElementById('open-button');
  console.log('Adding listener to', buttonElement);
  buttonElement.addEventListener('click', OpenLinks);
}

const SetupTabGroupNameInput = async function() {
  const listElement = document.getElementById('tab-group-list');
  console.log('Adding tab groups to', listElement);
  const tabGroups = await GetAllTabGroups();
  console.log('Tab groups are', tabGroups);
  for (const tabGroup of tabGroups) {
    const optionElement = document.createElement('option')
    optionElement.value = tabGroup.id;
    optionElement.innerText = tabGroup.title;
    listElement.appendChild(optionElement);
  }
  console.log('Done');
}

const ToggleDuplicateVisibility = function() {
  console.log('Toggling duplicate row visiblity');
  const inputElement = document.getElementById('deduplicate-links-checkbox');
  hide = inputElement.checked;
  for (const duplicateRow of document.querySelectorAll('div.row.duplicate)')) {
    if (hide) {
      console.log('Hiding row', duplicateRow);
      duplicateRow.class_list.add('invisible');
    } else {
      duplicateRow.class_list.remove('invisible');
    }
  }
}

const SetupDeduplicateInput = function() {
  const inputElement = document.getElementById('deduplicate-links-checkbox');
  console.log('Adding listener to', inputElement);
  inputElement.addEventListener('changed', ToggleDuplicateVisibility);
}

// Filling in form
const Main = async () => {
  ShowError('', '');
  const err = {msg: 'Internal error', sub: ''};
  try {
    await ApplySettings();
    const tabId = await GetCurrentTabId();
    err.msg = 'Permissions problem'
    err.sub = 'These can be transient; try again soon';
    const session = new OSLSession(tabId);
    await session.Start();

    err.msg = 'Error retrieving links';
    err.sub = '';
    console.log('Main: Getting links for tabId', tabId);
    const {links, labels} = await session.GetLinksAndLabels();
    console.log('Main: Links are', links, 'and labels are', labels);

    err.msg = 'Unknown error';
    err.sub = '';
    SetupFilter();
    SetupToggleButton();
    SetupOpenButton();
    SetupDeduplicateInput();
    await SetupTabGroupNameInput();
    RenderForm(links, labels, session);
  } catch(e) {
    ShowError(err.msg, err.sub);
    throw e;
  }
}

await Main()

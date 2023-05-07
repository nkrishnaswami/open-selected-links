import {GetLinksFromSelection, MakeTabsForLinks} from './utils.js';


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
  for (const input of inputs) {
    links.push(input.value);
  }
  console.log('OpenLinks: Links:', links);
  const options = {
    windowId: document.getElementById('new-window-checkbox').checked ?
      chrome.windows.WINDOW_ID_NONE : chrome.windows.WINDOW_ID_CURRENT,
    tabGroupName: document.getElementById('tab-group-name').value,
    discard: document.getElementById('discard-tab-checkbox').checked,
  };
  await MakeTabsForLinks(links, options);
  window.close();
}

const AddLinkCheckboxes = async function(links, labels) {
  // Set up the link selector inputs.
  const formElement = document.getElementById('select-links-div');
  for(var idx=0; idx < links.length; ++idx) {
    const link = links[idx];
    const label = labels[idx];
    console.log('RenderForm: Link is', link, 'and label is', label);
    const rowElement = document.createElement('div');
    rowElement.className = 'row';
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
    labelElement.appendChild(anchorElement);
    rowElement.appendChild(labelElement);
  }
}

const RenderForm = async function(links, labels) {
  if (chrome.tabGroups === undefined) {
    console.log('Tab groups not supported: hiding UI');
    document.getElementById('tab-group-ui').style.display = 'none';
  }
  if (links == undefined || links.length == 0) {
    document.getElementById('error').innerText = 'No links selected';
    document.querySelector('form[name="SelectLinks"]').style.display = 'none';
    return;
  }
  await AddLinkCheckboxes(links, labels);
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

const Main = async function() {
  const tabId = await GetCurrentTabId();
  console.log('Main: Getting links for tabId', tabId);
  const {links, labels} = await GetLinksFromSelection(tabId);
  console.log('Main: Links are', links, 'and labels are', labels);
  SetupFilter();
  SetupToggleButton();
  SetupOpenButton();
  await SetupTabGroupNameInput();
  RenderForm(links, labels);
}

Main();

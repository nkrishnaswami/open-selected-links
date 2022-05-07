import {Promisify} from './promisify.js';
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
      var [tab] = await Promisify(chrome.tabs.query)({
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
  var windowId = document.getElementById('new-window-checkbox').checked ?
      chrome.windows.WINDOW_ID_NONE : chrome.windows.WINDOW_ID_CURRENT;
  const links = [];
  const inputs = document.querySelectorAll('input[name="select-links"]:checked');
  console.log('OpenLinks: Checked', inputs);
  for (const input of inputs) {
    links.push(input.value);
  }
  console.log('OpenLinks: Links:', links);
  const tabGroupId = document.getElementById('tab-group-name').value;
  await MakeTabsForLinks(links, windowId, tabGroupId);
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

const SetupFilter = function(e) {
  const filter = document.getElementById('filter');
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

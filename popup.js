import {Promisify} from './promisify.js';
import {GetLinksFromSelection, MakeTabsForLinks} from './utils.js';


const GetCurrentTabId = async function() {
  var tabs = await Promisify(chrome.tabs.query)({
      active: true,
      currentWindow: true
  });
  console.log('GetCurrentTabId: Getting current tab:', tabs[0]);
  return tabs[0].id;
}

const OpenLinks = async function(event) {
  console.log('OpenLinks: Button pressed! Form is', event);
  const form = event.target.parent;
  console.log('OpenLinks: Form:', form);
  var windowId = document.querySelector('#new-window-checkbox').checked ?
      chrome.windows.WINDOW_ID_NONE : chrome.windows.WINDOW_ID_CURRENT;
  const links = [];
  const inputs = document.querySelectorAll('input[name="select-links"]:checked');
  console.log('OpenLinks: Checked', inputs);
  for (const input of inputs) {
    links.push(input.value);
  }
  console.log('OpenLinks: Links:', links);
  await MakeTabsForLinks(links, windowId);
  window.close();
}

const AddLinkCheckboxes = async function(links, labels) {
  // Set up the link selector inputs.
  const formElement = document.querySelector('#select-links-div');
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
  if (links == undefined || links.length == 0) {
    debugger;
    return;
  }
  await AddLinkCheckboxes(links, labels);
}

const SetupFilter = function(e) {
  const filter = document.querySelector('#filter');
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
  const toggleElement = document.querySelector('#toggle-button');
  toggleElement.addEventListener('click', ToggleVisibleLinks);
}

const SetupOpenButton = function() {
  const buttonElement = document.querySelector('#open-button');
  console.log("Adding listener to", buttonElement);
  buttonElement.addEventListener('click', OpenLinks);
}

const Main = async function() {
  const tabId = await GetCurrentTabId();
  console.log('Main: Getting links for tabId', tabId);
  const {links, labels} = await GetLinksFromSelection(tabId);
  console.log('Main: Links are', links, 'and labels are', labels);
  SetupFilter();
  SetupToggleButton();
  SetupOpenButton();
  RenderForm(links, labels);
}

Main();

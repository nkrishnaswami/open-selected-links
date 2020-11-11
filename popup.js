import {Promisify} from './promisify.js';
import {GetLinksFromSelection, OpenLinksInNewWindow} from './utils.js';


const TryToGetLinks = async function(tabId) {
  if (tabId === undefined) {
    var tab = await Promisify(chrome.tabs.query)({
      active: true,
      currentWindow: true
    });
    console.log('TryToGetLinks: Getting current tab:', tab);
    if (!tab) {
      return;
    }
    tabId = tab.id;
  }
  console.log('TryToGetLinks: Getting links for tabId', tabId);
  return await GetLinksFromSelection(tabId);
}

const SubmitForm = async function(event) {
  console.log('SubmitForm: Button pressed! Form is', event);
  const form = event.target.parent;
  console.log('SubmitForm: Form:', form);
  const links = [];
  const inputs = document.querySelectorAll('input:checked');
  console.log('SubmitForm: Checked', inputs);
  for (const input of inputs) {
    links.push(input.value);
  }
  console.log('SubmitForm: Links:', links);
  await OpenLinksInNewWindow(links);
  window.close();
}

const RenderForm = function(links, labels) {
  if (links == undefined || links.length == 0) {
    debugger;
    return;
  }
  const divElement = document.createElement('div');
  divElement.textContent = 'Choose elements to open in a new window:';
  document.body.appendChild(divElement);
  const formElement = document.createElement('form');
  formElement.name = 'SelectLinks';
  for(var idx=0; idx < links.length; ++idx) {
    const link = links[idx];
    const label = labels[idx];
    console.log('RenderForm: Link is', link, 'and label is', label);
    
    const inputElement = document.createElement('input');
    inputElement.id = `input-${idx}`;
    inputElement.type = 'checkbox';
    inputElement.name = 'select-links';
    inputElement.value = link;
    formElement.appendChild(inputElement);
    
    const labelElement = document.createElement('label');
    labelElement.for = inputElement.id;
    const anchorElement = document.createElement('a');
    anchorElement.href = link;
    anchorElement.textContent = label || link;
    labelElement.appendChild(anchorElement);
    formElement.appendChild(labelElement);
    formElement.appendChild(document.createElement('br'));
  }
  const buttonElement = document.createElement('button');
  buttonElement.type = 'button';
  buttonElement.textContent = 'Open';
  buttonElement.addEventListener('click', SubmitForm);
  formElement.appendChild(buttonElement);
  document.body.appendChild(formElement);
}

const Main = async function() {
  const {links, labels} = await TryToGetLinks();
  console.log('Main: Links are', links, 'and labels are', labels);
  RenderForm(links, labels);
}

Main();

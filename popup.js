import {Promisify} from './promisify.js';
import {GetLinksFromSelection, OpenLinksInNewWindow} from './utils.js';


const GetCurrentTabId = async function() {
  var tabs = await Promisify(chrome.tabs.query)({
      active: true,
      currentWindow: true
  });
  console.log('GetCurrentTabId: Getting current tab:', tabs[0]);
  return tabs[0].id;
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
  const buttonElement = document.createElement('button');
  buttonElement.type = 'button';
  buttonElement.textContent = 'Open';
  buttonElement.addEventListener('click', SubmitForm);
  formElement.appendChild(buttonElement);
  document.body.appendChild(formElement);
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

const Main = async function() {
  const tabId = await GetCurrentTabId();
  console.log('Main: Getting links for tabId', tabId);
  const {links, labels} = await GetLinksFromSelection(tabId);
  console.log('Main: Links are', links, 'and labels are', labels);
  SetupFilter();
  RenderForm(links, labels);
}

Main();

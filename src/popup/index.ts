import './index.css';
import { OSLSession, makeTabsForLinks } from '../common/extract-links.js'
import { loadSettings, InputType, SettingID, Settings } from '../common/settings.js'

const showError = (title: string, subtitle?: string) => {
  document.getElementById('error')!.innerText = title;
  document.getElementById('error_sub')!.innerText = subtitle ?? '';
}

const applySettings = async () => {
  const settings = await loadSettings()
  console.log('settings', settings)
  const settingToInput: [keyof Settings, string][] = [
    [SettingID.UseNewWindow, 'new-window-checkbox'],
    [SettingID.NewTabGroupName, 'tab-group-name'],
    [SettingID.AutoDiscard, 'discard-tab-checkbox'],
    [SettingID.Deduplicate, 'deduplicate-links-checkbox'],
    [SettingID.Focus, 'focus-checkbox'],
  ];
  for (const [setting, id] of settingToInput) {
    const element = document.getElementById(id) as HTMLInputElement;
    console.log('applySettings:', setting, settings[setting], element)
    if (element.type == InputType.Checkbox) {
      element.checked = settings[setting] as boolean;
    } else if (element.type == InputType.Text) {
      element.value = settings[setting] as string;
    }
  }
}

const URL_PARAMS  = new URLSearchParams(window.location.search);

const getCurrentTabId = async () => {
  if (URL_PARAMS.has("tab")) {
    return parseInt(URL_PARAMS.get("tab"));
  }
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    })
    console.log('getCurrentTabId: Getting current tab:', tab)
    return tab.id
  } catch (e: any) {
    if (e instanceof TypeError) {
      var [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      console.log('getCurrentTabId: Getting current tab:', tab)
      return tab.id
    }
    throw e;
  }
}

const getAllTabGroups = async () => {
  try {
    return await chrome.tabGroups.query({})
  } catch (e) {
    return []
  }
}

function getInput(id: string): HTMLInputElement {
  return document.getElementById(id)! as HTMLInputElement;
}

const openLinks = async (event: Event) => {
  console.log('openLinks: Button pressed! Form is', event)
  const form = (event.target! as HTMLButtonElement).parentElement
  console.log('openLinks: Form:', form)
  const inputs: NodeListOf<HTMLInputElement> = document.querySelectorAll('input[name="select-links"]:checked')
  const links: string[] = [];
  console.log('openLinks: Checked', inputs)
  for (const elt of inputs) {
    links.push(elt.parentElement!.querySelector('a')!.href!)
  }
  console.log('openLinks: Links:', links)
  const options = {
    windowId: getInput('new-window-checkbox').checked
      ? chrome.windows.WINDOW_ID_NONE
      : chrome.windows.WINDOW_ID_CURRENT,
    tabGroupName: getInput('tab-group-name').value || undefined,
    discard: getInput('discard-tab-checkbox').checked,
    deduplicate: getInput('deduplicate-links-checkbox').checked,
    focus: getInput('focus-checkbox').checked,
  }
  try {
    await makeTabsForLinks(links, options)
  } catch (e: any) {
    showError(e)
    throw e
  }
  window.close();
}

const addLinkCheckboxes = async (links: string[], labels: string[], session: OSLSession) => {
  // Set up the link selector inputs.
  const formElement: HTMLDivElement = document.getElementById('select-links-div')! as HTMLDivElement;
  const seen: Set<string> = new Set();
  for (var idx = 0; idx < links.length; ++idx) {
    const link = links[idx];
    const label = labels[idx];
    const duplicate = seen.has(link);
    seen.add(link);
    console.log('addLinkCheckboxes: Link is', link, 'and label is', label);

    const rowElement = document.createElement('div');
    rowElement.className = 'row';
    if (duplicate) {
      rowElement.classList.add('duplicate');
    }
    rowElement.addEventListener('onmouseover', async () => {
      console.log('mouseover');
      await session.highlight(idx);
    })
    rowElement.addEventListener('onmouseout', async () => {
      console.log('mouseout');
      await session.unhighlight();
    })
    formElement.appendChild(rowElement);

    const inputElement = document.createElement('input');
    inputElement.id = `input-${idx}`;
    inputElement.type = 'checkbox';
    inputElement.name = 'select-links';
    inputElement.value = link;
    rowElement.appendChild(inputElement);

    const labelElement = document.createElement('label');
    labelElement.htmlFor = inputElement.id;
    const anchorElement = document.createElement('a');
    anchorElement.href = link;
    anchorElement.title = link;
    anchorElement.textContent = label.trim() || link;
    labelElement.appendChild(anchorElement);
    rowElement.appendChild(labelElement);
  }
}

const renderForm = async function(links: string[], labels: string[], session: OSLSession) {
  if (chrome.tabGroups === undefined) {
    console.log('renderForm: Tab groups not supported: hiding UI');
    document.getElementById('tab-group-ui')!.style.display = 'none';
  }
  if (links.length == 0) {
    showError('No links selected');
    const form: HTMLFormElement = document.querySelector('form[name="SelectLinks"]')! as HTMLFormElement;
    form.style.display = 'none';
    return;
  }
  await addLinkCheckboxes(links, labels, session);
}

const highlightRegex = function(root: Element, regex: RegExp) {
  console.log('Matching', regex)
  const matches = Array.from((root.textContent ?? '').matchAll(regex)).reverse();
  console.log('Found', matches.length, 'matches');
  for (const matchItem of matches) {
    console.log(
      `Processing match "${matchItem[0]}" (${matchItem.index}:${matchItem.index + matchItem[0].length})`,
    );
    const match = matchItem[0];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    const startIndex = matchItem.index;
    const endIndex = startIndex + match.length;
    var curIndex = 0; // index into root.textContent
    var nodeIndex = 0; // index into current nodeValue
    var matchedCount = 0; // number of matched characters highlighted

    let node = walker.firstChild() as Element;
    let nodeMatchStart = 0;
    // find the start of the match
    while (node && startIndex >= curIndex + node.nodeValue!.length) {
      curIndex += node.nodeValue!.length;
      node = walker.nextNode() as Element;
    }
    if (!node) {
      console.log('No match start');
      return;
    }
    // how far into the node value does the match start?
    nodeMatchStart = startIndex - curIndex;
    console.log(
      `Found match start ${startIndex} at ${curIndex}+${nodeMatchStart}: ${node.nodeValue!.slice(nodeMatchStart)}`,
    );

    // Highlight subspans till the end of the match
    while (node && curIndex <= endIndex) {
      const text = node.nodeValue!;
      console.log(
        `Looking for match end ${endIndex} in node (${curIndex}, ${curIndex + text.length})`,
      );
      let replacements = [];
      if (nodeMatchStart > 0) {
        console.log('prefix text:', text.slice(0, nodeMatchStart));
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
      console.log('Content text:', nodeMatchStart, nodeMatchEnd, span.innerText);;
      replacements.push(span);
      if (nodeMatchEnd < text.length) {
        console.log('suffix text:', text.slice(nodeMatchEnd));
        replacements.push(text.slice(nodeMatchEnd));
      }
      console.log('Replacing', node, 'with', replacements);
      const nextNode = walker.nextNode();
      node.replaceWith(...replacements);
      curIndex += text.length;
      nodeMatchStart = 0;
      node = nextNode! as Element;
      console.log('Next node is', node.nodeValue);
    }
  }
}

const clearHighlights = function(root: Element) {
  for (const element of root.querySelectorAll('span.highlight')) {
    element.replaceWith(element.textContent ?? '');
  }
}

const setupFilter = function() {
  const filter = document.getElementById('filter')!;
  filter.focus();
  filter.addEventListener('input', () => {
    console.log(`filter change event: value is ${filter.innerText}`);
    for (const row of document.querySelectorAll('div.row')) {
      console.log('Processing', row);
      if ((row.textContent ?? '').match(RegExp(filter.innerText, 'i'))) {
        console.log('Showing');
        row.classList.remove('invisible');
      } else {
        console.log('Hiding');
        row.classList.add('invisible');
      }
    }
    clearHighlights(document.getElementById('select-links-div')!);
    if (filter.innerText.length != 0) {
      highlightRegex(
        document.getElementById('select-links-div')!,
        new RegExp(filter.innerText, 'ig'),
      );
    }
  })
}

const toggleVisibleLinks = function(event: Event) {
  for (const visibleLink of document.querySelectorAll(
    'div.row:not(.invisible) > input[name="select-links"]',
  ) as NodeListOf<HTMLInputElement>) {
    visibleLink.checked = !visibleLink.checked;
  }
}

const setupToggleButton = function() {
  const toggleElement = document.getElementById('toggle-button')!;
  toggleElement.addEventListener('click', toggleVisibleLinks);
}

const setupOpenButton = function() {
  const buttonElement = document.getElementById('open-button')!;
  console.log('Adding listener to', buttonElement);
  buttonElement.addEventListener('click', openLinks);
}

const setupTabGroupNameInput = async function() {
  const listElement = document.getElementById('tab-group-list')!;
  console.log('Adding tab groups to', listElement);
  const tabGroups = await getAllTabGroups();
  console.log('Tab groups are', tabGroups);
  for (const tabGroup of tabGroups) {
    const optionElement = document.createElement('option');
    optionElement.value = tabGroup.id.toString();
    optionElement.innerText = tabGroup.title ?? '';
    listElement.appendChild(optionElement);
  }
  console.log('Done');
}

const toggleDuplicateVisibility = function() {
  console.log('Toggling duplicate row visiblity');
  const inputElement = document.getElementById('deduplicate-links-checkbox')! as HTMLInputElement;
  const hide = inputElement.checked;
  for (const duplicateRow of document.querySelectorAll('div.row.duplicate)')) {
    if (hide) {
      console.log('Hiding row', duplicateRow);
      duplicateRow.classList.add('invisible');
    } else {
      duplicateRow.classList.remove('invisible');
    }
  }
}

const setupDeduplicateInput = function() {
  const inputElement = document.getElementById('deduplicate-links-checkbox')! as HTMLInputElement;
  console.log('Adding listener to', inputElement);
  inputElement.addEventListener('changed', toggleDuplicateVisibility)
}

// Filling in form
const main = async () => {
  showError('', '');
  const err = { msg: 'Internal error', sub: '' };
  try {
    await applySettings();

    err.msg = 'Unable to get tab ID'
    err.sub = ''
    const tabId = await getCurrentTabId();
    if (tabId == undefined) {
      throw Error('Failed to get current tab')
    }

    err.msg = 'Permissions problem';
    err.sub = 'These can be transient; try again soon';
    const session = new OSLSession(tabId);
    await session.setup();

    err.msg = 'Error retrieving links';
    err.sub = '';
    console.log('main: Getting links for tabId', tabId);
    const { links, labels } = await session.getLinksAndLabels();
    console.log('main: Links are', links, 'and labels are', labels);

    err.msg = 'Unknown error';
    err.sub = '';
    setupFilter();
    setupToggleButton();
    setupOpenButton();
    setupDeduplicateInput();
    await setupTabGroupNameInput();
    renderForm(links, labels, session);
  } catch (e) {
    showError(err.msg, err.sub);
    throw e
  }
}

await main();

import './index.css';
import { OSLSession, makeTabsForLinks } from '../common/extract-links.js'
import type { MakeTabOptions } from '../common/extract-links.js'
import { loadSettings, InputType, SettingID, Settings } from '../common/settings.js'

const DisplayInfo = new Map<string, chrome.system.display.DisplayInfo>(
  (await chrome.system.display.getInfo())
    .map(info => [info.id, info]));

const showError = (title: string, subtitle?: string) => {
  document.getElementById('error')!.innerText = title;
  document.getElementById('error_sub')!.innerText = subtitle ?? '';
}

function getInput(id: string): HTMLInputElement {
  return document.getElementById(id)! as HTMLInputElement;
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
    [SettingID.PopupHideDuplicates, 'hide-duplicates-checkbox'],
    [SettingID.PopupMatchUrls, 'filter-urls-checkbox'],
  ];
  for (const [setting, id] of settingToInput) {
    const element = getInput(id)
    console.log('applySettings:', setting, settings[setting], element)
    if (element.type == InputType.Checkbox) {
      element.checked = settings[setting] as boolean;
    } else if (element.type == InputType.Text) {
      element.value = settings[setting] as string;
    }
  }
}

const URL_PARAMS = new URLSearchParams(window.location.search);

const getCurrentTabId = async () => {
  const tabId = URL_PARAMS.get("tab");
  if (tabId != null) {
    console.log('getCurrentTabId: using query tabId:', tabId)
    return parseInt(tabId);
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
  const options: {[key: string]: any} = {
    discard: getInput('discard-tab-checkbox').checked,
    deduplicate: getInput('deduplicate-links-checkbox').checked,
  }
  const displayOption = (document.getElementById('display') as HTMLInputElement | undefined)?.value;
  if (displayOption) {
    options.display = DisplayInfo.get(displayOption);
    console.log('Requested display info', displayOption, options.display)
  }
  window.close();
  if (getInput('sxs-checkbox').checked && links.length >= 2) {
    // Multi-display support
    // Open the first link in a new lefthand window
    options.windowId = chrome.windows.WINDOW_ID_NONE;
    options.focus = true;
    options.position = 'left';
    try {
      await makeTabsForLinks([links[0]], options)
    } catch (e: any) {
      showError(e)
      throw e
    }
    // Open the rest of the links in a a new righthand window
    // options.focus = false;
    options.windowId = chrome.windows.WINDOW_ID_NONE;
    options.position = 'right';
    try {
      await makeTabsForLinks(links.slice(1), options)
    } catch (e: any) {
      showError(e)
      throw e
    }
  } else {
    options.windowId = getInput('new-window-checkbox').checked
      ? chrome.windows.WINDOW_ID_NONE
      : chrome.windows.WINDOW_ID_CURRENT;
    options.tabGroupName = getInput('tab-group-name').value || undefined;
    options.focus = getInput('focus-checkbox').checked;
    try {
      console.log('Making tabs with options:', options)
      await makeTabsForLinks(links, options)
    } catch (e: any) {
      showError(e)
      throw e
    }
  }
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
    const trimmedLabel = label.trim();
    anchorElement.textContent = trimmedLabel ? trimmedLabel : link
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

const filterRows = function() {
  const filterInput = getInput('filter');
  const filterUrlsCheckbox = getInput('filter-urls-checkbox')!;
  const hideDuplicatesCheckbox = getInput('hide-duplicates-checkbox')!;

  try {
    const needle = new RegExp(filterInput.innerText, 'ig');
    const filterUrls = filterUrlsCheckbox.checked;
    const hideDuplicates = hideDuplicatesCheckbox.checked;
    console.log(`re-filtering: filter is ${filterInput.innerText}, dedup=${hideDuplicates}`);

    const shouldShow = (row: Element) => {
      const isDuplicate = row.classList.contains('duplicate')
      const haystack = filterUrls
	? `${row.querySelector('a')?.href ?? ""} ${row.textContent ?? ""}`
	: row.textContent ?? '';
      const isMatch = haystack.match(needle);
      if (hideDuplicates) {
	return isMatch && !isDuplicate;
      }
      return isMatch;
    }

    for (const row of document.querySelectorAll('div.row')) {
      if (shouldShow(row)) {
	console.log('Showing');
	row.classList.remove('invisible');
      } else {
	console.log('Hiding');
	row.classList.add('invisible');
      }
    }
    clearHighlights(document.getElementById('select-links-div')!);
    if (filterInput.innerText.length != 0) {
      highlightRegex(document.getElementById('select-links-div')!, needle)
    }
  } catch (e: any) {
    console.log(e);
    throw e;
  }
};

const setupFilter = function() {
  const filterInput = document.getElementById('filter')!;
  const filterUrlsCheckbox = document.getElementById('filter-urls-checkbox')!;
  const hideDuplicatesCheckbox = document.getElementById('hide-duplicates-checkbox')!;

  filterInput.focus();
  filterInput.addEventListener('input', filterRows);
  filterUrlsCheckbox.addEventListener('change', filterRows);
  hideDuplicatesCheckbox.addEventListener('change', filterRows)
  filterInput.addEventListener('keypress', (event) => {
    if (event.which === 13) {
      event.preventDefault();
    }
  });
  document.body.addEventListener('keypress', (event) => {
    filterInput.focus();
    filterInput.dispatchEvent(event);
  });
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

const setupSxS = () => {
  const sxsCheckbox = getInput('sxs-checkbox');
  sxsCheckbox.addEventListener('change', (event: Event) => {
    for (const id of ['new-window-checkbox', 'tab-group-name', 'focus-checkbox']) {
      const input = getInput(id);
      input.disabled = sxsCheckbox.checked;
    }
  });
}

const setupDisplay = () => {
  if (DisplayInfo.size > 1) {
    const sxsDisplay = getInput('display');
    sxsDisplay.parentElement!.classList.remove('invisible');
    sxsDisplay.disabled = false
    for (const [id, display] of DisplayInfo) {
      const option = document.createElement('option') as HTMLOptionElement;
      option.value = display.id;
      option.textContent = display.name;
      sxsDisplay.appendChild(option)
    }
  }
}

const setupHamburger = () => {
  const hamburger = document.getElementById('hamburger')!;
  const hamburgerCaption = document.getElementById('hamburger-caption')!
  const config = document.getElementById('config-container')!;
  hamburger.addEventListener('click', (event: Event) => {
    if (hamburger.classList.contains('hamburger-closed')) {
      hamburgerCaption.textContent = 'Tap hamburger to hide options'
      hamburger.classList.remove('hamburger-closed')
      config.classList.remove('config-closed');
    } else {
      hamburgerCaption.textContent = 'Tap hamburger to show options'
      hamburger.classList.add('hamburger-closed')
      config.classList.add('config-closed');
    }
  })
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
    setupSxS();
    setupDisplay();
    setupHamburger();
    await setupTabGroupNameInput();
    renderForm(links, labels, session);
  } catch (e) {
    showError(err.msg, err.sub);
    throw e
  }
}

await main();

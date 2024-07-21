import './index.css';

class SelectionLinkExtractor {
  labels: string[] = [];
  links: string[] = [];
  anchors: HTMLAnchorElement[] = [];
  valid: boolean = false;

  constructor() {
    console.log('Initializing OSL extractor');
  }

  invalidate() {
    console.log('Invalidating selection');
    this.valid = false;
    this.links = [];
    this.labels = [];
    this.anchors = [];
  }

  processFragment(documentFragment: DocumentFragment) {
    console.log('processing fragment:', documentFragment);
    for (const anchor of documentFragment.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>) {
      var url = new URL(anchor.href, window.location.href);
      if (url.protocol.startsWith('http')) {
	this.links.push(url.href);
	this.labels.push(anchor.innerText.trim());
	this.anchors.push(anchor);
      }
    }
    console.log('Done processing fragment')
  }

  processAnchorAncestor(selection: Selection) {
    const node = selection.anchorNode || selection.focusNode;
    console.log('processing anchor ancestor')
    if (node) {
      console.log('processing node', node)
      // See if we are in an anchor.
      const result = document.evaluate(
	'ancestor::a', node, null,
	XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      if (result.singleNodeValue != null) {
	const anchor = result.singleNodeValue as HTMLAnchorElement;
	var url = new URL(anchor.href, window.location.href);
	console.debug(`Considering ${url.href}`);
	if (url.protocol.startsWith('http')) {
	  console.debug(`Adding ${url.href}`);
	  this.links.push(url.href);
	  this.labels.push(selection.toString().trim());
	  this.anchors.push(anchor);
	}
      }
      console.log('Done processing fragment')
    }
  }

  processSelection() {
    console.log('Processing selection')
    const selection = window.getSelection();
    if (!selection) {
      console.log('No selection')
      return;
    }
    for (var rangeIdx = 0; rangeIdx < selection.rangeCount; ++rangeIdx) {
      console.log('processing range', rangeIdx + 1)
      this.processFragment(selection.getRangeAt(rangeIdx).cloneContents());
    }
    // Special case if the selection is completely contained inside an anchor.
    if (this.links.length == 0 && selection.rangeCount > 0) {
      console.log('No links yet; checking for anchor ancestor')
      this.processAnchorAncestor(selection);
    }
    this.valid = true;
  }
}

const extractor = new SelectionLinkExtractor();

interface Message {
  id: string,
  index?: number
}

function handleMessage(msg: Message, sender: chrome.runtime.MessageSender, sendResponse: Function) {
  console.log('Got message:', msg);
  if (sender.id != chrome.runtime.id) {
    console.log('Unexpected message', msg, 'from sender', sender);
    return;
  }
  if (msg.id == 'get_links') {
    if (extractor.valid) {
      console.log('Reusing prior results');
    } else {
      console.log('Invoking extractor');
      extractor.processSelection();
    }
    sendResponse({links: extractor.links, labels: extractor.labels});
  } else if (msg.id == 'set_highlight' &&
    extractor.valid &&
    msg.index != undefined &&
    msg.index >= 0 &&
    msg.index < extractor.anchors.length) {
    for (const anchor of extractor.anchors) {
      anchor.classList.remove('open_selected_links_highlight');
    }
    extractor.anchors[msg.index].classList.add('open_selected_links_highlight');
    sendResponse();
  } else if (msg.id == 'clear_highlights' &&
    extractor.valid) {
    for (const anchor of extractor.anchors) {
      anchor.classList.remove('osl_highlight');
    }
    sendResponse();
  }
}

document.addEventListener('selectionchange', () => extractor.invalidate())
chrome.runtime.onMessage.addListener(handleMessage);

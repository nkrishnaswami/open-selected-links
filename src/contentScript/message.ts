import { SelectionLinkExtractor } from './extractor';

const extractor = new SelectionLinkExtractor();

interface Message {
  id: string,
  index?: number
}

export function invalidateExtractor() {
  extractor.invalidate()
}

export function handleMessage(msg: Message, sender: chrome.runtime.MessageSender, sendResponse: Function) {
  console.log('Got message:', msg);
  if (sender.id != chrome.runtime.id) {
    console.log('Unexpected message', msg, 'from sender', sender);
    return;
  }
  if (msg.id == 'ping') {
    sendResponse('ack');
  }
  else if (msg.id == 'get_links') {
    if (extractor.valid) {
      console.log('Reusing prior results');
    } else {
      console.log('Invoking extractor');
      extractor.processSelection();
    }
    sendResponse({links: extractor.links, labels: extractor.labels});
  } else if (msg.id == 'set_highlight'
	     && extractor.valid
	     && msg.index != undefined
	     && msg.index >= 0
	     && msg.index < extractor.anchors.length)
  {
    for (const anchor of document.querySelectorAll('a.open_selected_links_highlight')) {
      anchor.classList.remove('open_selected_links_highlight');
    }
    extractor.anchors[msg.index].classList.add('open_selected_links_highlight');
    sendResponse();
  } else if (msg.id == 'clear_highlights' && extractor.valid) {
    for (const anchor of document.querySelectorAll('a.open_selected_links_highlight')) {
      anchor.classList.remove('osl_highlight');
    }
    sendResponse();
  }
}


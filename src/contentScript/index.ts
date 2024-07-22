import './index.css';
import { SelectionLinkExtractor } from './extractor';

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

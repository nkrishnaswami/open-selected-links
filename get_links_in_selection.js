var o = {
  success: false
};
if (!document.open_selected_links_running) {
  document.open_selected_links_running = true;

  // Add some style
  const style = document.createElement('style');
  style.innerText = `.open_selected_links_highlight {
  background-color: yellow;
}`
  document.head.appendChild(style);

  function SelectionLinkExtractor() {
    console.log('Starting OSL extractor');
    this.labels = [];
    this.links = [];
    this.anchors = [];

    this.valid = false;

    this.ProcessFragment = function(documentFragment) {
      console.log('Processing fragment')
      for (const anchor of documentFragment.querySelectorAll('a[href]')) {
	console.log('Processing anchor')
	var url = new URL(anchor.href, window.location.href);
	console.debug(`Considering ${url.href}`);
	if (url.protocol.startsWith('http')) {
	  console.debug(`Adding ${url.href}`);
	  this.links.push(url.href);
	  this.labels.push(anchor.innerText.trim());
	  this.anchors.push(anchor);
	}
      }
      console.log('Done processing fragment')
    }

    this.ProcessAnchorAncestor = function(node) {
      console.log('Processing anchor ancestor, if present')
      if (node) {
	// See if we are in an anchor.
	const result = document.evaluate(
	  'ancestor::a', node, null,
	  XPathResult.FIRST_ORDERED_NODE_TYPE, null);
	if (result.singleNodeValue != null) {
	  const anchor = result.singleNodeValue;
	  var url = new URL(anchor.href, window.location.href);
	  console.debug(`Considering ${url.href}`);
	  if (url.protocol.startsWith('http')) {
	    console.debug(`Adding ${url.href}`);
	    this.links.push(url.href);
	    this.labels.push(selection.toString().trim());
	    this.anchors.push(node);
	  }
	}
      }
      console.log('Done processing anchor ancestor')
    }

    this.ProcessSelection = function() {
      console.log('Processing selection', window.getSelection())
      const selection = window.getSelection();

      console.debug('Got selection:', selection);
      for (var rangeIdx = 0; rangeIdx < selection.rangeCount; ++rangeIdx) {
	this.ProcessFragment(selection.getRangeAt(rangeIdx).cloneContents());
      }
      // Special case if the selection is completely contained inside an anchor.
      if (this.links.length == 0 && selection.rangeCount > 0) {
	this.ProcessAnchorAncestor(selection.anchorNode || selection.focusNode);
      }
      this.valid = true;
      console.log('Done processing selection')
    }
  }

  extractor = new SelectionLinkExtractor();

  function MessageHandler(msg, sender, sendResponse) {
    console.log('Got message:', msg);
    if (sender.id != chrome.runtime.id) {
      return
    }
    if (msg.id == 'get_links') {
      if (extractor.valid) {
	console.log('Reusing results');
      } else {
	console.log('Refreshing extractor');
	extractor.ProcessSelection();
      }
      console.log('Extracted', extractor.links.length, 'links,', extractor.labels.length, 'labels')
      sendResponse({links: extractor.links, labels: extractor.labels});
    } else if (msg.id == 'set_highlight' &&
	       extractor.valid &&
	       msg.index >= 0 &&
	       msg.index < extractor.anchors.length) {
      for (const anchor of extractor.anchors) {
	console.log('Unhighlighting anchor', anchor);
	anchor.classList.remove('open_selected_links_highlight');
      }
      console.log('Highlighting anchor', extractor.anchors[msg.index]);
      extractor.anchors[msg.index].classList.add('open_selected_links_highlight');
      sendResponse();
    } else if (msg.id == 'clear_highlights' &&
	       extractor.valid) {
      for (const anchor of extractor.anchors) {
	console.log('Unhighlighting anchor', anchor);
	anchor.classList.remove('osl_highlight');
      }
      sendResponse();
    } else if (msg.id == 'shut_down') {
      chrome.runtime.onMessage.removeListener(MessageHandler);
      document.removeListener('selectionchange', InvalidateExtractor)
      sendResponse();
    }
  }

  function InvalidateExtractor() {
    console.log('Invalidating selection');
    extractor.valid = false;
  }

  document.addEventListener('selectionchange', InvalidateExtractor)
  chrome.runtime.onMessage.addListener(MessageHandler);

  o.installed = true
  o.success = true
} else {
  o.success = true
}
o

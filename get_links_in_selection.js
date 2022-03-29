function FindLinksInSelection() {
  const selection = window.getSelection();
  console.debug('Got selection:', selection);
  links = [];
  labels = [];
  for (var rangeIdx = 0; rangeIdx < selection.rangeCount; ++rangeIdx) {
    const range = selection.getRangeAt(rangeIdx);
    const contents = range.cloneContents();
    for (const anchor of contents.querySelectorAll('a[href]')) { 
      var url = new URL(anchor.href, window.location.href);
      console.debug(`Considering ${url.href}`);
      if (url.protocol.startsWith('http')) {
	console.debug(`Adding ${url.href}`);
	links.push(url.href);
	labels.push(anchor.innerText);
      }
    }
  }
  // Fallback check if we have selected an anchor's child.
  if (links.length == 0 && selection.rangeCount > 0) {
    const node = selection.anchorNode || selection.focusNode;
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
	  links.push(url.href);
	  labels.push(selection.toString());
	}
      }
    }
  }
  return {links: links, labels: labels};
}

FindLinksInSelection();

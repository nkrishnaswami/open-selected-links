function FindLinksInSelection() {
  const selection = window.getSelection();
  links = [];
  for (var rangeIdx = 0; rangeIdx < selection.rangeCount; ++rangeIdx) {
    const range = selection.getRangeAt(rangeIdx);
    const contents = range.cloneContents();
    for (const anchor of contents.querySelectorAll('a[href]')) {
      var url = new URL(anchor.href, window.location.href);
      console.log(`Considering ${url.href}`);
      if (url.protocol.startsWith('http')) {
	console.log(`Adding ${url.href}`);
	links.push(url.href);
      }
    }
  }
  return links;
}

FindLinksInSelection();

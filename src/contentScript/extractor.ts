export class SelectionLinkExtractor {
  labels: string[] = [];
  links: string[] = [];
  anchors: HTMLAnchorElement[] = [];
  valid: boolean = false;
  debug: boolean = false;

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
    for (const anchor of documentFragment.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>) {
      try {
	var url = new URL(anchor.href, window.location.href);
	if (url.protocol.startsWith('http')) {
	  this.links.push(url.href);
	  if (this.debug) { console.log('anchor:', anchor) };
	  this.labels.push(anchor.textContent?.trim() ?? '[empty]');
	  this.anchors.push(anchor);
	}
      } catch(e) {
	console.log('Invalid URL', anchor.href);
      }
    }
    if (this.debug) { console.log('Done processing fragment') }
  }

  processAnchorAncestor(selection: Selection) {
    const node = selection.anchorNode || selection.focusNode;
    if (this.debug) { console.log('processing anchor ancestor') }
    if (node) {
      if (this.debug) { console.log('processing node', node) }
      const element = node instanceof Element ? node as Element : node.parentElement!;
      // See if we are in an anchor.
      const result = element.closest('a')
      if (result != null) {
	const anchor = result as HTMLAnchorElement;
	var url = new URL(anchor.href, window.location.href);
	console.debug(`Considering ${url.href}`);
	if (url.protocol.startsWith('http')) {
	  console.debug(`Adding ${url.href}`);
	  this.links.push(url.href);
	  this.labels.push(selection.toString().trim());
	  this.anchors.push(anchor);
	}
      }
      if (this.debug) { console.log('Done processing fragment') }
    }
  }

  processSelection() {
    if (this.debug) { console.log('Processing selection') }
    const selection = window.getSelection();
    if (!selection) {
      if (this.debug) { console.log('No selection') }
      return;
    }
    for (var rangeIdx = 0; rangeIdx < selection.rangeCount; ++rangeIdx) {
      if (this.debug) { console.log('processing range', rangeIdx + 1) }
      this.processFragment(selection.getRangeAt(rangeIdx).cloneContents());
    }
    // Special case if the selection is completely contained inside an anchor.
    if (this.links.length == 0 && selection.rangeCount > 0) {
      if (this.debug) { console.log('No links yet; checking for anchor ancestor') }
      this.processAnchorAncestor(selection);
    }
    this.valid = true;
  }
}

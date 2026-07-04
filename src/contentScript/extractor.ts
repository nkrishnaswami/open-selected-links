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
    const base = document.head.querySelector('base');
    const baseURL = base ? base.href : window.location.href;
    for (const anchor of this.collectAnchors(documentFragment)) {
      try {
	const url = new URL(anchor.href, baseURL);
	if (url.protocol.startsWith('http')) {
	  this.links.push(url.href);
	  if (this.debug) { console.log('anchor:', anchor) };
	  this.labels.push(anchor.textContent?.trim() || '[empty]');
	  this.anchors.push(anchor);
	}
      } catch {
	console.log('Invalid URL', anchor.href);
      }
    }
    if (this.debug) { console.log('Done processing fragment') }
  }

  // Cloning a selection (Range.cloneContents) never carries open shadow
  // roots along with their hosts, so this recursion only bears fruit when
  // called on a *live* shadow root (see processShadowHosts below).
  private collectAnchors(root: DocumentFragment | ShadowRoot): HTMLAnchorElement[] {
    const anchors = Array.from(root.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) {
	anchors.push(...this.collectAnchors(element.shadowRoot));
      }
    }
    return anchors;
  }

  // Shadow trees aren't part of the light DOM that Range.cloneContents()
  // clones, so find shadow hosts intersecting the live selection directly
  // and process their (live) shadow roots for links.
  processShadowHosts(range: Range) {
    const ancestor = range.commonAncestorContainer;
    const container = ancestor instanceof Element ? ancestor : ancestor.parentElement;
    if (!container) return;
    for (const element of container.querySelectorAll('*')) {
      if (element.shadowRoot && range.intersectsNode(element)) {
	this.processFragment(element.shadowRoot);
      }
    }
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
	try {
	  const url = new URL(anchor.href, window.location.href);
	  console.debug(`Considering ${url.href}`);
	  if (url.protocol.startsWith('http')) {
	    console.debug(`Adding ${url.href}`);
	    this.links.push(url.href);
	    this.labels.push(selection.toString().trim());
	    this.anchors.push(anchor);
	  }
	} catch {
	  console.log('Invalid URL', anchor.href);
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
    for (let rangeIdx = 0; rangeIdx < selection.rangeCount; ++rangeIdx) {
      if (this.debug) { console.log('processing range', rangeIdx + 1) }
      const range = selection.getRangeAt(rangeIdx);
      this.processFragment(range.cloneContents());
      this.processShadowHosts(range);
    }
    // Special case if the selection is completely contained inside an anchor.
    if (this.links.length == 0 && selection.rangeCount > 0) {
      if (this.debug) { console.log('No links yet; checking for anchor ancestor') }
      this.processAnchorAncestor(selection);
    }
    this.valid = true;
  }
}

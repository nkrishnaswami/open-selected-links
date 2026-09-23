// <area href> (image maps) shares HTMLAnchorElement's .href behavior via
// HTMLHyperlinkElementUtils; formaction-bearing submit buttons/inputs use
// .formAction instead — see LinkElement.linkURL below.
type LinkElement = HTMLAnchorElement | HTMLAreaElement | HTMLButtonElement | HTMLInputElement;

const LINK_ELEMENT_SELECTOR =
  'a[href], area[href], button[formaction], input[type="submit"][formaction], input[type="image"][formaction]';

export class SelectionLinkExtractor {
  labels: string[] = [];
  links: string[] = [];
  anchors: LinkElement[] = [];
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

  private static linkURL(el: LinkElement): string {
    return (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) ? el.formAction : el.href;
  }

  processFragment(documentFragment: DocumentFragment) {
    const base = document.head.querySelector('base');
    const baseURL = base ? base.href : window.location.href;
    for (const anchor of this.collectLinkElements(documentFragment)) {
      try {
	const url = new URL(SelectionLinkExtractor.linkURL(anchor), baseURL);
	if (url.protocol.startsWith('http')) {
	  this.links.push(url.href);
	  if (this.debug) { console.log('anchor:', anchor) };
	  this.labels.push(anchor.textContent?.trim() || anchor.getAttribute('alt')?.trim() || '[empty]');
	  this.anchors.push(anchor);
	}
      } catch {
	console.log('Invalid URL', SelectionLinkExtractor.linkURL(anchor));
      }
    }
    if (this.debug) { console.log('Done processing fragment') }
  }

  // Cloning a selection (Range.cloneContents) never carries open shadow
  // roots along with their hosts, so this recursion only bears fruit when
  // called on a *live* shadow root (see processShadowHosts below).
  private collectLinkElements(root: DocumentFragment | ShadowRoot): LinkElement[] {
    const elements = Array.from(root.querySelectorAll(LINK_ELEMENT_SELECTOR)) as LinkElement[];
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) {
	elements.push(...this.collectLinkElements(element.shadowRoot));
      }
    }
    return elements;
  }

  // Shadow trees aren't part of the light DOM that Range.cloneContents()
  // clones, so find shadow hosts intersecting the live selection directly
  // and process their (live) shadow roots for links.
  processShadowHosts(range: Range) {
    const ancestor = range.commonAncestorContainer;
    // A range built directly inside a shadow root (see processComposedShadowSelection)
    // can have that ShadowRoot itself as commonAncestorContainer. Check nodeType rather
    // than instanceof Element/DocumentFragment: instanceof can misfire across realms
    // (e.g. cross-iframe nodes), which happy-dom's test environment hits for ShadowRoot.
    const container: ParentNode | null =
      ancestor.nodeType === Node.ELEMENT_NODE || ancestor.nodeType === Node.DOCUMENT_FRAGMENT_NODE
	? (ancestor as unknown as ParentNode)
	: ancestor.parentElement;
    if (!container) return;
    for (const element of container.querySelectorAll('*')) {
      if (element.shadowRoot && range.intersectsNode(element)) {
	this.processFragment(element.shadowRoot);
      }
    }
  }

  // When a selection lies entirely inside an open shadow root, Selection.getRangeAt()
  // retargets both boundary points to the same spot next to the shadow host, collapsing
  // the range to zero width (see https://github.com/nkrishnaswami/open-selected-links/issues/32).
  // Selection.getComposedRanges() (unsupported in Firefox as of this writing) can resolve
  // the true boundary points inside shadow trees we tell it about, letting us rebuild a
  // real, non-collapsed Range scoped to whichever root actually contains the selection.
  processComposedShadowSelection(selection: Selection) {
    if (typeof selection.getComposedRanges !== 'function') return;
    const shadowRoots = this.findAllShadowRoots(document.body);
    if (shadowRoots.length === 0) return;
    for (const composed of selection.getComposedRanges({ shadowRoots })) {
      const sharedRoot = SelectionLinkExtractor.findSharedRoot(composed.startContainer, composed.endContainer);
      // No shared shadow root: either plain light DOM (already handled above)
      // or the selection crosses sibling shadow trees with no common one.
      if (!sharedRoot || sharedRoot === document) continue;
      const start = SelectionLinkExtractor.retargetPoint(composed.startContainer, composed.startOffset, sharedRoot, false);
      const end = SelectionLinkExtractor.retargetPoint(composed.endContainer, composed.endOffset, sharedRoot, true);
      const range = document.createRange();
      range.setStart(start.container, start.offset);
      range.setEnd(end.container, end.offset);
      this.processFragment(range.cloneContents());
      this.processShadowHosts(range);
    }
  }

  private findAllShadowRoots(root: ParentNode, acc: ShadowRoot[] = []): ShadowRoot[] {
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) {
	acc.push(element.shadowRoot);
	this.findAllShadowRoots(element.shadowRoot, acc);
      }
    }
    return acc;
  }

  // Roots from `node`'s own root up through each enclosing shadow host's root, ending in
  // the top-level document. Used to find the innermost root shared by two boundary points.
  private static rootChain(node: Node): Node[] {
    const chain: Node[] = [];
    let root: Node = node.getRootNode();
    chain.push(root);
    while (root instanceof ShadowRoot) {
      root = root.host.getRootNode();
      chain.push(root);
    }
    return chain;
  }

  private static findSharedRoot(a: Node, b: Node): Node | null {
    const bChain = new Set(SelectionLinkExtractor.rootChain(b));
    for (const root of SelectionLinkExtractor.rootChain(a)) {
      if (bChain.has(root)) return root;
    }
    return null;
  }

  // Re-expresses (node, offset) relative to targetRoot: if node is already in targetRoot,
  // it's returned unchanged; otherwise walks up through shadow hosts until reaching the
  // one whose root is targetRoot, returning a boundary point just before (start) or after
  // (end) that host, matching how the platform itself retargets cross-root boundary points.
  private static retargetPoint(node: Node, offset: number, targetRoot: Node, isEnd: boolean): { container: Node, offset: number } {
    let container = node;
    let currentOffset = offset;
    while (container.getRootNode() !== targetRoot) {
      const root = container.getRootNode();
      if (!(root instanceof ShadowRoot)) break;
      const host = root.host;
      const parent = host.parentNode;
      if (!parent) return { container: host, offset: 0 };
      container = parent;
      currentOffset = Array.prototype.indexOf.call(parent.childNodes, host) + (isEnd ? 1 : 0);
    }
    return { container, offset: currentOffset };
  }

  processAnchorAncestor(selection: Selection) {
    const node = selection.anchorNode || selection.focusNode;
    if (this.debug) { console.log('processing anchor ancestor') }
    if (node) {
      if (this.debug) { console.log('processing node', node) }
      const element = node instanceof Element ? node as Element : node.parentElement!;
      // See if we are in a link-bearing element.
      const result = element.closest(LINK_ELEMENT_SELECTOR)
      if (result != null) {
	const anchor = result as LinkElement;
	try {
	  const url = new URL(SelectionLinkExtractor.linkURL(anchor), window.location.href);
	  console.debug(`Considering ${url.href}`);
	  if (url.protocol.startsWith('http')) {
	    console.debug(`Adding ${url.href}`);
	    this.links.push(url.href);
	    this.labels.push(selection.toString().trim());
	    this.anchors.push(anchor);
	  }
	} catch {
	  console.log('Invalid URL', SelectionLinkExtractor.linkURL(anchor));
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
    this.processComposedShadowSelection(selection);
    // Special case if the selection is completely contained inside an anchor.
    if (this.links.length == 0 && selection.rangeCount > 0) {
      if (this.debug) { console.log('No links yet; checking for anchor ancestor') }
      this.processAnchorAncestor(selection);
    }
    this.valid = true;
  }
}

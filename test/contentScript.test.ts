import { expect, test, vi } from 'vitest';
import { SelectionLinkExtractor } from '../src/contentScript/extractor';


const doc1 = `<ol id="ol1">
  <li>inside <a href="http://localhost/a">A1</a> other text</li>
  <li>en<a href="http://localhost/a">A2</a>jambed</li>
  <li><a href="http://localhost/a">A3</a></li> prefixing
  <li>en<a href="a">A4</a>jambed</li>
  <li><a href="a">A5</a></li> prefixing
  <li>suffixing<a href="http://localhost/a">A6</a></li>
  <li><a href="http://localhost/b">B1</a></li> different
  <li><a href="http://localhost/c">C</a></li>
  <li><a href="http://localhost/b">B2</a></li> separated
</ol>
<ol id="ol2">
  <li><a href="http://localhost/d">D1</a></li>
</ol>`


test('select whole document', () => {
  // vitest --dom sets the location to its server URL; we want to test
  // these bare URLs with the relative URLs omitted.
  window.location.href = 'file:///testdoc.html';
  document.body.innerHTML = doc1;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual([
    'http://localhost/a',
    'http://localhost/a',
    'http://localhost/a',
    'http://localhost/a',
    'http://localhost/b',
    'http://localhost/c',
    'http://localhost/b',
    'http://localhost/d',
  ]);
  expect(extractor.labels).toEqual([
    'A1',
    'A2',
    'A3',
    'A6',
    'B1',
    'C',
    'B2',
    'D1',
  ]);
});

test('select whole document with BASE', () => {
  window.location.href = 'https://fancy.server/deep/link/doc.html';
  document.body.innerHTML = doc1;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual([
    'http://localhost/a',
    'http://localhost/a',
    'http://localhost/a',
    'https://fancy.server/deep/link/a',
    'https://fancy.server/deep/link/a',
    'http://localhost/a',
    'http://localhost/b',
    'http://localhost/c',
    'http://localhost/b',
    'http://localhost/d',
  ]);
  expect(extractor.labels).toEqual([
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'B1',
    'C',
    'B2',
    'D1',
  ]);
});

test('Empty selection', () => {
  document.body.innerHTML = doc1;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.empty();
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(0);
  expect(extractor.labels).toHaveLength(0);
  expect(extractor.anchors).toHaveLength(0);
});

test('Single selection', () => {
  document.body.innerHTML = doc1;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.querySelector('li'));
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/a']);
  expect(extractor.labels).toEqual(['A1']);
});

test('Extend selection', () => {
  document.body.innerHTML = doc1;

  const extractor = new SelectionLinkExtractor();
  document.addEventListener('selectionchange', () => extractor.invalidate())

  const selection = document.getSelection();
  const first_li = document.querySelector('li');
  selection.selectAllChildren(first_li)
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy()
  expect(extractor.links).toHaveLength(1);

  const second_li = first_li.nextElementSibling.nextElementSibling;
  selection.extend(second_li);
  // That not send a selectionchange event in JSDOM.
  // document.dispatchEvent(new window.Event('selectionchange'));
  
  expect(extractor.valid).toBeFalsy();
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(2);
});

test('Cross container', () => {
  document.body.innerHTML = doc1;

  const extractor = new SelectionLinkExtractor();
  document.addEventListener('selectionchange', () => extractor.invalidate())

  const selection = document.getSelection();
  const first_ol = document.querySelector('ol');
  const first_ol_last_li = first_ol.children[first_ol.children.length - 1];
  const second_ol = first_ol.nextElementSibling;
  const second_ol_first_li = second_ol.querySelector('li');
  selection.setBaseAndExtent(first_ol_last_li, 0, second_ol_first_li, 1);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy()
  expect(extractor.links).toHaveLength(2);
  expect(extractor.links).toEqual([
    'http://localhost/b',
    'http://localhost/d',
  ]);
});

test('processSelection: getSelection returning null exits early', () => {
  document.body.innerHTML = doc1;
  const extractor = new SelectionLinkExtractor();
  vi.spyOn(window, 'getSelection').mockReturnValueOnce(null);
  extractor.processSelection();
  expect(extractor.valid).toBeFalsy();
  expect(extractor.links).toHaveLength(0);
});

test('processFragment: non-http protocol is skipped', () => {
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const fragment = document.createDocumentFragment();
  const a = document.createElement('a');
  a.href = 'ftp://example.com/file';
  a.textContent = 'FTP link';
  fragment.appendChild(a);
  extractor.processFragment(fragment);
  expect(extractor.links).toHaveLength(0);
});

test('processFragment: invalid URL is caught and skipped', () => {
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const fragment = document.createDocumentFragment();
  const a = document.createElement('a');
  Object.defineProperty(a, 'href', { get: () => 'http://[invalid' });
  a.setAttribute('href', 'x');  // needed to match a[href] selector
  fragment.appendChild(a);
  extractor.processFragment(fragment);
  expect(extractor.links).toHaveLength(0);
});

test('processFragment: uses <base> href when present in document head', () => {
  // happy-dom resolves anchor.href against window.location before processFragment
  // sees it, so we call processFragment directly with a synthetic relative href.
  document.head.innerHTML = '<base href="https://base.example.com/">';
  const extractor = new SelectionLinkExtractor();
  const fragment = document.createDocumentFragment();
  const a = document.createElement('a');
  Object.defineProperty(a, 'href', { get: () => 'page.html' });
  a.setAttribute('href', 'page.html');
  fragment.appendChild(a);
  extractor.processFragment(fragment);
  document.head.innerHTML = '';
  expect(extractor.links).toEqual(['https://base.example.com/page.html']);
});

test('processSelection: debug mode logs without affecting output', () => {
  document.body.innerHTML = doc1;
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  extractor.debug = true;
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links.length).toBeGreaterThan(0);
});

test('processAnchorAncestor: text node anchorNode uses parentElement', () => {
  document.body.innerHTML = `<a href="http://localhost/a">link text</a>`;
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const a = document.querySelector('a');
  const textNode = a.firstChild;  // Text node, not Element
  const selection = document.getSelection();
  selection.setBaseAndExtent(textNode, 0, textNode, 4);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/a']);
});

test('processAnchorAncestor: no anchor ancestor adds no links', () => {
  document.body.innerHTML = `<p id="p">plain text with no links</p>`;
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const p = document.getElementById('p');
  const selection = document.getSelection();
  selection.selectAllChildren(p);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(0);
});

test('processAnchorAncestor: invalid URL in ancestor anchor is caught', () => {
  document.body.innerHTML = `<a id="a">text</a>`;
  window.location.href = 'http://localhost/';
  const anchor = document.getElementById('a') as HTMLAnchorElement;
  Object.defineProperty(anchor, 'href', { get: () => 'http://[invalid', configurable: true });
  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(anchor);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(0);
});

test('processFragment: empty label falls back to [empty]', () => {
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const fragment = document.createDocumentFragment();
  const a = document.createElement('a');
  a.href = 'http://x/';
  a.innerHTML = '<img src="something.jpg">';
  fragment.appendChild(a);
  extractor.processFragment(fragment);
  expect(extractor.links).toEqual(['http://x/']);
  expect(extractor.labels).toEqual(['[empty]']);
});

test('processSelection: traverses open shadow root for links', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<p>text</p><div id="host"></div>';
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<a href="http://localhost/shadow">Shadow link</a>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/shadow']);
  expect(extractor.labels).toEqual(['Shadow link']);
});

test('processSelection: traverses nested open shadow roots for links', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<div id="inner-host"></div>';
  const innerHost = shadow.getElementById('inner-host')!;
  const innerShadow = innerHost.attachShadow({ mode: 'open' });
  innerShadow.innerHTML = '<a href="http://localhost/nested">Nested link</a>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/nested']);
  expect(extractor.labels).toEqual(['Nested link']);
});

test('processSelection: mix of light DOM and shadow DOM links', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = `
    <a href="http://localhost/before">Before</a>
    <div id="host"></div>
    <a href="http://localhost/after">After</a>
  `;
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<a href="http://localhost/shadow">Shadow link</a>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual([
    'http://localhost/before',
    'http://localhost/after',
    'http://localhost/shadow',
  ]);
  expect(extractor.labels).toEqual([
    'Before',
    'After',
    'Shadow link',
  ]);
});

test('processSelection: multiple shadow hosts alongside light DOM links', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = `
    <a href="http://localhost/a">A</a>
    <div id="host1"></div>
    <a href="http://localhost/b">B</a>
    <div id="host2"></div>
  `;
  const host1 = document.getElementById('host1')!;
  host1.attachShadow({ mode: 'open' }).innerHTML =
    '<a href="http://localhost/shadow1">Shadow 1</a>';
  const host2 = document.getElementById('host2')!;
  host2.attachShadow({ mode: 'open' }).innerHTML =
    '<a href="http://localhost/shadow2">Shadow 2</a>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual([
    'http://localhost/a',
    'http://localhost/b',
    'http://localhost/shadow1',
    'http://localhost/shadow2',
  ]);
  expect(extractor.labels).toEqual([
    'A',
    'B',
    'Shadow 1',
    'Shadow 2',
  ]);
});

test('processSelection: closed shadow root is left untouched', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = '<a href="http://localhost/closed">Closed link</a>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(0);
});

test('processSelection: recovers a selection collapsed entirely inside an open shadow root', () => {
  // Real browsers retarget a selection that lies wholly inside an open shadow
  // root to a zero-width point next to the host (see issue #32); simulate that
  // by collapsing the selection, then simulate Selection.getComposedRanges()
  // (unsupported by happy-dom) resolving the true, non-collapsed boundary.
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<a href="http://localhost/shadow">Shadow link</a>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection()!;
  selection.collapse(document.body, 1);
  expect(selection.getRangeAt(0).collapsed).toBeTruthy();
  (selection as any).getComposedRanges = () => [{
    startContainer: shadow,
    startOffset: 0,
    endContainer: shadow,
    endOffset: 1,
  }];

  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/shadow']);
  expect(extractor.labels).toEqual(['Shadow link']);
});

test('processSelection: recovers a selection collapsed inside a deeply nested shadow root', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<div id="inner-host"></div>';
  const innerHost = shadow.getElementById('inner-host')!;
  const innerShadow = innerHost.attachShadow({ mode: 'open' });
  innerShadow.innerHTML = '<a href="http://localhost/nested">Nested link</a>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection()!;
  selection.collapse(document.body, 1);
  expect(selection.getRangeAt(0).collapsed).toBeTruthy();
  (selection as any).getComposedRanges = () => [{
    startContainer: innerShadow,
    startOffset: 0,
    endContainer: innerShadow,
    endOffset: 1,
  }];

  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/nested']);
  expect(extractor.labels).toEqual(['Nested link']);
});

test('processSelection: recovers a selection spanning sibling shadow hosts under a shared shadow root', () => {
  // Mirrors a card/tile layout (e.g. a list of results) where each tile is its
  // own custom element with its own shadow root, all hosted inside a shared
  // "container" component's shadow root. The middle tile is only reachable by
  // scanning inside the shared root, not by name, exercising processShadowHosts
  // being handed a ShadowRoot (rather than an Element) as commonAncestorContainer.
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<div id="browser"></div>';
  const browserHost = document.getElementById('browser')!;
  const browserShadow = browserHost.attachShadow({ mode: 'open' });
  browserShadow.innerHTML = '<div id="tile1"></div><div id="tile2"></div><div id="tile3"></div>';

  const tileShadows = ['tile1', 'tile2', 'tile3'].map((id, i) => {
    const tile = browserShadow.getElementById(id)!;
    const tileShadow = tile.attachShadow({ mode: 'open' });
    tileShadow.innerHTML = `<a href="http://localhost/${id}">Tile ${i + 1}</a>`;
    return tileShadow;
  });

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection()!;
  selection.collapse(document.body, 1);
  expect(selection.getRangeAt(0).collapsed).toBeTruthy();
  (selection as any).getComposedRanges = () => [{
    startContainer: tileShadows[0],
    startOffset: 0,
    endContainer: tileShadows[2],
    endOffset: 1,
  }];

  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual([
    'http://localhost/tile1',
    'http://localhost/tile2',
    'http://localhost/tile3',
  ]);
  expect(extractor.labels).toEqual(['Tile 1', 'Tile 2', 'Tile 3']);
});

test('processSelection: getComposedRanges spanning disconnected shadow trees is skipped, not thrown', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<a href="http://localhost/shadow">Shadow link</a>';

  const detachedHost = document.createElement('div');
  const detachedShadow = detachedHost.attachShadow({ mode: 'open' });
  detachedShadow.innerHTML = '<a href="http://localhost/detached">Detached link</a>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection()!;
  selection.collapse(document.body, 1);
  (selection as any).getComposedRanges = () => [{
    startContainer: shadow,
    startOffset: 0,
    endContainer: detachedShadow,
    endOffset: 1,
  }];

  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(0);
});

test('Anchor ancestor is found', () => {
  document.body.innerHTML = `<a href="http://localhost/a">
a<div id="child">b</div>
</a>'`;

  const extractor = new SelectionLinkExtractor();
  document.addEventListener('selectionchange', () => extractor.invalidate())

  const selection = document.getSelection();
  const child = document.getElementById('child');
  selection.selectAllChildren(child);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy()
  expect(extractor.links).toHaveLength(1);
  expect(extractor.links).toEqual([
    'http://localhost/a',
  ]);
  expect(extractor.labels).toEqual([
    'b',
  ]);
});

// happy-dom 14.x has no HTMLAreaElement implementation: document.createElement('area')
// (or innerHTML-parsed <area>) yields a plain HTMLElement whose .href getter is always
// undefined, regardless of the href attribute. Range.cloneContents() (used by the
// processSelection path) clones nodes, which would drop any Object.defineProperty
// override placed on the original — so, as with the "<base> href" test above, we call
// processFragment directly with elements whose .href getter we override ourselves to
// simulate what a real browser (where <area> implements HTMLHyperlinkElementUtils)
// would report.
test('processFragment: <area href> image map links are extracted with alt as label', () => {
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const fragment = document.createDocumentFragment();
  const map = document.createElement('map');
  const area1 = document.createElement('area');
  area1.setAttribute('href', 'http://localhost/room1');
  area1.setAttribute('alt', 'Room 1');
  Object.defineProperty(area1, 'href', { get: () => 'http://localhost/room1' });
  const area2 = document.createElement('area');
  area2.setAttribute('href', 'http://localhost/room2');
  area2.setAttribute('alt', 'Room 2');
  Object.defineProperty(area2, 'href', { get: () => 'http://localhost/room2' });
  map.appendChild(area1);
  map.appendChild(area2);
  fragment.appendChild(map);
  extractor.processFragment(fragment);
  expect(extractor.links).toEqual([
    'http://localhost/room1',
    'http://localhost/room2',
  ]);
  expect(extractor.labels).toEqual([
    'Room 1',
    'Room 2',
  ]);
});

test('processFragment: <area> with no alt attribute falls back to [empty] label', () => {
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const fragment = document.createDocumentFragment();
  const area = document.createElement('area');
  area.setAttribute('href', 'http://localhost/room1');
  Object.defineProperty(area, 'href', { get: () => 'http://localhost/room1' });
  fragment.appendChild(area);
  extractor.processFragment(fragment);
  expect(extractor.links).toEqual(['http://localhost/room1']);
  expect(extractor.labels).toEqual(['[empty]']);
});

test('processSelection: <button formaction> is extracted using its text as label', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = `<button formaction="http://localhost/submit">Send</button>`;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/submit']);
  expect(extractor.labels).toEqual(['Send']);
});

test('processSelection: <input type="submit" formaction> is extracted', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = `<input type="submit" formaction="http://localhost/submit" value="Go">`;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/submit']);
  expect(extractor.labels).toEqual(['[empty]']);
});

test('processSelection: <input type="image" formaction> is extracted', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = `<input type="image" formaction="http://localhost/submit-image">`;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/submit-image']);
  expect(extractor.labels).toEqual(['[empty]']);
});

test('processSelection: formaction on a plain text input is ignored', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = `<input type="text" formaction="http://localhost/ignored">`;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(0);
});

test('processSelection: <button> without formaction is ignored', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = `<button>Click me</button>`;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(0);
});

test('processFragment: <button formaction> resolves against <base> href like anchors', () => {
  // Same workaround as "processFragment: uses <base> href when present in document
  // head" above: happy-dom would otherwise resolve the IDL formAction property
  // against window.location before processFragment sees it, so override the getter
  // to return the raw relative value and let the extractor's own base-URL lookup
  // (document.head.querySelector('base')) do the resolution.
  document.head.innerHTML = '<base href="https://base.example.com/deep/link/">';
  const extractor = new SelectionLinkExtractor();
  const fragment = document.createDocumentFragment();
  const button = document.createElement('button');
  button.setAttribute('formaction', '../submit');
  Object.defineProperty(button, 'formAction', { get: () => '../submit' });
  button.textContent = 'Go';
  fragment.appendChild(button);
  extractor.processFragment(fragment);
  document.head.innerHTML = '';
  expect(extractor.links).toEqual(['https://base.example.com/deep/submit']);
  expect(extractor.labels).toEqual(['Go']);
});

test('processAnchorAncestor: recognizes a formaction button as link ancestor', () => {
  document.body.innerHTML = `<button formaction="http://localhost/submit">
Send<span id="child">it</span>
</button>`;
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  const child = document.getElementById('child');
  selection.selectAllChildren(child);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/submit']);
  expect(extractor.labels).toEqual(['it']);
});

test('processAnchorAncestor: recognizes an <area> itself as link ancestor', () => {
  // processAnchorAncestor reads selection.anchorNode directly from the live document
  // (no Range.cloneContents() involved), so the .href override on the live element
  // (see the happy-dom HTMLAreaElement note above) is honored here.
  document.body.innerHTML = `<map name="m"><area shape="rect" coords="0,0,10,10" href="http://localhost/room1" alt="Room 1"></map>`;
  window.location.href = 'http://localhost/';
  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  const area = document.querySelector('area')!;
  Object.defineProperty(area, 'href', { get: () => 'http://localhost/room1' });
  selection.selectAllChildren(area);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/room1']);
});

test('processSelection: traverses open shadow root for formaction buttons', () => {
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<p>text</p><div id="host"></div>';
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button formaction="http://localhost/shadow-submit">Go</button>';

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/shadow-submit']);
  expect(extractor.labels).toEqual(['Go']);
});

test('processSelection: traverses open shadow root for <area> elements', () => {
  // processShadowHosts calls processFragment on the *live* shadow root (shadow trees
  // aren't cloned by Range.cloneContents()), so the .href override below (see the
  // happy-dom HTMLAreaElement note above) survives here, unlike the plain light-DOM
  // area tests which had to use processFragment directly.
  window.location.href = 'http://localhost/';
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById('host')!;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<map name="m"><area shape="rect" coords="0,0,10,10" href="http://localhost/shadow-area" alt="Shadow Area"></map>';
  const area = shadow.querySelector('area')!;
  Object.defineProperty(area, 'href', { get: () => 'http://localhost/shadow-area' });

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.body);
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/shadow-area']);
  expect(extractor.labels).toEqual(['Shadow Area']);
});

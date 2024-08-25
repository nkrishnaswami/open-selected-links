import { expect, test } from 'vitest';
import { chrome } from 'vitest-chrome';
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

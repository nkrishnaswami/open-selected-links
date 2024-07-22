import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { SelectionLinkExtractor } from '../src/contentScript/extractor';


const doc1 = `<html>
  <head>
    <title>List Test Document</title>
  </head>
  <body>
    <ol id="ol1">
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
    </ol>
  </body>
</html>`


test('select whole document', () => {
  let d = new JSDOM(doc1);
  global.window = d.window;
  global.document = d.window.document;

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

test('Empty selection', () => {
  let d = new JSDOM(doc1);
  global.window = d.window;
  global.document = d.window.document;

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
  let d = new JSDOM(doc1);
  global.window = d.window;
  global.document = d.window.document;

  const extractor = new SelectionLinkExtractor();
  const selection = document.getSelection();
  selection.selectAllChildren(document.querySelector('li'));
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toEqual(['http://localhost/a']);
  expect(extractor.labels).toEqual(['A1']);
});

test('Extend selection', () => {
  let d = new JSDOM(doc1, {runScript: 'dangerously'});
  global.window = d.window;
  global.document = d.window.document;

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
  document.dispatchEvent(new window.Event('selectionchange'));
  
  expect(extractor.valid).toBeFalsy();
  extractor.processSelection();
  expect(extractor.valid).toBeTruthy();
  expect(extractor.links).toHaveLength(2);
});

test('Cross container', () => {
  let d = new JSDOM(doc1, {runScript: 'dangerously'});
  global.window = d.window;
  global.document = d.window.document;

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

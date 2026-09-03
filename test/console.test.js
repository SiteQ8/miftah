import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

import { buildConsole } from '../src/console.js';
import { scanTree } from '../src/scan.js';

const ROOT = path.join(import.meta.dirname, '..', 'examples', 'sample-estate');
const scan = scanTree(ROOT);

// jsdom is a development convenience rather than a dependency, so the suite
// still runs without it and simply reports these as skipped.
async function loadJsdom() {
  for (const specifier of ['jsdom', '/tmp/node_modules/jsdom/lib/api.js']) {
    try {
      const module = await import(specifier);
      return module.JSDOM || module.default?.JSDOM;
    } catch {
      // try the next location
    }
  }
  try {
    const require = createRequire(import.meta.url);
    return require('jsdom').JSDOM;
  } catch {
    return null;
  }
}

const JSDOM = await loadJsdom();

test('the console page is a complete standalone document', () => {
  const html = buildConsole(scan);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  // Standalone means the page never reaches the network. The only absolute URL
  // allowed is the SVG namespace, which is an identifier and not a fetch.
  assert.ok(!html.includes('<script src='), 'the console must not load external script');
  assert.ok(!/<link[^>]+href="https?:/.test(html), 'the console must not load external style');
  assert.ok(!/\bfetch\s*\(/.test(html), 'the console must not call fetch');
  assert.ok(!html.includes('XMLHttpRequest'), 'the console must not call XMLHttpRequest');
  for (const url of html.match(/https?:\/\/[^"'\s)]+/g) || []) {
    assert.equal(url, 'http://www.w3.org/2000/svg', `unexpected absolute URL in the console: ${url}`);
  }
  assert.ok(!html.includes('localStorage'), 'the console must not depend on browser storage');
});

test('the console embeds the scan it was built with', () => {
  const html = buildConsole(scan);
  assert.ok(html.includes('"findings"'));
  assert.ok(html.includes('MFT-'));
});

test('the console builds empty when given no scan', () => {
  const html = buildConsole(null);
  assert.ok(html.includes('var seeded = null;'));
  assert.ok(html.includes('Drop a scan result here'));
});

test('the console renders the seeded scan in a real DOM', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  const dom = new JSDOM(buildConsole(scan), { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(window.miftah, 'the page script did not run');
  assert.equal(window.document.getElementById('report').hidden, false, 'the report stayed hidden');
  assert.equal(window.document.getElementById('empty').hidden, true, 'the drop zone stayed visible');

  const figures = window.document.getElementById('figures');
  assert.ok(figures.querySelectorAll('.figure').length === 5, 'the summary figures did not render');

  const inventory = window.document.getElementById('inventory');
  assert.ok(inventory.querySelectorAll('tbody tr').length >= 10, 'the inventory table is empty');
  assert.ok(inventory.textContent.includes('SHA-1'));
  assert.ok(inventory.textContent.includes('ML-DSA-65'));

  assert.ok(window.document.getElementById('horizonFigure').querySelector('svg'), 'the horizon strip did not render');
  window.close();
});

test('the console rescores when the assumptions move', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  const dom = new JSDOM(buildConsole(scan), { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const before = window.document.querySelector('#figures .headline .figure-value').textContent;
  const peakBefore = window.miftah.state.estate.peakRisk;

  const horizon = window.document.getElementById('horizon');
  horizon.value = '2045';
  horizon.dispatchEvent(new window.Event('input'));

  assert.equal(window.document.getElementById('horizonOut').textContent, '2045');
  assert.ok(window.miftah.state.estate.peakRisk < peakBefore, 'pushing the horizon out must lower the peak risk');
  assert.ok(window.document.getElementById('verdict').textContent.length > 20);
  assert.equal(typeof before, 'string');
  window.close();
});

test('the console filter narrows the tables', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  const dom = new JSDOM(buildConsole(scan), { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const all = window.document.querySelectorAll('#inventory tbody tr').length;
  const search = window.document.getElementById('search');
  search.value = 'SHA-1';
  search.dispatchEvent(new window.Event('input'));

  const filtered = window.document.querySelectorAll('#inventory tbody tr').length;
  assert.ok(filtered < all, 'the filter did not narrow the inventory');
  assert.ok(filtered >= 1, 'the filter removed everything');
  window.close();
});

test('the console tabs swap panels', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  const dom = new JSDOM(buildConsole(scan), { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(window.document.getElementById('roadmap').hidden, true);
  const roadmapTab = window.document.querySelector('.tab[data-panel="roadmap"]');
  roadmapTab.dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.equal(window.document.getElementById('roadmap').hidden, false);
  assert.equal(window.document.getElementById('inventory').hidden, true);
  assert.ok(window.document.getElementById('roadmap').textContent.includes('Stop the bleeding'));
  window.close();
});

test('the console scoring agrees with the node scoring', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  const { scoreEstate } = await import('../src/risk.js');
  const dom = new JSDOM(buildConsole(scan), { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const profile = { shelfLife: 10, migrationYears: 5, crqcYear: 2033, exposure: 'internet' };
  const inNode = scoreEstate(scan.assets, profile);
  const inBrowser = window.miftah.scoreEstate(scan.assets, profile);

  assert.equal(inBrowser.readiness, inNode.readiness, 'readiness diverged between the two implementations');
  assert.equal(inBrowser.peakRisk, inNode.peakRisk, 'peak risk diverged between the two implementations');
  assert.equal(inBrowser.counts.quantumBroken, inNode.counts.quantumBroken);
  window.close();
});

// ---------------------------------------------------------------------------
// The table rotted while the hero band stayed fine. These pin the parts that
// broke, because every one of them was invisible from the code and obvious in
// a screenshot.
// ---------------------------------------------------------------------------

test('an asset name and its note do not run together', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  // The row emitted class="note" while the stylesheet defined .asset-note, so
  // the note took no styling and rendered as RC4Biased keystream.
  const dom = new JSDOM(buildConsole(scan), { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const notes = window.document.querySelectorAll('#inventory .asset-note');
  assert.ok(notes.length > 0, 'no asset carried a note element');
  for (const note of notes) {
    assert.ok(note.previousElementSibling, 'a note has no name beside it');
    assert.equal(note.previousElementSibling.className, 'asset-name');
  }
  const styles = buildConsole(scan);
  assert.match(styles, /\.asset-note\s*\{[^}]*display:\s*block/, 'the note is not on its own line');
  window.close();
});

test('the risk column draws a bar, not a number on a block', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  const dom = new JSDOM(buildConsole(scan), { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const fills = window.document.querySelectorAll('#inventory .risk-fill');
  assert.ok(fills.length > 0, 'no risk bar was drawn');
  for (const fill of fills) {
    assert.match(fill.getAttribute('style'), /width:\s*\d+%/, 'a risk bar has no width');
    assert.match(fill.getAttribute('style'), /background:\s*#/, 'a risk bar has no colour');
  }
  // The colour should carry the band, so the highest and lowest must differ.
  const colours = new Set([...fills].map((f) => f.getAttribute('style').split('background:')[1]));
  assert.ok(colours.size > 1, 'every risk bar is the same colour, so length is the only signal');
  window.close();
});

test('the verdict column is a dot rather than a wall of blocks', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  const html = buildConsole(scan);
  assert.match(html, /\.chip::before/, 'the chip carries no dot');
  assert.match(html, /--chip-dot:/, 'the chip colour is not passed as a dot');

  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));
  for (const chip of window.document.querySelectorAll('#inventory .chip')) {
    assert.ok(!/background:\s*#/.test(chip.getAttribute('style') || ''), 'a verdict chip is still solid filled');
  }
  window.close();
});

test('the inventory table declares its column widths', { skip: !JSDOM && 'jsdom is not installed' }, async () => {
  // Without them the asset column takes a quarter of the table and the uses
  // column wraps its own header to two lines.
  const dom = new JSDOM(buildConsole(scan), { runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const cols = window.document.querySelectorAll('#inventory colgroup col');
  const headers = window.document.querySelectorAll('#inventory thead th');
  assert.equal(cols.length, headers.length, 'the column widths and the headers disagree');
  assert.ok(cols.length >= 7);
  window.close();
});

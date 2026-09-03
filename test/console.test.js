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

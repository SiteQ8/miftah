import test from 'node:test';
import { VERSION } from '../src/version.js';
import { THEME } from '../src/theme.js';
import assert from 'node:assert/strict';
import path from 'node:path';

import { scanTree } from '../src/scan.js';
import { buildCbom, validateCbom, SPEC_VERSION } from '../src/cbom.js';
import { scoreEstate, scoreAsset, moscaDeficit, band, DEFAULT_PROFILE } from '../src/risk.js';
import { buildRoadmap, WAVES } from '../src/roadmap.js';
import { runChecklist } from '../src/agility.js';
import { assemble, toMarkdown, toHtml } from '../src/report.js';
import { horizonStrip, compositionBar } from '../src/timeline.js';
import { t, STRINGS, LOCALES } from '../src/i18n.js';
import { QUANTUM, CLASSICAL } from '../src/catalog.js';

const ROOT = path.join(import.meta.dirname, '..', 'examples', 'sample-estate');
const scan = scanTree(ROOT);
const NOW = new Date('2026-01-01T00:00:00Z');

// ------------------------------------------------------------------- mosca

test('the Mosca inequality is breached when secrecy outruns the horizon', () => {
  const mosca = moscaDeficit({ shelfLife: 10, migrationYears: 5, crqcYear: 2033 }, NOW);
  assert.equal(mosca.yearsToHorizon, 7);
  assert.equal(mosca.deficit, 8);
  assert.equal(mosca.breached, true);
});

test('the Mosca inequality clears when the horizon is far enough away', () => {
  const mosca = moscaDeficit({ shelfLife: 2, migrationYears: 1, crqcYear: 2045 }, NOW);
  assert.equal(mosca.breached, false);
  assert.ok(mosca.deficit < 0);
});

test('moving the horizon moves the risk', () => {
  const asset = { id: 'RSA', name: 'RSA', quantum: QUANTUM.BROKEN, classical: CLASSICAL.ACCEPTABLE, occurrences: [{}] };
  const soon = scoreAsset(asset, { crqcYear: 2030 }, NOW);
  const late = scoreAsset(asset, { crqcYear: 2050 }, NOW);
  assert.ok(soon.score > late.score, 'a nearer horizon must raise the score');
});

test('a quantum resistant asset scores nothing on the quantum axis', () => {
  const asset = { id: 'AES-256', name: 'AES-256', quantum: QUANTUM.RESISTANT, classical: CLASSICAL.STRONG, occurrences: [{}] };
  const scored = scoreAsset(asset, DEFAULT_PROFILE, NOW);
  assert.ok(scored.score < 15, `expected a low score, got ${scored.score}`);
  assert.equal(scored.band, 'low');
});

test('a broken classical primitive scores high whatever the horizon', () => {
  const asset = { id: 'MD5', name: 'MD5', quantum: QUANTUM.BROKEN, classical: CLASSICAL.BROKEN, occurrences: [{}, {}] };
  const scored = scoreAsset(asset, { crqcYear: 2060 }, NOW);
  assert.ok(scored.score >= 40, `expected a meaningful score, got ${scored.score}`);
});

test('air gapped exposure lowers the score but never to nothing', () => {
  const asset = { id: 'RSA', name: 'RSA', quantum: QUANTUM.BROKEN, classical: CLASSICAL.ACCEPTABLE, occurrences: [{}] };
  const online = scoreAsset(asset, { exposure: 'internet' }, NOW);
  const offline = scoreAsset(asset, { exposure: 'airgapped' }, NOW);
  assert.ok(offline.score < online.score);
  assert.ok(offline.score > 0);
});

test('the risk bands partition the range', () => {
  assert.equal(band(90), 'critical');
  assert.equal(band(60), 'high');
  assert.equal(band(40), 'medium');
  assert.equal(band(5), 'low');
  assert.equal(band(0), 'none');
});

test('estate readiness rises as resistant assets replace broken ones', () => {
  const broken = [{ id: 'a', quantum: QUANTUM.BROKEN, classical: CLASSICAL.ACCEPTABLE, occurrences: [{}] }];
  const mixed = [
    { id: 'a', quantum: QUANTUM.BROKEN, classical: CLASSICAL.ACCEPTABLE, occurrences: [{}] },
    { id: 'b', quantum: QUANTUM.RESISTANT, classical: CLASSICAL.STRONG, occurrences: [{}] }
  ];
  assert.ok(scoreEstate(mixed, DEFAULT_PROFILE, NOW).readiness > scoreEstate(broken, DEFAULT_PROFILE, NOW).readiness);
});

test('the sample estate scores as an unprepared one', () => {
  const estate = scoreEstate(scan.assets, DEFAULT_PROFILE, NOW);
  assert.ok(estate.readiness < 50, `expected low readiness, got ${estate.readiness}`);
  assert.ok(estate.counts.quantumBroken > estate.counts.quantumResistant);
  assert.equal(estate.assets.length, scan.assets.length);
});

// -------------------------------------------------------------------- cbom

test('the CBOM is well formed CycloneDX 1.6', () => {
  const bom = buildCbom(scan, { version: VERSION });
  assert.equal(bom.bomFormat, 'CycloneDX');
  assert.equal(bom.specVersion, SPEC_VERSION);
  assert.match(bom.serialNumber, /^urn:uuid:/);
  assert.ok(bom.components.length > 0);
  const check = validateCbom(bom);
  assert.equal(check.valid, true, check.errors.join('; '));
});

test('every CBOM component is a cryptographic asset with a valid primitive', () => {
  const bom = buildCbom(scan);
  for (const component of bom.components) {
    assert.equal(component.type, 'cryptographic-asset');
    assert.ok(component['bom-ref'].startsWith('crypto/'));
    assert.ok(component.cryptoProperties.assetType);
  }
});

test('the CBOM carries file and line evidence back to the source', () => {
  const bom = buildCbom(scan);
  const withEvidence = bom.components.filter((c) => c.evidence && c.evidence.occurrences.length);
  assert.ok(withEvidence.length > 0);
  const occurrence = withEvidence[0].evidence.occurrences[0];
  assert.ok(occurrence.location);
  assert.equal(typeof occurrence.line, 'number');
});

test('the CBOM records the NIST quantum security level for post quantum assets', () => {
  const bom = buildCbom(scan);
  const mldsa = bom.components.find((c) => c.name === 'ML-DSA-65');
  assert.ok(mldsa, 'ML-DSA-65 missing from the CBOM');
  assert.equal(mldsa.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel, 3);
});

test('the validator rejects a malformed CBOM', () => {
  const bom = buildCbom(scan);
  bom.components[0].cryptoProperties.algorithmProperties = { primitive: 'nonsense', cryptoFunctions: ['fly'], nistQuantumSecurityLevel: 99 };
  const check = validateCbom(bom);
  assert.equal(check.valid, false);
  assert.ok(check.errors.length >= 2);
});

// ----------------------------------------------------------------- roadmap

test('the roadmap covers every asset exactly once', () => {
  const roadmap = buildRoadmap(scan, DEFAULT_PROFILE, NOW);
  const placed = roadmap.waves.reduce((total, wave) => total + wave.items.length, 0);
  assert.equal(placed, scan.assets.length);
  assert.equal(roadmap.waves.length, WAVES.length);
});

test('broken primitives land in the first wave', () => {
  const roadmap = buildRoadmap(scan, DEFAULT_PROFILE, NOW);
  const first = roadmap.waves[0].items.map((i) => i.asset);
  for (const expected of ['MD5', 'SHA-1', 'RC4', '3DES']) {
    assert.ok(first.includes(expected), `${expected} should be in wave 0`);
  }
});

test('key agreement lands in the transport wave and signatures in the identity wave', () => {
  const roadmap = buildRoadmap(scan, DEFAULT_PROFILE, NOW);
  assert.ok(roadmap.waves[2].items.some((i) => i.asset === 'ECDH'));
  assert.ok(roadmap.waves[4].items.some((i) => /Curve25519/.test(i.asset)));
});

test('each roadmap item names a destination', () => {
  const roadmap = buildRoadmap(scan, DEFAULT_PROFILE, NOW);
  for (const wave of roadmap.waves) {
    for (const item of wave.items) {
      assert.ok(item.to && item.to.length > 3, `${item.asset} has no destination`);
    }
  }
});

test('the roadmap raises rotation when key material is found in the tree', () => {
  const roadmap = buildRoadmap(scan, DEFAULT_PROFILE, NOW);
  assert.ok(roadmap.actions.some((a) => /rotate/i.test(a.action)));
});

// --------------------------------------------------------------- checklist

test('the checklist answers what it can from evidence', () => {
  const result = runChecklist(scan);
  assert.equal(result.results.length, 14);
  assert.ok(result.counts.fail > 0, 'the sample estate should fail several checks');
  assert.ok(result.score >= 0 && result.score <= 100);
});

test('a clean scan scores better than the sample estate', () => {
  const clean = { findings: [], assets: [{ id: 'AES-256', name: 'AES-256', quantum: QUANTUM.RESISTANT, primitive: 'block-cipher', occurrences: [{ file: 'a.js', line: 1 }] }] };
  assert.ok(runChecklist(clean).score > runChecklist(scan).score);
});

// ------------------------------------------------------------------ report

test('the Markdown report renders in both languages', () => {
  const model = assemble(scan, DEFAULT_PROFILE, NOW);
  for (const locale of LOCALES) {
    const markdown = toMarkdown(model, locale);
    assert.ok(markdown.length > 1500, `${locale} report is too short`);
    assert.ok(markdown.startsWith('# '));
    assert.ok(markdown.includes(t(locale, 'sectionRoadmap')));
  }
});

test('the HTML report is a complete document with the right direction', () => {
  const model = assemble(scan, DEFAULT_PROFILE, NOW);
  const english = toHtml(model, 'en');
  const arabic = toHtml(model, 'ar');
  assert.ok(english.startsWith('<!doctype html>'));
  assert.ok(english.includes('dir="ltr"'));
  assert.ok(arabic.includes('dir="rtl"'));
  assert.ok(english.includes('</html>'));
  assert.ok(english.includes('<svg'));
});

test('the report escapes content rather than interpolating it', () => {
  const hostile = {
    target: '<script>alert(1)</script>',
    findings: [{ rule: 'MFT-H001', title: '<img src=x onerror=alert(1)>', severity: 'high', file: 'a.js', line: 1, advice: 'x', algorithm: 'MD5', classical: 'broken', quantum: 'broken' }],
    assets: []
  };
  hostile.assets = [];
  const html = toHtml(assemble(hostile, DEFAULT_PROFILE, NOW), 'en');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x onerror'));
  assert.ok(html.includes('&lt;img src=x'));
});

test('every string key resolves in every locale', () => {
  const keys = Object.keys(STRINGS.en);
  for (const locale of LOCALES) {
    for (const key of keys) {
      assert.notEqual(t(locale, key), undefined, `${locale} is missing ${key}`);
    }
  }
});

// Arabic clauses join with حروف العطف وأدوات الربط, so the full stop belongs at
// the end of the sentence and nowhere inside it.
test('the Arabic strings place the full stop only at the end', () => {
  const flat = [];
  const walk = (node) => {
    for (const value of Object.values(node)) {
      if (typeof value === 'string') flat.push(value);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(STRINGS.ar);

  const connectors = ['و', 'ثم', 'ف', 'أو', 'لكن', 'بل', 'لذا', 'بينما', 'بالإضافة'];
  for (const text of flat) {
    if (!/[\u0600-\u06FF]/.test(text)) continue;
    const body = text.replace(/\.\s*$/, '').replace(/(\d)\.(\d)/g, '$1$2');
    assert.ok(!body.includes('.'), `full stop inside an Arabic sentence: ${text}`);
    for (const connector of connectors) {
      assert.ok(
        !new RegExp(`\\.\\s*${connector}`).test(text),
        `a connector follows a full stop instead of joining the clause: ${text}`
      );
    }
  }
});

// ------------------------------------------------------------------ visuals

test('the horizon strip is valid standalone SVG using literal colours', () => {
  const mosca = moscaDeficit(DEFAULT_PROFILE, NOW);
  const svg = horizonStrip(mosca);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(!svg.includes('var(--'), 'CSS variables do not survive rasterisation');
  assert.match(svg, /#[0-9a-f]{6}/i);
});

test('the horizon strip marks the exposed window only when there is one', () => {
  const breached = horizonStrip(moscaDeficit({ shelfLife: 15, migrationYears: 5, crqcYear: 2030 }, NOW));
  const clear = horizonStrip(moscaDeficit({ shelfLife: 1, migrationYears: 1, crqcYear: 2050 }, NOW));
  assert.ok(breached.includes('Exposed'));
  assert.ok(!clear.includes('Exposed'));
  // The exposure is part of the bar rather than a wash laid over it, so the
  // alarm colour must appear as a filled rect and only when there is exposure.
  assert.ok(new RegExp(`<rect[^>]+fill="${THEME.alarm}"`).test(breached));
  assert.ok(!clear.includes(THEME.alarm));
});

test('the horizon strip has a dark variant for the readout band', () => {
  const mosca = moscaDeficit(DEFAULT_PROFILE, NOW);
  const dark = horizonStrip(mosca, { theme: 'dark' });
  const light = horizonStrip(mosca, { theme: 'light' });
  assert.ok(dark.includes(THEME.signal), 'the dark strip should signal exposure in amber');
  assert.ok(light.includes(THEME.alarm), 'the light strip should signal exposure in red');
  assert.notEqual(dark, light);
});

test('the horizon strip always names the secrecy span', () => {
  // A narrow safe sliver cannot hold its own label, so it must be captioned
  // beneath instead. An unlabelled block is worse than a long label.
  const narrow = horizonStrip(moscaDeficit({ shelfLife: 20, migrationYears: 1, crqcYear: 2028 }, NOW));
  const wide = horizonStrip(moscaDeficit({ shelfLife: 4, migrationYears: 2, crqcYear: 2044 }, NOW));
  assert.ok(narrow.includes('Must stay secret'), 'the secrecy span went unnamed when the safe part was narrow');
  assert.ok(wide.includes('Must stay secret'));
});

test('the horizon strip mirrors for right to left', () => {
  const mosca = moscaDeficit(DEFAULT_PROFILE, NOW);
  assert.notEqual(horizonStrip(mosca, { rtl: true }), horizonStrip(mosca, { rtl: false }));
});

test('the composition bar renders every share', () => {
  const svg = compositionBar({ quantumBroken: 5, quantumWeakened: 2, quantumResistant: 3 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.equal((svg.match(/<rect/g) || []).length, 3, 'one rect per share and no decoration');
  for (const label of ['broken', 'weakened', 'resistant']) {
    assert.ok(svg.includes(label), `the ${label} share was not labelled`);
  }
});

test('the composition bar drops shares that are zero', () => {
  const svg = compositionBar({ quantumBroken: 4, quantumWeakened: 0, quantumResistant: 0 });
  assert.equal((svg.match(/<rect/g) || []).length, 1);
  assert.ok(!svg.includes('weakened'));
});

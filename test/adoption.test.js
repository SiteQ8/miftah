import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scanTree, scanText } from '../src/scan.js';
import {
  fingerprint, createBaseline, applyBaseline, pruneBaseline,
  readBaseline, writeBaseline, BASELINE_VERSION
} from '../src/baseline.js';
import { buildSarif, validateSarif, SARIF_VERSION } from '../src/sarif.js';

const ROOT = path.join(import.meta.dirname, '..', 'examples', 'sample-estate');
const scan = scanTree(ROOT);

// --------------------------------------------------------------- baseline

test('a fingerprint survives the code moving down the file', () => {
  // A baseline that expires on every refactor teaches people to regenerate it
  // without reading the diff, which defeats the point of having one.
  const before = scanText("crypto.createHash('md5')", 'a.js')[0];
  const after = scanText("// a new comment\n// and another\ncrypto.createHash('md5')", 'a.js')[0];
  assert.notEqual(before.line, after.line);
  assert.equal(fingerprint(before), fingerprint(after));
});

test('a fingerprint changes when the finding really changes', () => {
  const weak = scanText('rsa.generate_private_key(key_size=1024)', 'a.py')
    .find((f) => f.rule === 'MFT-A001');
  const strong = scanText('rsa.generate_private_key(key_size=4096)', 'a.py')
    .find((f) => f.rule === 'MFT-A001');
  assert.notEqual(fingerprint(weak), fingerprint(strong));

  const moved = scanText("crypto.createHash('md5')", 'b.js')[0];
  const original = scanText("crypto.createHash('md5')", 'a.js')[0];
  assert.notEqual(fingerprint(moved), fingerprint(original), 'the same code in a new file is a new finding');
});

test('a baseline accepts everything present when it is written', () => {
  const baseline = createBaseline(scan);
  assert.equal(baseline.version, BASELINE_VERSION);
  assert.ok(baseline.accepted.length > 0);
  const split = applyBaseline(scan, baseline);
  assert.equal(split.introduced.length, 0, 'the scan that produced the baseline still had new findings');
  assert.equal(split.resolved.length, 0);
});

test('a baseline entry is readable without running the tool', () => {
  // A baseline nobody can review in a pull request is a rubber stamp.
  const [entry] = createBaseline(scan).accepted;
  for (const key of ['id', 'rule', 'file', 'title', 'severity']) {
    assert.ok(entry[key] !== undefined, `a baseline entry has no ${key}`);
  }
});

test('a new finding is not absorbed by the baseline', () => {
  const baseline = createBaseline(scan);
  const extra = scanText("const h = crypto.createHash('md5').update(k);", 'src/brand-new.js');
  const withNew = { findings: [...scan.findings, ...extra] };
  const split = applyBaseline(withNew, baseline);
  assert.equal(split.introduced.length, extra.length);
  assert.ok(split.introduced.every((f) => f.baselined === false));
});

test('findings are marked rather than removed', () => {
  const baseline = createBaseline(scan);
  const copy = { findings: scan.findings.map((f) => ({ ...f })) };
  const split = applyBaseline(copy, baseline);
  assert.equal(copy.findings.length, scan.findings.length, 'the scan lost findings to the baseline');
  assert.ok(split.suppressed.every((f) => f.baselined === true));
});

test('a baseline reports what has been fixed since', () => {
  const baseline = createBaseline(scan);
  const half = { findings: scan.findings.slice(0, 3) };
  const split = applyBaseline(half, baseline);
  assert.equal(split.resolved.length, baseline.accepted.length - new Set(half.findings.map(fingerprint)).size);
  assert.ok(split.resolved.length > 0);
});

test('pruning drops what is fixed and adopts nothing new', () => {
  const baseline = createBaseline(scan);
  const half = { findings: scan.findings.slice(0, 4) };
  const { baseline: pruned, removed } = pruneBaseline(baseline, half);
  assert.ok(removed > 0);
  assert.equal(pruned.accepted.length, baseline.accepted.length - removed);

  const extra = scanText("crypto.createHash('md5')", 'src/unseen.js');
  const { baseline: again } = pruneBaseline(baseline, { findings: [...scan.findings, ...extra] });
  assert.equal(again.accepted.length, baseline.accepted.length, 'pruning silently adopted a new finding');
});

test('a baseline from a future version is refused rather than misread', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miftah-bl-'));
  const file = path.join(dir, 'b.json');
  writeBaseline(file, Object.assign(createBaseline(scan), { version: 99 }));
  assert.throws(() => readBaseline(file), /not supported/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the tool does not scan its own output', () => {
  // The baseline file is JSON full of rule titles and algorithm names, so
  // scanning it reports the tool's own output as the estate's problem.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miftah-own-'));
  writeBaseline(path.join(dir, '.miftah-baseline.json'), createBaseline(scan));
  fs.writeFileSync(path.join(dir, 'miftah.sarif'), JSON.stringify(buildSarif(scan)));
  const rescan = scanTree(dir);
  assert.equal(rescan.findings.length, 0, 'Miftah reported its own artefacts as findings');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------------ sarif

test('SARIF is structurally valid and self consistent', () => {
  const sarif = buildSarif(scan);
  const check = validateSarif(sarif);
  assert.equal(check.valid, true, check.errors.join('; '));
  assert.equal(sarif.version, SARIF_VERSION);
  assert.equal(sarif.runs.length, 1);
  assert.equal(sarif.runs[0].tool.driver.name, 'Miftah');
});

test('every SARIF result points at a rule that is declared', () => {
  const run = buildSarif(scan).runs[0];
  const declared = new Set(run.tool.driver.rules.map((r) => r.id));
  assert.ok(run.results.length > 0);
  for (const result of run.results) {
    assert.ok(declared.has(result.ruleId), `${result.ruleId} used but never declared`);
  }
});

test('only rules that fired are declared', () => {
  const run = buildSarif(scan).runs[0];
  const fired = new Set(scan.findings.map((f) => f.rule));
  assert.equal(run.tool.driver.rules.length, fired.size);
});

test('severity survives the trip into SARIF', () => {
  // Results are emitted in finding order, so compare by index rather than by
  // rule and line, which collide across files.
  const run = buildSarif(scan).runs[0];
  const expected = { critical: 'error', high: 'error', medium: 'warning', low: 'note', info: 'note' };
  assert.equal(run.results.length, scan.findings.length);
  run.results.forEach((result, i) => {
    const finding = scan.findings[i];
    assert.equal(result.ruleId, finding.rule);
    assert.equal(result.level, expected[finding.severity], `${finding.rule} at ${finding.severity} became ${result.level}`);
  });
  // GitHub reads the numeric property rather than the level.
  for (const rule of run.tool.driver.rules) {
    assert.ok(Number(rule.properties['security-severity']) > 0, `${rule.id} has no security severity`);
  }
});

test('SARIF locations are one based, as the format requires', () => {
  for (const result of buildSarif(scan).runs[0].results) {
    const region = result.locations[0].physicalLocation.region;
    assert.ok(region.startLine >= 1, 'a zero line number would be rejected on upload');
    assert.ok(region.startColumn >= 1);
  }
});

test('a fingerprint travels into SARIF so alerts survive a refactor', () => {
  const baseline = createBaseline(scan);
  const copy = { findings: scan.findings.map((f) => ({ ...f })), target: scan.target };
  applyBaseline(copy, baseline);
  const run = buildSarif(copy).runs[0];
  assert.ok(run.results.every((r) => r.partialFingerprints?.miftahFindingV1));
});

test('the validator catches a malformed run', () => {
  const sarif = buildSarif(scan);
  sarif.runs[0].results[0].ruleId = 'MFT-NOT-A-RULE';
  sarif.runs[0].results[1].level = 'catastrophe';
  const check = validateSarif(sarif);
  assert.equal(check.valid, false);
  assert.ok(check.errors.length >= 2);
});

test('SARIF carries the context so a downgraded finding explains itself', () => {
  const test1 = scanText('self.assertTrue(is_weak_cipher("RC4"))', 'tests/test_a.py');
  const run = buildSarif({ findings: test1 }).runs[0];
  assert.ok(run.results[0].properties.context);
  assert.match(run.results[0].message.text, /test code/i);
});

// --------------------------------------------------------------------- ci

test('the shipped CI configurations record a baseline before gating', () => {
  // The gate is useless without this step, and the usual outcome of skipping it
  // is that somebody deletes the workflow.
  const dir = path.join(import.meta.dirname, '..', 'examples', 'ci');
  for (const file of ['github-actions.yml', 'gitlab-ci.yml', 'pre-commit.sh']) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.match(text, /miftah baseline/, `${file} never mentions recording a baseline`);
    assert.match(text, /--baseline/, `${file} gates without a baseline`);
  }
});

// --------------------------------------------------------- the start page

test('the getting started page is built from the real CI files', () => {
  // The page and the files people copy must not drift apart.
  const page = path.join(import.meta.dirname, '..', 'docs', 'start.html');
  if (!fs.existsSync(page)) return; // docs are generated; nothing to check yet
  const html = fs.readFileSync(page, 'utf8');
  const ciDir = path.join(import.meta.dirname, '..', 'examples', 'ci');

  for (const file of ['github-actions.yml', 'gitlab-ci.yml']) {
    const source = fs.readFileSync(path.join(ciDir, file), 'utf8');
    const marker = source.split('\n').find((l) => l.includes('--fail-on'));
    assert.ok(marker && html.includes(marker.trim().replace(/&/g, '&amp;')),
      `${file} and the page have drifted apart`);
  }

  assert.match(html, /miftah baseline/, 'the page never tells anyone to record a baseline');
  assert.ok(!/<script src=/.test(html), 'the page loads external script');
  for (const url of html.match(/https?:\/\/[^"'\s)]+/g) || []) {
    assert.ok(url.startsWith('https://github.com/SiteQ8'), `unexpected outbound link: ${url}`);
  }
});

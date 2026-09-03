import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scanTree, walk, MAX_FILES, MAX_DEPTH } from '../src/scan.js';
import { parseConfig, loadConfig, findConfig, resolveProfile, describeProfile } from '../src/config.js';
import { DEFAULT_PROFILE } from '../src/risk.js';

// --------------------------------------------------------------- truncation

test('a walk that stops early says so', () => {
  // It used to stop silently, which on a monorepo means reporting a clean scan
  // of the first twenty thousand files and saying nothing about the rest.
  const root = path.join(import.meta.dirname, '..');
  const capped = scanTree(root, { maxFiles: 5 });
  assert.equal(capped.truncated, true, 'a truncated scan did not admit it');
  assert.equal(capped.limits.fileLimit, 5);
  assert.equal(capped.filesFound, 5);

  const whole = scanTree(path.join(root, 'examples'));
  assert.equal(whole.truncated, false, 'a complete scan claimed to be truncated');
  assert.equal(whole.limits.fileLimit, null);
});

test('a walk that hits the depth limit says which directories it skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miftah-deep-'));
  let current = dir;
  for (let i = 0; i < 5; i += 1) {
    current = path.join(current, `level${i}`);
    fs.mkdirSync(current);
  }
  fs.writeFileSync(path.join(current, 'deep.js'), "crypto.createHash('md5')");

  const shallow = scanTree(dir, { maxDepth: 2 });
  assert.equal(shallow.truncated, true);
  assert.ok(shallow.limits.directoriesNotEntered > 0);
  assert.equal(shallow.findings.length, 0, 'the deep file should not have been reached');

  const full = scanTree(dir);
  assert.equal(full.truncated, false);
  assert.equal(full.findings.length, 1, 'the deep file should have been reached');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the limits are exported so a caller can reason about them', () => {
  assert.equal(typeof MAX_FILES, 'number');
  assert.equal(typeof MAX_DEPTH, 'number');
  const files = walk(path.join(import.meta.dirname, '..', 'examples'));
  assert.ok(Array.isArray(files));
  assert.ok(files.limits, 'the walk did not report its limits');
});

// ------------------------------------------------------------ configuration

test('a configuration file supplies the assumptions', () => {
  const config = parseConfig(JSON.stringify({
    profile: { shelfLife: 25, migrationYears: 7, crqcYear: 2035, exposure: 'internal' },
    failOn: 'high'
  }), '.miftahrc.json');

  assert.deepEqual(config.profile, { shelfLife: 25, migrationYears: 7, crqcYear: 2035, exposure: 'internal' });
  assert.equal(config.failOn, 'high');
  assert.deepEqual(config.errors, []);
});

test('a flag typed today beats a file written last year', () => {
  const config = parseConfig(JSON.stringify({ profile: { shelfLife: 25, crqcYear: 2035 } }), '.miftahrc.json');
  const resolved = resolveProfile(DEFAULT_PROFILE, config, { crqcYear: 2029 });

  assert.equal(resolved.profile.shelfLife, 25, 'the file should supply what no flag overrode');
  assert.equal(resolved.profile.crqcYear, 2029, 'the flag should win');
  assert.equal(resolved.from.shelfLife, '.miftahrc.json');
  assert.equal(resolved.from.crqcYear, 'command line');
  assert.equal(resolved.from.migrationYears, 'default');
});

test('the origin of every assumption is stated in words', () => {
  const defaults = describeProfile(resolveProfile(DEFAULT_PROFILE, null, {}));
  assert.match(defaults, /using defaults throughout/);

  const config = parseConfig(JSON.stringify({ profile: { shelfLife: 25 } }), '.miftahrc.json');
  const mixed = describeProfile(resolveProfile(DEFAULT_PROFILE, config, { crqcYear: 2029 }));
  assert.match(mixed, /\.miftahrc\.json and command line/);
  assert.match(mixed, /25 years of secrecy/);
});

test('a nonsense assumption is reported rather than used', () => {
  const config = parseConfig(JSON.stringify({
    profile: { shelfLife: -4, crqcYear: 1990, exposure: 'wishful' },
    failOn: 'catastrophic'
  }), '.miftahrc.json');

  assert.equal(config.profile.shelfLife, undefined, 'a negative shelf life was accepted');
  assert.equal(config.profile.crqcYear, undefined, 'a horizon in the past was accepted');
  assert.equal(config.profile.exposure, undefined, 'an unknown exposure was accepted');
  assert.equal(config.failOn, null);
  assert.equal(config.errors.length, 4, `expected four complaints, got ${config.errors.join('; ')}`);
});

test('a configuration file that will not parse is refused, not ignored', () => {
  // Falling back to defaults silently would score the estate against
  // assumptions nobody chose.
  assert.throws(() => parseConfig('{ not json', '.miftahrc.json'), /not valid JSON/);
});

test('the configuration file is found by any of its accepted names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miftah-cfg-'));
  assert.equal(findConfig(dir), null);

  fs.writeFileSync(path.join(dir, 'miftah.config.json'), JSON.stringify({ profile: { shelfLife: 12 } }));
  assert.match(findConfig(dir), /miftah\.config\.json$/);
  assert.equal(loadConfig(dir).profile.shelfLife, 12);

  // The dotfile takes precedence when both exist.
  fs.writeFileSync(path.join(dir, '.miftahrc.json'), JSON.stringify({ profile: { shelfLife: 30 } }));
  assert.equal(loadConfig(dir).profile.shelfLife, 30);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a bare profile at the top level is accepted too', () => {
  // Somebody will write the three numbers without nesting them, and refusing
  // that would be pedantry rather than validation.
  const config = parseConfig(JSON.stringify({ shelfLife: 20, exposure: 'partner' }), '.miftahrc');
  assert.equal(config.profile.shelfLife, 20);
  assert.equal(config.profile.exposure, 'partner');
});

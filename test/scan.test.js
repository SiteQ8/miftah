import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { scanText, scanTree, inventory, countBySeverity, isScannable } from '../src/scan.js';
import { lookup, gradeModulus, CLASSICAL, QUANTUM } from '../src/catalog.js';
import { RULES } from '../src/rules.js';

test('every rule has a unique id, a pattern, a severity and advice', () => {
  const seen = new Set();
  for (const rule of RULES) {
    assert.match(rule.id, /^MFT-[A-Z]\d{3}$/, `${rule.id} is not a well formed id`);
    assert.ok(!seen.has(rule.id), `${rule.id} is duplicated`);
    seen.add(rule.id);
    assert.ok(rule.pattern instanceof RegExp, `${rule.id} has no pattern`);
    assert.ok(['critical', 'high', 'medium', 'low', 'info'].includes(rule.severity), `${rule.id} has a bad severity`);
    assert.ok(rule.advice && rule.advice.length > 10, `${rule.id} has no useful advice`);
  }
});

test('every rule that names an algorithm names one the catalogue knows', () => {
  for (const rule of RULES) {
    if (!rule.algorithm) continue;
    assert.ok(lookup(rule.algorithm), `${rule.id} refers to unknown algorithm ${rule.algorithm}`);
  }
});

test('broken hashes are found', () => {
  const findings = scanText("crypto.createHash('md5')", 'a.js');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'MFT-H001');
  assert.equal(findings[0].severity, 'high');
});

test('SHA-1 is found under several spellings', () => {
  for (const source of ['hashlib.sha1(x)', 'SHA1WithRSA', 'hmac-sha1', 'sha-1']) {
    const findings = scanText(source, 'a.js').filter((f) => f.rule === 'MFT-H002');
    assert.equal(findings.length, 1, `missed SHA-1 in ${source}`);
  }
});

test('ML-DSA is not mistaken for DSA', () => {
  const findings = scanText("const suite = 'ML-DSA-65';", 'a.js');
  assert.equal(findings.filter((f) => f.rule === 'MFT-A005').length, 0, 'ML-DSA-65 flagged as DSA');
  assert.equal(findings.filter((f) => f.rule === 'MFT-P002').length, 1, 'ML-DSA-65 not recognised');
});

test('ECDSA is not mistaken for DSA', () => {
  const findings = scanText("sign('ecdsa', payload)", 'a.js');
  assert.equal(findings.filter((f) => f.rule === 'MFT-A005').length, 0);
  assert.equal(findings.filter((f) => f.rule === 'MFT-A002').length, 1);
});

test('3DES is found under both the library and the suite spelling', () => {
  assert.equal(scanText("createCipheriv('des-ede3-cbc', k, iv)", 'a.js').filter((f) => f.rule === 'MFT-C001').length, 1);
  assert.equal(scanText('ciphers: "DES-CBC3-SHA"', 'a.yaml').filter((f) => f.rule === 'MFT-C001').length, 1);
});

test('RSA modulus size changes the severity', () => {
  const weak = scanText('rsa.generate_private_key(key_size=1024)', 'a.py').find((f) => f.rule === 'MFT-A001');
  const sound = scanText('rsa.generate_private_key(key_size=4096)', 'a.py').find((f) => f.rule === 'MFT-A001');
  assert.equal(weak.severity, 'high');
  assert.equal(weak.bits, 1024);
  assert.equal(sound.severity, 'low');
  assert.equal(sound.bits, 4096);
});

test('a hard coded secret is caught but an environment reference is not', () => {
  const literal = scanText('const apiKey = "aVeryLongLookingSecretValue123";', 'a.js');
  assert.equal(literal.filter((f) => f.rule === 'MFT-K001').length, 1);

  const fromEnv = scanText('const apiKey = process.env.API_KEY;', 'a.js');
  assert.equal(fromEnv.filter((f) => f.rule === 'MFT-K001').length, 0);

  const placeholder = scanText('api_key: "${API_KEY_PLACEHOLDER}"', 'a.yaml');
  assert.equal(placeholder.filter((f) => f.rule === 'MFT-K001').length, 0);
});

test('a hard coded secret is redacted in the evidence', () => {
  const source = 'const signingKey = "abcdefghijklmnopqrstuvwxyz0123456789";';
  const finding = scanText(source, 'a.js').find((f) => f.rule === 'MFT-K001');
  assert.ok(finding);
  assert.ok(!finding.evidence.includes('abcdefghijklmnopqrstuvwxyz0123456789'), 'the secret leaked into the evidence');
  assert.ok(!finding.detail.includes('klmnopqrstuvwxyz'), 'the secret leaked into the detail');
});

test('weak randomness is only flagged in a cryptographic context', () => {
  assert.equal(scanText('const token = Math.random();', 'a.js').filter((f) => f.rule === 'MFT-K004').length, 1);
  assert.equal(scanText('const jitter = Math.random();', 'a.js').filter((f) => f.rule === 'MFT-K004').length, 0);
});

test('PBKDF2 iteration counts are graded, not merely detected', () => {
  const low = scanText('pbkdf2Sync(p, s, 10000, 32, "sha256")', 'a.js').find((f) => f.rule === 'MFT-K005');
  const good = scanText('pbkdf2Sync(p, s, 600000, 32, "sha256")', 'a.js').find((f) => f.rule === 'MFT-K005');
  assert.equal(low.severity, 'medium');
  assert.equal(good.severity, 'info');
  assert.match(good.title, /meets guidance/);
});

test('deprecated TLS versions are flagged but TLS 1.2 and 1.3 are not', () => {
  assert.equal(scanText('minimum_version: TLSv1.1', 'a.yaml').filter((f) => f.rule === 'MFT-T001').length, 1);
  assert.equal(scanText('ssl.PROTOCOL_TLSv1_2', 'a.py').filter((f) => f.rule === 'MFT-T001').length, 0);
  assert.equal(scanText("minVersion: 'TLSv1.3'", 'a.js').filter((f) => f.rule === 'MFT-T001').length, 0);
});

test('disabled certificate verification is caught across languages', () => {
  for (const source of ['requests.get(u, verify=False)', 'rejectUnauthorized: false', 'InsecureSkipVerify: true']) {
    assert.equal(scanText(source, 'a.txt').filter((f) => f.rule === 'MFT-T002').length, 1, `missed ${source}`);
  }
});

test('post quantum algorithms are recorded as informational, not as problems', () => {
  const findings = scanText("kex = ['X25519MLKEM768']; sig = 'ML-KEM-768';", 'a.js');
  const pq = findings.filter((f) => f.rule.startsWith('MFT-P'));
  assert.ok(pq.length >= 2);
  for (const finding of pq) {
    assert.equal(finding.severity, 'info');
    assert.equal(finding.quantum, QUANTUM.RESISTANT);
  }
});

test('the inventory holds cryptographic assets only', () => {
  const findings = scanText("requests.get(u, verify=False)\ncrypto.createHash('md5')", 'a.py');
  const assets = inventory(findings);
  assert.ok(assets.some((a) => a.name === 'MD5'));
  assert.ok(!assets.some((a) => a.id === 'unclassified'), 'a non cryptographic finding reached the inventory');
});

test('the inventory keeps the highest severity per asset', () => {
  const findings = scanText('rsa_keygen_bits = 1024\nrsa_keygen_bits = 4096', 'a.cnf');
  const assets = inventory(findings);
  const weak = assets.find((a) => a.id === 'RSA-1024');
  assert.equal(weak.severity, 'high');
});

test('the modulus grader matches NIST thresholds', () => {
  assert.equal(gradeModulus(512).classical, CLASSICAL.BROKEN);
  assert.equal(gradeModulus(1024).severity, 'high');
  assert.equal(gradeModulus(2048).classical, CLASSICAL.ACCEPTABLE);
  assert.equal(gradeModulus(4096).classical, CLASSICAL.STRONG);
});

test('only scannable files are opened', () => {
  assert.ok(isScannable('server.js'));
  assert.ok(isScannable('sshd_config'));
  assert.ok(isScannable('Dockerfile'));
  assert.ok(!isScannable('logo.png'));
  assert.ok(!isScannable('archive.tar.gz'));
});

test('scanning the sample estate finds the expected shape', () => {
  const root = path.join(import.meta.dirname, '..', 'examples', 'sample-estate');
  const scan = scanTree(root);
  assert.ok(scan.filesScanned >= 6, 'too few files read');
  assert.ok(scan.findings.length >= 30, 'too few findings');

  const counts = countBySeverity(scan.findings);
  assert.ok(counts.critical >= 1);
  assert.ok(counts.high >= 5);

  const names = scan.assets.map((a) => a.name);
  for (const expected of ['MD5', 'SHA-1', '3DES', 'RC4', 'ECDH', 'AES-256', 'ML-DSA-65', 'X25519MLKEM768']) {
    assert.ok(names.includes(expected), `expected ${expected} in the inventory`);
  }
});

test('binary and oversized files are skipped rather than parsed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miftah-'));
  fs.writeFileSync(path.join(dir, 'blob.json'), Buffer.from([0x7b, 0x00, 0x01, 0x7d]));
  fs.writeFileSync(path.join(dir, 'fine.js'), "createHash('md5')");
  const scan = scanTree(dir);
  assert.equal(scan.filesSkipped, 1);
  assert.equal(scan.filesScanned, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('excluded directories are never entered', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miftah-'));
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'bad.js'), "createHash('md5')");
  fs.writeFileSync(path.join(dir, 'good.js'), "createHash('sha256')");
  const scan = scanTree(dir);
  assert.equal(scan.filesScanned, 1);
  assert.equal(scan.findings.filter((f) => f.rule === 'MFT-H001').length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

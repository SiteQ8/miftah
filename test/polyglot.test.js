import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { scanText, scanTree } from '../src/scan.js';
import { RULES } from '../src/rules.js';

const ROOT = path.join(import.meta.dirname, '..', 'examples', 'polyglot');

function rulesFor(source, file) {
  return new Set(scanText(source, file).map((f) => f.rule));
}

// A scanner that silently reads nothing is worse than no scanner, because it
// retires the question. Each language is pinned in its own idiom rather than in
// the JavaScript spelling of the same algorithm.
test('Java is read in Java idioms', () => {
  const found = rulesFor(
    [
      'Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");',
      'Cipher legacy = Cipher.getInstance("DESede/CBC/PKCS5Padding");',
      'MessageDigest digest = MessageDigest.getInstance("MD5");',
      'MessageDigest old = MessageDigest.getInstance("SHA-1");'
    ].join('\n'),
    'Vault.java'
  );
  assert.ok(found.has('MFT-C006'), 'AES/ECB not caught');
  assert.ok(found.has('MFT-C001'), 'DESede not recognised as 3DES');
  assert.ok(found.has('MFT-H001'), 'MD5 not caught');
  assert.ok(found.has('MFT-H002'), 'SHA-1 not caught');
});

test('a Java key size on the following line still grades the key', () => {
  const [finding] = scanText(
    'KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");\ngenerator.initialize(1024);',
    'Vault.java'
  ).filter((f) => f.rule === 'MFT-A001');
  assert.ok(finding, 'RSA not caught');
  assert.match(finding.detail, /1024/, 'the key size one line down was not associated');
  assert.equal(finding.severity, 'high');
});

test('C# is read in C# idioms', () => {
  const found = rulesFor(
    [
      'var sha = new SHA1Managed();',
      'var provider = new TripleDESCryptoServiceProvider();',
      'provider.Mode = CipherMode.ECB;',
      'handler.ServerCertificateCustomValidationCallback = (m, cert, chain, errors) => true;'
    ].join('\n'),
    'Vault.cs'
  );
  assert.ok(found.has('MFT-H002'), 'SHA1Managed not caught');
  assert.ok(found.has('MFT-C001'), 'TripleDESCryptoServiceProvider not caught');
  assert.ok(found.has('MFT-C006'), 'CipherMode.ECB not caught');
  assert.ok(found.has('MFT-L002'), 'the obsolete provider was not flagged');
  assert.ok(found.has('MFT-L003'), 'a callback returning true was not flagged');
});

test('TripleDES is one asset, not two', () => {
  const found = rulesFor('var provider = new TripleDESCryptoServiceProvider();', 'a.cs');
  assert.ok(found.has('MFT-C001'));
  assert.ok(!found.has('MFT-C002'), 'TripleDES also matched the single DES rule');
});

test('Go is read in Go idioms', () => {
  const found = rulesFor(
    [
      'import (',
      '\t"crypto/des"',
      '\t"crypto/md5"',
      ')',
      'block, err := des.NewCipher(key)',
      'return &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS10}'
    ].join('\n'),
    'vault.go'
  );
  assert.ok(found.has('MFT-C002'), 'crypto/des not caught');
  assert.ok(found.has('MFT-H001'), 'crypto/md5 not caught');
  assert.ok(found.has('MFT-T002'), 'InsecureSkipVerify not caught');
  assert.ok(found.has('MFT-T001'), 'tls.VersionTLS10 not caught');
});

test('PHP is read in PHP idioms', () => {
  const found = rulesFor(
    [
      'return md5($data);',
      'return sha1($password);',
      'return mcrypt_encrypt(MCRYPT_3DES, $key, $data, MCRYPT_MODE_ECB);'
    ].join('\n'),
    'vault.php'
  );
  assert.ok(found.has('MFT-H001'));
  assert.ok(found.has('MFT-H002'));
  assert.ok(found.has('MFT-C001'), 'MCRYPT_3DES not caught');
  assert.ok(found.has('MFT-C006'), 'MCRYPT_MODE_ECB not caught');
  assert.ok(found.has('MFT-L001'), 'mcrypt itself not flagged');
});

test('Ruby and Swift are read in their own idioms', () => {
  const ruby = rulesFor(
    "OpenSSL::Digest::MD5.new\nOpenSSL::Cipher.new('DES-EDE3-CBC')",
    'vault.rb'
  );
  assert.ok(ruby.has('MFT-H001'));
  assert.ok(ruby.has('MFT-C001'));

  const swift = rulesFor(
    'CC_MD5(bytes, len, &digest)\nCCCrypt(op, UInt32(kCCAlgorithm3DES), UInt32(kCCOptionECBMode))',
    'Vault.swift'
  );
  assert.ok(swift.has('MFT-H001'), 'CC_MD5 not caught');
  assert.ok(swift.has('MFT-C001'), 'kCCAlgorithm3DES not caught');
  assert.ok(swift.has('MFT-C006'), 'kCCOptionECBMode not caught');
});

// Loosening the identifier boundaries is what made the above work, and it is
// also what could make the scanner cry wolf. These must stay silent.
test('ordinary words are not mistaken for algorithms', () => {
  const innocent = [
    "const DESIGN_TOKENS = require('./design');",
    'function describeDestination(d) { return d.description; }',
    'registry.destroy();',
    'const src4 = images[4];',
    "const source4k = 'video-4k';",
    "const cpu = 'amd5700x ryzen';",
    "const tripledesign = require('./tripledesign');",
    'const ecbService = new EcbRateService();',
    "crypto.createHash('sha256')",
    "crypto.createHash('sha512')"
  ];
  for (const line of innocent) {
    const noisy = scanText(line, 'app.js').filter((f) => f.severity !== 'info');
    assert.equal(noisy.length, 0, `false positive on: ${line} -> ${noisy.map((f) => f.rule).join(',')}`);
  }
});

test('weak randomness needs a cryptographic context', () => {
  const shuffle = scanText('const shuffled = items.sort(() => Math.random() - 0.5);', 'a.js');
  assert.equal(shuffle.filter((f) => f.rule === 'MFT-K004').length, 0, 'a shuffled list is not a key');

  const key = scanText('const sessionToken = Math.random().toString(36);', 'a.js');
  assert.equal(key.filter((f) => f.rule === 'MFT-K004').length, 1, 'camelCase context was missed');
});

test('the polyglot fixture is covered in every language', () => {
  const scan = scanTree(ROOT);
  const byFile = new Map();
  for (const finding of scan.findings) {
    const name = path.basename(finding.file);
    if (!byFile.has(name)) byFile.set(name, new Set());
    byFile.get(name).add(finding.rule);
  }
  for (const file of ['Vault.java', 'Vault.cs', 'vault.go', 'vault.php', 'vault.rb', 'Vault.swift']) {
    assert.ok(byFile.has(file), `${file} produced no findings at all`);
    assert.ok(byFile.get(file).size >= 2, `${file} produced only ${byFile.get(file).size} kind of finding`);
  }
});

test('every rule id is unique and every rule carries advice', () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(ids.length, new Set(ids).size, 'duplicate rule id');
  for (const rule of RULES) {
    assert.ok(rule.advice && rule.advice.length > 12, `${rule.id} has no useful advice`);
    assert.ok(rule.pattern instanceof RegExp, `${rule.id} has no pattern`);
  }
});

// ---------------------------------------------------------------------------
// Context. Scanning a portfolio of security tools showed the scanner could not
// tell using MD5 from naming it. A denylist of weak ciphers, a test asserting
// they are caught, and a fixture called vulnerable_config.env were all reported
// as vulnerabilities, which on a security codebase drowns everything real.
// ---------------------------------------------------------------------------

test('a denylist of weak algorithms is not a use of them', () => {
  const findings = scanText('_WEAK_CIPHER_TOKENS = ("RC4", "DES", "CBC3", "NULL", "EXPORT", "MD5")', 'grading.py');
  assert.ok(findings.length > 0, 'the algorithms should still be recorded');
  for (const finding of findings) {
    assert.equal(finding.context, 'catalogue', `${finding.rule} was not recognised as a list`);
    assert.ok(['low', 'info'].includes(finding.severity), `${finding.rule} kept severity ${finding.severity}`);
  }
});

test('a protocol table spread over several lines is still a table', () => {
  const findings = scanText(
    ['SUPPORTED = [', '    ("SSL 3.0", "SSLv3"),', '    ("TLS 1.0", "TLSv1"),', '    ("TLS 1.1", "TLSv1_1"),', ']'].join('\n'),
    'protocols.py'
  );
  assert.ok(findings.length >= 2);
  assert.ok(findings.every((f) => f.context === 'catalogue'), 'a multi line table was read as configuration');
});

test('remediation advice is not a vulnerability', () => {
  const [finding] = scanText('advice = "Remove RC4, 3DES, export and null ciphers from the config"', 'grading.py');
  assert.ok(finding);
  assert.equal(finding.context, 'catalogue');
});

test('a regex that detects key types is not a use of them', () => {
  const findings = scanText('PATTERN = re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY")', 'rules.py');
  assert.ok(findings.every((f) => f.context === 'catalogue' || f.materialType), 'a detector regex read as key usage');
});

test('a cipher list in configuration is configuration, not a catalogue', () => {
  // This is the inverse mistake and the more dangerous one. An OpenSSL cipher
  // string names many suites and is the most actionable line in the file.
  const findings = scanText('ciphers: "ECDHE-RSA-AES128-SHA:DES-CBC3-SHA:RC4-MD5"', 'config/app.yaml');
  assert.ok(findings.length >= 3);
  assert.ok(findings.every((f) => !f.context), 'live configuration was downgraded as a list');
  assert.ok(findings.some((f) => f.severity === 'critical'), 'the weakest suite lost its severity');
});

test('test code is downgraded but never dropped', () => {
  const [finding] = scanText('self.assertTrue(is_weak_cipher("ECDHE-RSA-RC4-SHA"))', 'tests/test_grading.py');
  assert.ok(finding, 'the finding was dropped rather than downgraded');
  assert.equal(finding.context, 'test');
  assert.equal(finding.originalSeverity, 'critical');
  assert.equal(finding.severity, 'low');
});

test('a file that names itself insecure is treated as a fixture', () => {
  const findings = scanText('password = "Zx9Kq2Lm4Np7Rt5Vw8Yb1Dc3Fg6Hj0Ks"', 'vulnerable_config.env');
  assert.ok(findings.length >= 1);
  assert.equal(findings[0].context, 'fixture');
});

test('example directories keep their full severity', () => {
  // People copy from examples into production far more readily than from tests.
  const [finding] = scanText("crypto.createHash('md5')", 'examples/demo/app.js');
  assert.ok(finding);
  assert.ok(!finding.context, 'example code was downgraded');
  assert.equal(finding.severity, 'high');
});

test('algorithms in prose are downgraded but key material is not', () => {
  const [mention] = scanText('We use MD5 for legacy resource IDs.', 'README.md');
  assert.equal(mention.context, 'documentation');

  const [secret] = scanText('API_SECRET = "Zx9Kq2Lm4Np7Rt5Vw8Yb1Dc3Fg6Hj0Ks"', 'README.md')
    .filter((f) => f.rule === 'MFT-K001');
  assert.ok(secret, 'a secret pasted into a README was not caught');
  assert.ok(!secret.context, 'a leaked key is a leaked key wherever it is written');
  assert.equal(secret.severity, 'critical');
});

test('lockfiles are not scanned', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miftah-lock-'));
  fs.writeFileSync(path.join(dir, 'package-lock.json'),
    JSON.stringify({ packages: { a: { integrity: 'sha512-' + 'A'.repeat(60) } } }));
  const scan = scanTree(dir);
  assert.equal(scan.findings.length, 0, 'lockfile integrity hashes were reported as findings');
  fs.rmSync(dir, { recursive: true, force: true });
});

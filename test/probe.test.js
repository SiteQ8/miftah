import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { parseEndpoint, classifySuite, classifyGroup, probe as probeTls } from '../src/tls.js';
import { probeSsh, parseKexInit, evaluate as evaluateSsh } from '../src/ssh.js';
import { describeCertificate, readCertificates, gradeSignature, gradePublicKey } from '../src/certs.js';

// --------------------------------------------------------------- endpoints

test('endpoints parse in every shape they are written', () => {
  assert.deepEqual(parseEndpoint('example.com:443'), { host: 'example.com', port: 443 });
  assert.deepEqual(parseEndpoint('example.com'), { host: 'example.com', port: 443 });
  assert.deepEqual(parseEndpoint('https://example.com/path'), { host: 'example.com', port: 443 });
  assert.deepEqual(parseEndpoint('[2001:db8::1]:8443'), { host: '2001:db8::1', port: 8443 });
  assert.deepEqual(parseEndpoint('host:22', 22), { host: 'host', port: 22 });
});

test('cipher suites are classified by what is actually wrong with them', () => {
  assert.equal(classifySuite('TLS_RSA_WITH_RC4_128_MD5').severity, 'critical');
  assert.equal(classifySuite('TLS_RSA_WITH_3DES_EDE_CBC_SHA').severity, 'high');
  assert.equal(classifySuite('TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256').quantum, 'broken');
  assert.equal(classifySuite('TLS_AES_256_GCM_SHA384').severity, 'info');
});

test('key exchange groups are classified by quantum exposure', () => {
  assert.equal(classifyGroup('ECDH X25519').quantum, 'broken');
  assert.equal(classifyGroup('ECDH X25519MLKEM768').quantum, 'resistant');
  assert.equal(classifyGroup(null).severity, 'low');
});

// --------------------------------------------------------------------- ssh

function nameList(items) {
  const body = Buffer.from(items.join(','), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

function kexInitPacket(lists) {
  const parts = [Buffer.from([20]), Buffer.alloc(16)];
  for (const list of lists) parts.push(nameList(list));
  parts.push(Buffer.from([0]), Buffer.alloc(4));
  const payload = Buffer.concat(parts);
  let padding = 8 - ((payload.length + 5) % 8);
  if (padding < 4) padding += 8;
  const packet = Buffer.alloc(4 + 1 + payload.length + padding);
  packet.writeUInt32BE(payload.length + padding + 1, 0);
  packet.writeUInt8(padding, 4);
  payload.copy(packet, 5);
  return packet;
}

const LEGACY_LISTS = [
  ['diffie-hellman-group14-sha1', 'curve25519-sha256'],
  ['ssh-rsa', 'ssh-ed25519'],
  ['aes128-cbc', 'aes256-gcm@openssh.com'], ['aes128-cbc', 'aes256-gcm@openssh.com'],
  ['hmac-sha1', 'hmac-sha2-256'], ['hmac-sha1', 'hmac-sha2-256'],
  ['none'], ['none'], [''], ['']
];

const MODERN_LISTS = [
  ['sntrup761x25519-sha512@openssh.com', 'curve25519-sha256'],
  ['ssh-ed25519', 'rsa-sha2-512'],
  ['aes256-gcm@openssh.com'], ['aes256-gcm@openssh.com'],
  ['hmac-sha2-512-etm@openssh.com'], ['hmac-sha2-512-etm@openssh.com'],
  ['none'], ['none'], [''], ['']
];

function fakeSshServer(lists, banner = 'SSH-2.0-TestServer_1.0') {
  const server = net.createServer((socket) => {
    socket.write(`${banner}\r\n`);
    socket.write(kexInitPacket(lists));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

test('the KEXINIT parser reads all ten name lists', () => {
  const packet = kexInitPacket(LEGACY_LISTS);
  const payload = packet.subarray(5, 4 + packet.readUInt32BE(0) - packet.readUInt8(4));
  const parsed = parseKexInit(payload);
  assert.ok(parsed);
  assert.deepEqual(parsed.kex, LEGACY_LISTS[0]);
  assert.deepEqual(parsed.hostKey, LEGACY_LISTS[1]);
  assert.deepEqual(parsed.macServerToClient, LEGACY_LISTS[5]);
});

test('the KEXINIT parser rejects anything that is not a KEXINIT', () => {
  assert.equal(parseKexInit(Buffer.from([21, 0, 0])), null);
  assert.equal(parseKexInit(Buffer.alloc(0)), null);
  assert.equal(parseKexInit(null), null);
});

test('a legacy SSH server is reported as weak on every axis', async () => {
  const { server, port } = await fakeSshServer(LEGACY_LISTS);
  const result = await probeSsh(`127.0.0.1:${port}`, { timeout: 3000 });
  server.close();

  assert.equal(result.reachable, true);
  assert.equal(result.banner, 'SSH-2.0-TestServer_1.0');
  const rules = result.findings.map((f) => f.rule);
  assert.ok(rules.includes('MFT-S010'), 'SHA-1 key exchange not reported');
  assert.ok(rules.includes('MFT-S011'), 'ssh-rsa host key not reported');
  assert.ok(rules.includes('MFT-S012'), 'CBC cipher not reported');
  assert.ok(rules.includes('MFT-S013'), 'weak MAC not reported');
  assert.ok(rules.includes('MFT-S014'), 'missing post quantum key exchange not reported');
});

test('a modern SSH server is reported as post quantum ready', async () => {
  const { server, port } = await fakeSshServer(MODERN_LISTS);
  const result = await probeSsh(`127.0.0.1:${port}`, { timeout: 3000 });
  server.close();

  const rules = result.findings.map((f) => f.rule);
  assert.ok(rules.includes('MFT-S015'), 'post quantum key exchange not recognised');
  assert.ok(!rules.includes('MFT-S014'));
  assert.ok(!rules.includes('MFT-S010'));
  assert.deepEqual(result.postQuantumKex, ['sntrup761x25519-sha512@openssh.com']);
});

test('an unreachable SSH endpoint fails without throwing', async () => {
  const result = await probeSsh('127.0.0.1:1', { timeout: 1500 });
  assert.equal(result.reachable, false);
  assert.ok(result.error);
  assert.deepEqual(result.findings, []);
});

test('the SSH evaluator is pure and testable without a socket', () => {
  const result = evaluateSsh(
    { kex: ['diffie-hellman-group1-sha1'], hostKey: ['ssh-dss'], cipherServerToClient: ['3des-cbc'], cipherClientToServer: [], macServerToClient: ['hmac-md5'], macClientToServer: [] },
    'host:22',
    'SSH-2.0-x'
  );
  assert.ok(result.findings.length >= 4);
  assert.deepEqual(result.weakKex, ['diffie-hellman-group1-sha1']);
  assert.deepEqual(result.weakHostKey, ['ssh-dss']);
});

// ------------------------------------------------------------ certificates

function makeCert(dir, args) {
  const keyPath = path.join(dir, `${args.name}.key`);
  const certPath = path.join(dir, `${args.name}.pem`);
  execFileSync('openssl', [
    'req', '-x509', '-nodes',
    '-newkey', args.newkey,
    '-keyout', keyPath,
    '-out', certPath,
    '-days', String(args.days),
    '-subj', `/CN=${args.name}.test`,
    ...(args.pkeyopt ? ['-pkeyopt', args.pkeyopt] : []),
    ...(args.digest ? ['-' + args.digest] : [])
  ], { stdio: 'ignore' });
  return certPath;
}

const CERT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'miftah-certs-'));

test('a SHA-256 RSA-4096 certificate is graded sound but quantum exposed', () => {
  const file = makeCert(CERT_DIR, { name: 'strong', newkey: 'rsa:4096', days: 365, digest: 'sha256' });
  const [cert] = readCertificates(file);
  const described = describeCertificate(cert, 'strong.pem');
  assert.equal(described.signatureAlgorithm, 'sha256WithRSAEncryption');
  assert.equal(described.publicKey.name, 'RSA-4096');
  assert.equal(described.publicKey.classical, 'strong');
  assert.equal(described.quantum, 'broken');
  assert.ok(described.daysLeft > 300);
});

test('a SHA-1 signed certificate is graded broken', () => {
  const file = makeCert(CERT_DIR, { name: 'sha1', newkey: 'rsa:2048', days: 365, digest: 'sha1' });
  const [cert] = readCertificates(file);
  const described = describeCertificate(cert, 'sha1.pem');
  assert.equal(described.signatureAlgorithm, 'sha1WithRSAEncryption');
  assert.equal(described.signature.classical, 'broken');
  assert.equal(described.severity, 'high');
});

test('an undersized RSA certificate is graded on the modulus', () => {
  const file = makeCert(CERT_DIR, { name: 'small', newkey: 'rsa:1024', days: 365, digest: 'sha256' });
  const [cert] = readCertificates(file);
  const described = describeCertificate(cert, 'small.pem');
  assert.equal(described.publicKey.name, 'RSA-1024');
  assert.equal(described.publicKey.severity, 'high');
});

test('an elliptic curve certificate is recognised with its curve', () => {
  const file = makeCert(CERT_DIR, { name: 'ec', newkey: 'ec', pkeyopt: 'ec_paramgen_curve:prime256v1', days: 365, digest: 'sha256' });
  const [cert] = readCertificates(file);
  const described = describeCertificate(cert, 'ec.pem');
  assert.equal(described.publicKey.algorithm, 'ECDSA');
  assert.equal(described.publicKey.curve, 'prime256v1');
  assert.equal(described.signatureAlgorithm, 'ecdsa-with-SHA256');
  assert.equal(described.quantum, 'broken');
});

test('an expiring certificate raises the severity on its own', () => {
  const file = makeCert(CERT_DIR, { name: 'soon', newkey: 'rsa:2048', days: 10, digest: 'sha256' });
  const [cert] = readCertificates(file);
  const described = describeCertificate(cert, 'soon.pem');
  assert.ok(described.daysLeft <= 10);
  assert.equal(described.expirySeverity, 'high');
});

test('a certificate that will not parse is reported rather than thrown', () => {
  const file = path.join(CERT_DIR, 'garbage.pem');
  fs.writeFileSync(file, 'not a certificate at all');
  const [cert] = readCertificates(file);
  assert.ok(cert.parseError);
  assert.ok(describeCertificate(cert, 'garbage.pem').error);
});

test('signature and key graders cover the algorithms the catalogue names', () => {
  assert.equal(gradeSignature('md5WithRSAEncryption').severity, 'critical');
  assert.equal(gradeSignature('ML-DSA-65').quantum, 'resistant');
  assert.equal(gradePublicKey(null).name, 'unknown');
});

// --------------------------------------------------------------------- tls

test('a local TLS server is probed end to end', async () => {
  const keyPath = path.join(CERT_DIR, 'server.key');
  const certPath = path.join(CERT_DIR, 'server.pem');
  execFileSync('openssl', [
    'req', '-x509', '-nodes', '-newkey', 'rsa:2048',
    '-keyout', keyPath, '-out', certPath, '-days', '30',
    '-subj', '/CN=localhost', '-sha256'
  ], { stdio: 'ignore' });

  const server = tls.createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), minVersion: 'TLSv1.2' },
    (socket) => socket.end()
  );
  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

  const result = await probeTls(`127.0.0.1:${port}`, { timeout: 4000, servername: 'localhost' });
  server.close();

  assert.equal(result.reachable, true);
  assert.ok(result.supportedVersions.includes('TLSv1.2'));
  assert.ok(!result.supportedVersions.includes('TLSv1'), 'the server floor was not respected');
  assert.ok(result.negotiated.cipher);
  assert.ok(result.chain.length >= 1);
  assert.equal(result.chain[0].signatureAlgorithm, 'sha256WithRSAEncryption');
  assert.ok(result.findings.some((f) => f.rule === 'MFT-T012'), 'the key exchange group was not judged');
});

test('an unreachable TLS endpoint fails without throwing', async () => {
  const result = await probeTls('127.0.0.1:1', { timeout: 1500 });
  assert.equal(result.reachable, false);
  assert.equal(result.negotiated, null);
  assert.deepEqual(result.findings, []);
});

test.after(() => {
  fs.rmSync(CERT_DIR, { recursive: true, force: true });
});

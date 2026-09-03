import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';

import { scanTree, scanText } from '../src/scan.js';
import { diffScans, summariseDiff } from '../src/diff.js';
import { probeSsh } from '../src/ssh.js';

const ROOT = path.join(import.meta.dirname, '..', 'examples', 'sample-estate');
const scan = scanTree(ROOT);
const PROFILE = { shelfLife: 10, migrationYears: 5, crqcYear: 2033 };

// -------------------------------------------------------------------- diff

test('a diff separates what was fixed from what arrived', () => {
  const before = { startedAt: '2026-01-01T00:00:00.000Z', findings: scan.findings, assets: scan.assets, target: 'x' };
  const after = {
    startedAt: '2026-07-01T00:00:00.000Z',
    findings: [...scan.findings.slice(2), ...scanText("crypto.createHash('md5')", 'src/brand-new.js')],
    assets: scan.assets,
    target: 'x'
  };

  const result = diffScans(before, after, { profile: PROFILE });
  assert.equal(result.findings.resolved.length, 2);
  assert.equal(result.findings.introduced.length, 1);
  assert.match(result.findings.introduced[0].file, /brand-new/);
});

test('an estate left completely alone is still worse than it was', () => {
  // The horizon is a fixed year, so standing still moves you toward it. A
  // report that lists only changed files can never say this.
  const same = { findings: scan.findings, assets: scan.assets, target: 'x' };
  const result = diffScans(
    { ...same, startedAt: '2026-01-01T00:00:00.000Z' },
    { ...same, startedAt: '2027-01-01T00:00:00.000Z' },
    { profile: PROFILE }
  );

  assert.equal(result.findings.introduced.length, 0);
  assert.equal(result.findings.resolved.length, 0);
  assert.ok(result.horizon.marginLost >= 0.9, `only ${result.horizon.marginLost} years recorded as lost`);
  assert.ok(result.horizon.deficitAfter > result.horizon.deficitBefore);
  assert.match(summariseDiff(result), /margin lost to time alone/);
});

test('a diff calls a regression a regression', () => {
  const base = { startedAt: '2026-01-01T00:00:00.000Z', findings: [], assets: [], target: 'x' };

  const quiet = diffScans(base, { ...base, startedAt: '2026-01-02T00:00:00.000Z' }, { profile: PROFILE });
  assert.equal(quiet.regressed, false, 'an unchanged estate was called a regression');

  const worse = diffScans(base, {
    ...base,
    startedAt: '2026-01-02T00:00:00.000Z',
    findings: scanText("crypto.createHash('md5')", 'a.js')
  }, { profile: PROFILE });
  assert.equal(worse.regressed, true, 'a new high severity finding was not called a regression');
});

test('a diff of two identical scans reports nothing moved', () => {
  const result = diffScans(scan, scan, { profile: PROFILE });
  assert.equal(result.findings.introduced.length, 0);
  assert.equal(result.findings.resolved.length, 0);
  assert.equal(result.readiness.change, 0);
  assert.deepEqual(result.assets.worse, []);
  assert.deepEqual(result.assets.better, []);
});

test('a diff tracks an asset getting worse rather than only appearing', () => {
  const before = {
    startedAt: '2026-01-01T00:00:00.000Z',
    findings: [],
    assets: [{ id: 'RSA', name: 'RSA', severity: 'medium', quantum: 'broken', classical: 'acceptable', occurrences: [] }]
  };
  const after = {
    startedAt: '2026-02-01T00:00:00.000Z',
    findings: [],
    assets: [{ id: 'RSA', name: 'RSA', severity: 'critical', quantum: 'broken', classical: 'broken', occurrences: [] }]
  };

  const result = diffScans(before, after, { profile: PROFILE });
  assert.equal(result.assets.worse.length, 1);
  assert.deepEqual(result.assets.worse[0], { id: 'RSA', name: 'RSA', from: 'medium', to: 'critical' });
  assert.equal(result.regressed, true);

  const back = diffScans(after, before, { profile: PROFILE });
  assert.equal(back.assets.better.length, 1);
});

test('a diff summary reads as one sentence', () => {
  const result = diffScans(
    { startedAt: '2026-01-01T00:00:00.000Z', findings: scan.findings, assets: scan.assets },
    { startedAt: '2026-04-01T00:00:00.000Z', findings: scan.findings.slice(1), assets: scan.assets },
    { profile: PROFILE }
  );
  const text = summariseDiff(result);
  assert.match(text, /Readiness/);
  assert.match(text, /1 finding fixed/, 'the singular case was not handled');
  assert.ok(text.endsWith('.'));
});

// --------------------------------------------------------------------- ssh

function sshStub(lists, banner = 'SSH-2.0-Legacy_1.0') {
  const nameList = (items) => {
    const body = Buffer.from(items.join(','), 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(body.length, 0);
    return Buffer.concat([header, body]);
  };
  const kexInit = () => {
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
  };

  const server = net.createServer((socket) => {
    socket.write(`${banner}\r\n`);
    socket.write(kexInit());
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const LEGACY = [
  ['diffie-hellman-group14-sha1'], ['ssh-rsa'], ['aes128-cbc'], ['aes128-cbc'],
  ['hmac-sha1'], ['hmac-sha1'], ['none'], ['none'], [''], ['']
];

test('an SSH probe reports weakness and a missing post quantum key exchange', async () => {
  const { server, port } = await sshStub(LEGACY);
  const result = await probeSsh(`127.0.0.1:${port}`, { timeout: 4000 });
  server.close();

  assert.equal(result.reachable, true);
  assert.equal(result.banner, 'SSH-2.0-Legacy_1.0');
  const rules = result.findings.map((f) => f.rule);
  assert.ok(rules.includes('MFT-S010'), 'SHA-1 key exchange not reported');
  assert.ok(rules.includes('MFT-S014'), 'a server offering no post quantum key exchange was not flagged');
});

test('SSH findings join the same list as everything else', async () => {
  // They used to be stranded in their own command, so a scan could probe TLS
  // and never SSH, and one report could not cover both.
  const { server, port } = await sshStub(LEGACY);
  const result = await probeSsh(`127.0.0.1:${port}`, { timeout: 4000 });
  server.close();

  const merged = { findings: [...scan.findings, ...result.findings], assets: scan.assets };
  const sshFindings = merged.findings.filter((f) => f.rule.startsWith('MFT-S'));
  assert.ok(sshFindings.length >= 4);
  for (const finding of sshFindings) {
    assert.ok(finding.severity, `${finding.rule} carries no severity`);
    assert.ok(finding.advice && finding.advice.length > 12, `${finding.rule} carries no advice`);
  }
});

// TLS prober.
// Opens one connection per protocol version to find out what an endpoint will
// actually agree to, then reports the negotiated suite, the key exchange group
// and the certificate chain.

import tls from 'node:tls';
import { describeCertificate } from './certs.js';
import { CLASSICAL, QUANTUM } from './catalog.js';

const VERSIONS = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];

const VERSION_VERDICT = {
  TLSv1: { severity: 'critical', classical: CLASSICAL.BROKEN, advice: 'TLS 1.0 is deprecated by RFC 8996. Turn it off.' },
  'TLSv1.1': { severity: 'critical', classical: CLASSICAL.BROKEN, advice: 'TLS 1.1 is deprecated by RFC 8996. Turn it off.' },
  'TLSv1.2': { severity: 'low', classical: CLASSICAL.ACCEPTABLE, advice: 'Acceptable floor. Prefer 1.3 where the peer supports it.' },
  'TLSv1.3': { severity: 'info', classical: CLASSICAL.STRONG, advice: 'Current. Add a hybrid key exchange group next.' }
};

export function parseEndpoint(input, defaultPort = 443) {
  const text = String(input).replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  const bracket = text.match(/^\[(.+)\]:(\d+)$/);
  if (bracket) return { host: bracket[1], port: Number(bracket[2]) };
  const parts = text.split(':');
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    return { host: parts[0], port: Number(parts[1]) };
  }
  return { host: text, port: defaultPort };
}

function connectOnce({ host, port, version, timeout, servername }) {
  return new Promise((resolve) => {
    const options = {
      host,
      port,
      servername: servername || host,
      rejectUnauthorized: false,
      minVersion: version,
      maxVersion: version
    };
    // OpenSSL refuses the old versions at the default security level, so drop
    // it for the legacy probes only.
    if (version === 'TLSv1' || version === 'TLSv1.1') {
      options.ciphers = 'ALL:@SECLEVEL=0';
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // already gone
      }
      resolve(value);
    };

    const socket = tls.connect(options, () => {
      const cipher = socket.getCipher() || {};
      let group = null;
      try {
        const info = socket.getEphemeralKeyInfo();
        if (info && info.type) {
          group = info.name ? `${info.type} ${info.name}` : `${info.type} ${info.size || ''}`.trim();
        }
      } catch {
        group = null;
      }

      const chain = [];
      try {
        let peer = socket.getPeerX509Certificate();
        let depth = 0;
        while (peer && depth < 8) {
          chain.push(describeCertificate(peer, `${host}:${port} depth ${depth}`));
          peer = peer.issuerCertificate && peer.issuerCertificate !== peer ? peer.issuerCertificate : null;
          depth += 1;
        }
      } catch {
        // chain unavailable
      }

      finish({
        version,
        supported: true,
        cipher: cipher.standardName || cipher.name || null,
        cipherVersion: cipher.version || null,
        group,
        authorized: socket.authorized,
        authorizationError: socket.authorized ? null : String(socket.authorizationError || ''),
        alpn: socket.alpnProtocol || null,
        chain
      });
    });

    socket.setTimeout(timeout, () => finish({ version, supported: false, error: 'timeout' }));
    socket.on('error', (error) => finish({ version, supported: false, error: error.code || error.message }));
  });
}

export function classifySuite(name) {
  if (!name) return { severity: 'low', quantum: QUANTUM.UNKNOWN, notes: [] };
  const upper = name.toUpperCase();
  const notes = [];
  let severity = 'info';
  let quantum = QUANTUM.RESISTANT;

  if (/NULL|EXPORT|ANON|_ADH_|_AECDH_/.test(upper)) {
    notes.push('No confidentiality or no authentication.');
    severity = 'critical';
  }
  if (/RC4/.test(upper)) {
    notes.push('RC4 keystream bias.');
    severity = 'critical';
  }
  if (/3DES|DES_CBC/.test(upper)) {
    notes.push('64 bit block, exposed to Sweet32.');
    severity = 'high';
  }
  if (/_CBC_/.test(upper)) {
    notes.push('CBC construction. Prefer an AEAD suite.');
    if (severity === 'info') severity = 'medium';
  }
  if (/_MD5|_SHA(?![0-9])/.test(upper)) {
    notes.push('Legacy MAC digest.');
    if (severity === 'info' || severity === 'medium') severity = 'high';
  }
  if (/AES_128/.test(upper)) {
    notes.push('AES-128 leaves about 64 bits against Grover.');
    quantum = QUANTUM.WEAKENED;
    if (severity === 'info') severity = 'low';
  }
  if (/ECDHE|DHE|_DH_/.test(upper) && !/MLKEM|KYBER/.test(upper)) {
    notes.push('Classical key agreement. Session keys captured today are readable once Shor runs.');
    quantum = QUANTUM.BROKEN;
    if (severity === 'info' || severity === 'low') severity = 'medium';
  }
  if (/MLKEM|KYBER/.test(upper)) {
    notes.push('Post quantum key establishment in the suite.');
    quantum = QUANTUM.RESISTANT;
  }

  return { severity, quantum, notes };
}

export function classifyGroup(group) {
  if (!group) return { severity: 'low', quantum: QUANTUM.UNKNOWN, note: 'Key exchange group not reported.' };
  const upper = group.toUpperCase();
  if (/MLKEM|KYBER/.test(upper)) {
    return { severity: 'info', quantum: QUANTUM.RESISTANT, note: 'Hybrid post quantum group. This is the destination.' };
  }
  if (/X25519|P-?256|P-?384|P-?521|SECP|ECDH/.test(upper)) {
    return {
      severity: 'high',
      quantum: QUANTUM.BROKEN,
      note: 'Classical group. Any recorded session is decryptable once a quantum computer of the right size exists.'
    };
  }
  if (/^DH/.test(upper)) {
    return { severity: 'high', quantum: QUANTUM.BROKEN, note: 'Finite field group. Same exposure, slower handshake.' };
  }
  return { severity: 'medium', quantum: QUANTUM.UNKNOWN, note: 'Group not recognised.' };
}

export async function probe(endpoint, options = {}) {
  const { host, port } = parseEndpoint(endpoint, options.defaultPort || 443);
  const timeout = options.timeout || 7000;
  const started = Date.now();

  const results = [];
  for (const version of VERSIONS) {
    results.push(await connectOnce({ host, port, version, timeout, servername: options.servername }));
  }

  const supported = results.filter((r) => r.supported);
  const best = supported[supported.length - 1] || null;
  const findings = [];

  for (const result of results) {
    if (!result.supported) continue;
    const verdict = VERSION_VERDICT[result.version];
    findings.push({
      rule: 'MFT-T010',
      title: `${result.version} accepted`,
      severity: verdict.severity,
      classical: verdict.classical,
      quantum: QUANTUM.UNKNOWN,
      protocol: 'tls',
      advice: verdict.advice,
      file: `${host}:${port}`,
      line: 0,
      detail: result.cipher || ''
    });

    const suite = classifySuite(result.cipher);
    if (result.cipher && suite.severity !== 'info') {
      findings.push({
        rule: 'MFT-T011',
        title: `Cipher suite ${result.cipher}`,
        severity: suite.severity,
        classical: suite.severity === 'critical' ? CLASSICAL.BROKEN : CLASSICAL.ACCEPTABLE,
        quantum: suite.quantum,
        protocol: 'tls',
        advice: suite.notes.join(' '),
        file: `${host}:${port}`,
        line: 0,
        detail: result.version
      });
    }

    const group = classifyGroup(result.group);
    if (result.group && group.severity !== 'info') {
      findings.push({
        rule: 'MFT-T012',
        title: `Key exchange group ${result.group}`,
        severity: group.severity,
        classical: CLASSICAL.STRONG,
        quantum: group.quantum,
        protocol: 'tls',
        advice: group.note,
        file: `${host}:${port}`,
        line: 0,
        detail: result.version
      });
    }
  }

  const chain = best ? best.chain : [];
  for (const cert of chain) {
    if (!cert || cert.error) continue;
    if (cert.severity === 'critical' || cert.severity === 'high' || cert.severity === 'medium') {
      findings.push({
        rule: 'MFT-X001',
        title: `Certificate ${cert.publicKey ? cert.publicKey.name : 'unknown'} signed with ${cert.signatureAlgorithm}`,
        severity: cert.severity,
        classical: cert.signature ? cert.signature.classical : CLASSICAL.ACCEPTABLE,
        quantum: cert.quantum,
        advice: `${cert.signature ? cert.signature.advice : ''} ${cert.publicKey ? cert.publicKey.advice : ''}`.trim(),
        file: `${host}:${port}`,
        line: 0,
        detail: `expires in ${cert.daysLeft} days`
      });
    }
  }

  return {
    endpoint: `${host}:${port}`,
    host,
    port,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    versions: results,
    findings: dedupe(findings),
    supportedVersions: supported.map((r) => r.version),
    negotiated: best
      ? { version: best.version, cipher: best.cipher, group: best.group, alpn: best.alpn }
      : null,
    reachable: supported.length > 0,
    chain
  };
}

// The same suite or group is reported once per protocol version. That is three
// copies of one fact, so collapse them and note which versions carried it.
export function dedupe(findings) {
  const merged = new Map();
  for (const finding of findings) {
    const key = `${finding.rule}|${finding.title}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, Object.assign({}, finding));
      continue;
    }
    const versions = new Set(String(existing.detail || '').split(', ').filter(Boolean));
    if (finding.detail) versions.add(finding.detail);
    existing.detail = [...versions].join(', ');
  }
  return [...merged.values()];
}

export default probe;

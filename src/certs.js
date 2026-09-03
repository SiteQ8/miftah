// Certificate reader.
// Takes PEM or DER, pulls out the signature algorithm, the public key, the
// validity window, and grades all three.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { CLASSICAL, QUANTUM, gradeModulus } from './catalog.js';

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

export function readCertificates(file) {
  const raw = fs.readFileSync(file);
  const text = raw.toString('latin1');
  const blocks = text.match(PEM_BLOCK);
  const certs = [];

  if (blocks) {
    for (const block of blocks) {
      try {
        certs.push(new crypto.X509Certificate(block));
      } catch (error) {
        certs.push({ parseError: error.message });
      }
    }
    return certs;
  }

  try {
    certs.push(new crypto.X509Certificate(raw));
  } catch (error) {
    certs.push({ parseError: error.message });
  }
  return certs;
}

// Node does not surface the signature algorithm on X509Certificate, so read it
// out of the DER. Every signature OID is searched for as a complete encoded
// object identifier, which is specific enough to avoid a chance byte match.
const SIGNATURE_OIDS = [
  ['md5WithRSAEncryption', '2a864886f70d010104'],
  ['sha1WithRSAEncryption', '2a864886f70d010105'],
  ['sha256WithRSAEncryption', '2a864886f70d01010b'],
  ['sha384WithRSAEncryption', '2a864886f70d01010c'],
  ['sha512WithRSAEncryption', '2a864886f70d01010d'],
  ['RSASSA-PSS', '2a864886f70d01010a'],
  ['ecdsa-with-SHA1', '2a8648ce3d0401'],
  ['ecdsa-with-SHA256', '2a8648ce3d040302'],
  ['ecdsa-with-SHA384', '2a8648ce3d040303'],
  ['ecdsa-with-SHA512', '2a8648ce3d040304'],
  ['Ed25519', '2b6570'],
  ['Ed448', '2b6571'],
  ['dsa-with-SHA1', '2a8648ce380403'],
  ['dsa-with-SHA256', '608648016503040302'],
  ['ML-DSA-44', '608648016503040311'],
  ['ML-DSA-65', '608648016503040312'],
  ['ML-DSA-87', '608648016503040313'],
  ['SLH-DSA', '608648016503040314']
];

function encodedOid(hex) {
  const length = hex.length / 2;
  return `06${length.toString(16).padStart(2, '0')}${hex}`;
}

function signatureAlgorithm(cert) {
  const legacy = typeof cert.toLegacyObject === 'function' ? cert.toLegacyObject() : null;
  if (legacy && legacy.sigalg) return legacy.sigalg;
  if (!cert.raw) return 'unknown';

  const der = Buffer.from(cert.raw).toString('hex');
  // Longest OIDs first, so ecdsa-with-SHA256 wins over the ecdsa-with-SHA1 prefix.
  const ordered = [...SIGNATURE_OIDS].sort((a, b) => b[1].length - a[1].length);
  for (const [name, oid] of ordered) {
    if (der.includes(encodedOid(oid))) return name;
  }
  return 'unknown';
}

export function gradeSignature(name) {
  const lower = String(name).toLowerCase();
  if (/md5|md2|md4/.test(lower)) {
    return {
      classical: CLASSICAL.BROKEN,
      quantum: QUANTUM.BROKEN,
      severity: 'critical',
      advice: 'An MD5 signed certificate can be forged. Reissue immediately.'
    };
  }
  if (/sha1|sha-1/.test(lower)) {
    return {
      classical: CLASSICAL.BROKEN,
      quantum: QUANTUM.BROKEN,
      severity: 'high',
      advice: 'Reissue with SHA-256 or SHA-384.'
    };
  }
  if (/sha256|sha-256/.test(lower)) {
    return {
      classical: CLASSICAL.STRONG,
      quantum: QUANTUM.BROKEN,
      severity: 'medium',
      advice: 'The digest is sound. The signature scheme underneath is not quantum safe.'
    };
  }
  if (/sha384|sha512|sha-384|sha-512/.test(lower)) {
    return {
      classical: CLASSICAL.STRONG,
      quantum: QUANTUM.BROKEN,
      severity: 'medium',
      advice: 'The digest is sound. Plan the move to ML-DSA-65.'
    };
  }
  if (/dilithium|ml-dsa|slh-dsa|sphincs|falcon|fn-dsa/.test(lower)) {
    return {
      classical: CLASSICAL.STRONG,
      quantum: QUANTUM.RESISTANT,
      severity: 'info',
      advice: 'Post quantum signature. No action.'
    };
  }
  return {
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.UNKNOWN,
    severity: 'low',
    advice: 'Signature algorithm not recognised. Confirm it by hand.'
  };
}

export function gradePublicKey(publicKey) {
  if (!publicKey) return { name: 'unknown', severity: 'low', quantum: QUANTUM.UNKNOWN };
  const details = publicKey.asymmetricKeyDetails || {};
  const type = publicKey.asymmetricKeyType;

  if (type === 'rsa' || type === 'rsa-pss') {
    const bits = details.modulusLength || 0;
    const grade = gradeModulus(bits);
    return {
      name: `RSA-${bits}`,
      algorithm: 'RSA',
      bits,
      classical: grade.classical,
      quantum: QUANTUM.BROKEN,
      severity: bits < 2048 ? grade.severity : 'medium',
      advice: bits < 2048
        ? 'Below the 2048 bit floor. Reissue now, then plan the move to ML-DSA-65.'
        : 'Classically sound. Shor recovers this key once a quantum computer of the right size exists.'
    };
  }

  if (type === 'ec') {
    const curve = details.namedCurve || 'unknown';
    const weak = /192|224/.test(curve);
    return {
      name: `EC ${curve}`,
      algorithm: 'ECDSA',
      curve,
      classical: weak ? CLASSICAL.WEAK : CLASSICAL.STRONG,
      quantum: QUANTUM.BROKEN,
      severity: weak ? 'high' : 'medium',
      advice: weak
        ? 'The curve is under strength. Move to secp384r1, then to ML-DSA-65.'
        : 'Classically sound, quantum exposed. Plan the move to ML-DSA-65.'
    };
  }

  if (type === 'ed25519' || type === 'ed448') {
    return {
      name: type === 'ed25519' ? 'Ed25519' : 'Ed448',
      algorithm: type === 'ed25519' ? 'ED25519' : 'ED448',
      classical: CLASSICAL.STRONG,
      quantum: QUANTUM.BROKEN,
      severity: 'medium',
      advice: 'Classically sound, quantum exposed. Plan the move to ML-DSA-65.'
    };
  }

  if (type === 'dsa') {
    return {
      name: 'DSA',
      algorithm: 'DSA',
      classical: CLASSICAL.LEGACY,
      quantum: QUANTUM.BROKEN,
      severity: 'high',
      advice: 'Withdrawn for new signatures. Reissue.'
    };
  }

  return { name: type || 'unknown', severity: 'low', quantum: QUANTUM.UNKNOWN, advice: 'Unrecognised key type.' };
}

export function describeCertificate(cert, source = null) {
  if (cert.parseError) {
    return { source, error: cert.parseError, severity: 'low' };
  }

  const sigName = signatureAlgorithm(cert);
  const sig = gradeSignature(sigName);
  const key = gradePublicKey(cert.publicKey);
  const notAfter = new Date(cert.validTo);
  const notBefore = new Date(cert.validFrom);
  const now = Date.now();
  const daysLeft = Math.floor((notAfter.getTime() - now) / 86400000);

  let expirySeverity = 'info';
  if (daysLeft < 0) expirySeverity = 'critical';
  else if (daysLeft < 30) expirySeverity = 'high';
  else if (daysLeft < 90) expirySeverity = 'medium';

  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const severity = [sig.severity, key.severity, expirySeverity]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];

  return {
    source,
    subject: cert.subject,
    issuer: cert.issuer,
    serialNumber: cert.serialNumber,
    subjectAltName: cert.subjectAltName || null,
    validFrom: notBefore.toISOString(),
    validTo: notAfter.toISOString(),
    daysLeft,
    expirySeverity,
    selfSigned: cert.subject === cert.issuer,
    ca: cert.ca === true,
    fingerprint256: cert.fingerprint256,
    signatureAlgorithm: sigName,
    signature: sig,
    publicKey: key,
    severity,
    quantum: key.quantum
  };
}

export function inspectPath(target) {
  const stat = fs.statSync(target);
  const files = [];
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) {
      if (/\.(pem|crt|cer|der|cert)$/i.test(name)) files.push(path.join(target, name));
    }
  } else {
    files.push(target);
  }

  const results = [];
  for (const file of files) {
    for (const cert of readCertificates(file)) {
      results.push(describeCertificate(cert, path.basename(file)));
    }
  }
  return results;
}

export default inspectPath;

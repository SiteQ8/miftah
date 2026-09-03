// Dependencies.
//
// A cryptographic inventory that reads only your source is half an inventory.
// The RSA you are exposed to is often not written in your code at all, it is
// pinned in a manifest, and a library can be the whole of an estate's
// cryptography without a single algorithm name appearing anywhere you wrote.
//
// This deliberately does not pretend to be a vulnerability scanner. There is no
// CVE feed and nothing is fetched, because a tool you point at your private keys
// should not phone anywhere. What it does is recognise which dependencies
// provide cryptography, say what that implies for the quantum question, and
// name the few that are known to be abandoned or to have unsafe defaults.

import fs from 'node:fs';
import path from 'node:path';

import { CLASSICAL, QUANTUM } from './catalog.js';

// The catalogue. Each entry says what the library provides, how it stands
// against a quantum computer, and what to do. Post quantum libraries are listed
// too, so an estate that has already started gets credit for it.
const LIB = (fields) => Object.assign({ classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN, severity: 'info' }, fields);

export const LIBRARIES = {
  npm: {
    'node-forge': LIB({ provides: ['RSA', 'AES', 'TLS'], advice: 'A whole classical stack in JavaScript. Everything asymmetric in it is quantum exposed and none of it has a post quantum path yet.' }),
    'crypto-js': LIB({
      provides: ['AES', 'MD5', 'SHA-1'],
      classical: CLASSICAL.WEAK,
      severity: 'medium',
      advice: 'The default key derivation is an OpenSSL EvpKDF over MD5, which is far below current guidance. Prefer the platform WebCrypto or node:crypto with PBKDF2 at 600000 iterations or Argon2id.'
    }),
    elliptic: LIB({ provides: ['ECDSA', 'ECDH'], severity: 'low', advice: 'Elliptic curve only, so entirely quantum exposed. It has also carried signature malleability issues historically. Prefer node:crypto where the runtime allows.' }),
    sjcl: LIB({ provides: ['AES', 'ECC'], classical: CLASSICAL.LEGACY, severity: 'medium', advice: 'Effectively unmaintained. Move to WebCrypto.' }),
    'node-rsa': LIB({ provides: ['RSA'], advice: 'RSA only, so Shor recovers every key it manages. Plan for ML-KEM and ML-DSA.' }),
    ursa: LIB({ provides: ['RSA'], classical: CLASSICAL.LEGACY, severity: 'high', advice: 'Abandoned and unbuildable on current Node. Replace with node:crypto.' }),
    md5: LIB({ provides: ['MD5'], classical: CLASSICAL.BROKEN, severity: 'high', advice: 'A package whose entire purpose is a broken hash. Replace with SHA-256, or Argon2id if it guards a password.' }),
    sha1: LIB({ provides: ['SHA-1'], classical: CLASSICAL.BROKEN, severity: 'high', advice: 'A package whose entire purpose is a broken hash. Replace with SHA-256.' }),
    jsonwebtoken: LIB({ provides: ['HMAC', 'RSA', 'ECDSA'], severity: 'low', advice: 'Pin the accepted algorithms explicitly when verifying. Accepting whatever the token declares is how algorithm confusion happens.' }),
    jose: LIB({ provides: ['HMAC', 'RSA', 'ECDSA'], severity: 'info', advice: 'Sound choice. Signature algorithms remain quantum exposed.' }),
    bcrypt: LIB({ provides: ['bcrypt'], quantum: QUANTUM.WEAKENED, advice: 'Fine for passwords. Argon2id is the current preference for new work.' }),
    bcryptjs: LIB({ provides: ['bcrypt'], quantum: QUANTUM.WEAKENED, severity: 'low', advice: 'A pure JavaScript bcrypt, so far slower and easier to misconfigure. Prefer the native binding or Argon2id.' }),
    argon2: LIB({ provides: ['Argon2id'], quantum: QUANTUM.RESISTANT, advice: 'The current preference for password storage. No action.' }),
    tweetnacl: LIB({ provides: ['X25519', 'Ed25519'], advice: 'Modern and small, but Curve25519 is quantum exposed like every other classical curve.' }),
    'libsodium-wrappers': LIB({ provides: ['X25519', 'Ed25519', 'XChaCha20'], advice: 'A good classical stack. The symmetric side survives, the curve does not.' })
  },

  pypi: {
    pycrypto: LIB({
      provides: ['AES', 'RSA'],
      classical: CLASSICAL.BROKEN,
      severity: 'high',
      advice: 'Unmaintained since 2014 with unfixed vulnerabilities. Replace with pycryptodome, which is a drop in, or with cryptography.'
    }),
    pycryptodome: LIB({ provides: ['AES', 'RSA', 'ECC'], advice: 'Maintained successor to pycrypto. Asymmetric use is still quantum exposed.' }),
    cryptography: LIB({ provides: ['AES', 'RSA', 'ECC', 'X509'], advice: 'The right default for Python. Watch for post quantum support arriving in the OpenSSL it links against.' }),
    pyopenssl: LIB({ provides: ['TLS', 'X509'], severity: 'low', advice: 'Largely superseded by cryptography for new work.' }),
    paramiko: LIB({ provides: ['SSH'], advice: 'Check which key exchange algorithms it negotiates. Post quantum SSH key exchange needs an explicit opt in.' }),
    rsa: LIB({ provides: ['RSA'], severity: 'low', advice: 'A pure Python RSA, so slow and hard to make constant time. Prefer cryptography.' }),
    ecdsa: LIB({ provides: ['ECDSA'], severity: 'low', advice: 'A pure Python implementation with a documented lack of side channel resistance. Prefer cryptography.' }),
    pyjwt: LIB({ provides: ['HMAC', 'RSA'], severity: 'low', advice: 'Pass the algorithms argument when decoding. Without it, the token chooses.' }),
    passlib: LIB({ provides: ['bcrypt', 'PBKDF2'], quantum: QUANTUM.WEAKENED, advice: 'Fine. Prefer Argon2id for new schemes.' }),
    pynacl: LIB({ provides: ['X25519', 'Ed25519'], advice: 'A good classical stack, quantum exposed on the curve.' }),
    m2crypto: LIB({ provides: ['RSA', 'X509'], classical: CLASSICAL.LEGACY, severity: 'medium', advice: 'Thinly maintained. Move to cryptography.' }),
    'liboqs-python': LIB({ provides: ['ML-KEM', 'ML-DSA'], quantum: QUANTUM.RESISTANT, advice: 'Post quantum work already under way here. Confirm it is the standardised parameter sets rather than a legacy round three name.' })
  },

  go: {
    'golang.org/x/crypto': LIB({ provides: ['SSH', 'Argon2', 'ChaCha20'], advice: 'Standard supplementary crypto. Check which SSH key exchange algorithms are enabled.' }),
    'github.com/dgrijalva/jwt-go': LIB({
      provides: ['HMAC', 'RSA'],
      classical: CLASSICAL.BROKEN,
      severity: 'high',
      advice: 'Deprecated and unmaintained, with a known algorithm confusion weakness. Replace with github.com/golang-jwt/jwt.'
    }),
    'github.com/golang-jwt/jwt': LIB({ provides: ['HMAC', 'RSA'], severity: 'low', advice: 'The maintained fork. Validate the algorithm explicitly rather than trusting the header.' }),
    'github.com/cloudflare/circl': LIB({ provides: ['ML-KEM', 'ML-DSA', 'X25519'], quantum: QUANTUM.RESISTANT, advice: 'A post quantum capable library is already present. Confirm the standardised parameter sets are the ones in use.' }),
    'github.com/open-quantum-safe/liboqs-go': LIB({ provides: ['ML-KEM', 'ML-DSA'], quantum: QUANTUM.RESISTANT, advice: 'Post quantum work already under way here.' })
  },

  maven: {
    'org.bouncycastle': LIB({ provides: ['RSA', 'ECC', 'AES', 'ML-KEM'], advice: 'Recent versions carry the standardised post quantum algorithms. Check the version before assuming they are available.' }),
    'io.jsonwebtoken': LIB({ provides: ['HMAC', 'RSA'], severity: 'low', advice: 'Pin the accepted algorithms when parsing.' }),
    'com.nimbusds': LIB({ provides: ['HMAC', 'RSA', 'ECDSA'], severity: 'low', advice: 'Restrict the accepted algorithm set explicitly.' }),
    'commons-codec': LIB({ provides: ['MD5', 'SHA-1', 'Base64'], classical: CLASSICAL.WEAK, severity: 'low', advice: 'Frequently the route by which MD5 and SHA-1 stay in a codebase. Check what is actually called.' })
  },

  rubygems: {
    bcrypt: LIB({ provides: ['bcrypt'], quantum: QUANTUM.WEAKENED, advice: 'Fine for passwords. Argon2id is preferred for new work.' }),
    jwt: LIB({ provides: ['HMAC', 'RSA'], severity: 'low', advice: 'Pass the algorithm explicitly when decoding.' })
  },

  cargo: {
    ring: LIB({ provides: ['AES', 'ECDSA', 'X25519'], advice: 'A sound classical stack. Curves remain quantum exposed.' }),
    rustls: LIB({ provides: ['TLS'], advice: 'Check whether the hybrid X25519MLKEM768 group is enabled in the version pinned.' }),
    'md-5': LIB({ provides: ['MD5'], classical: CLASSICAL.BROKEN, severity: 'high', advice: 'A broken hash. Replace with sha2 unless it is a non security checksum, and say so if it is.' }),
    sha1: LIB({ provides: ['SHA-1'], classical: CLASSICAL.BROKEN, severity: 'high', advice: 'A broken hash. Replace with sha2.' }),
    'pqcrypto': LIB({ provides: ['ML-KEM', 'ML-DSA'], quantum: QUANTUM.RESISTANT, advice: 'Post quantum work already under way here.' })
  },

  composer: {
    'firebase/php-jwt': LIB({ provides: ['HMAC', 'RSA'], severity: 'low', advice: 'Pass the allowed algorithms explicitly.' }),
    'defuse/php-encryption': LIB({ provides: ['AES'], quantum: QUANTUM.WEAKENED, advice: 'A sound choice for symmetric encryption in PHP.' }),
    'paragonie/halite': LIB({ provides: ['X25519', 'XChaCha20'], advice: 'A good classical stack.' })
  },

  nuget: {
    'BouncyCastle.Cryptography': LIB({ provides: ['RSA', 'ECC', 'AES', 'ML-KEM'], advice: 'Recent versions carry the standardised post quantum algorithms.' }),
    'jose-jwt': LIB({ provides: ['HMAC', 'RSA'], severity: 'low', advice: 'Restrict the accepted algorithms when validating.' })
  }
};

// ------------------------------------------------------------------ parsers

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function fromPackageJson(file) {
  const pkg = readJson(file);
  const out = [];
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(pkg[field] || {})) {
      out.push({ ecosystem: 'npm', name, version: String(range), dev: field === 'devDependencies' });
    }
  }
  return out;
}

function fromRequirements(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.split('#')[0].trim())
    .filter((line) => line && !line.startsWith('-'))
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*([=<>!~^].*)?$/);
      if (!match) return null;
      return { ecosystem: 'pypi', name: match[1].toLowerCase(), version: (match[2] || '').trim() };
    })
    .filter(Boolean);
}

function fromPyproject(file) {
  // Deliberately shallow. A full TOML parser is not worth a dependency here,
  // and a dependency list is a flat list of strings in practice.
  const out = [];
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/^\s*["']?([A-Za-z0-9._-]+)["']?\s*=\s*["'][^"']*["']/gm)) {
    out.push({ ecosystem: 'pypi', name: match[1].toLowerCase(), version: '' });
  }
  for (const match of text.matchAll(/["']([A-Za-z0-9._-]+)\s*[=<>~!]{1,2}\s*[^"']+["']/g)) {
    out.push({ ecosystem: 'pypi', name: match[1].toLowerCase(), version: '' });
  }
  return out;
}

function fromGoMod(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .map((line) => line.match(/^(?:require\s+)?([a-z0-9.\-]+\.[a-z]{2,}\/[^\s]+)\s+(v[^\s]+)/i))
    .filter(Boolean)
    .map((match) => ({ ecosystem: 'go', name: match[1], version: match[2] }));
}

function fromPom(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const match of text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const group = (match[1].match(/<groupId>([^<]+)<\/groupId>/) || [])[1];
    const artifact = (match[1].match(/<artifactId>([^<]+)<\/artifactId>/) || [])[1];
    const version = (match[1].match(/<version>([^<]+)<\/version>/) || [])[1] || '';
    if (group) out.push({ ecosystem: 'maven', name: group.trim(), artifact: (artifact || '').trim(), version: version.trim() });
  }
  return out;
}

function fromGradle(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/["']([A-Za-z0-9_.\-]+):([A-Za-z0-9_.\-]+):([^"':]+)["']/g)]
    .map((match) => ({ ecosystem: 'maven', name: match[1], artifact: match[2], version: match[3] }));
}

function fromGemfile(file) {
  return [...fs.readFileSync(file, 'utf8').matchAll(/^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/gm)]
    .map((match) => ({ ecosystem: 'rubygems', name: match[1], version: match[2] || '' }));
}

function fromCargo(file) {
  const text = fs.readFileSync(file, 'utf8');
  const section = text.split(/^\[dependencies\]/m)[1];
  if (!section) return [];
  return [...section.split(/^\[/m)[0].matchAll(/^\s*([A-Za-z0-9_-]+)\s*=\s*(?:["']([^"']+)["']|\{[^}]*version\s*=\s*["']([^"']+)["'])/gm)]
    .map((match) => ({ ecosystem: 'cargo', name: match[1], version: match[2] || match[3] || '' }));
}

function fromComposer(file) {
  const pkg = readJson(file);
  const out = [];
  for (const field of ['require', 'require-dev']) {
    for (const [name, range] of Object.entries(pkg[field] || {})) {
      if (name === 'php' || name.startsWith('ext-')) continue;
      out.push({ ecosystem: 'composer', name, version: String(range), dev: field === 'require-dev' });
    }
  }
  return out;
}

function fromCsproj(file) {
  return [...fs.readFileSync(file, 'utf8').matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?/g)]
    .map((match) => ({ ecosystem: 'nuget', name: match[1], version: match[2] || '' }));
}

export const MANIFESTS = new Map([
  ['package.json', fromPackageJson],
  ['requirements.txt', fromRequirements],
  ['pyproject.toml', fromPyproject],
  ['go.mod', fromGoMod],
  ['pom.xml', fromPom],
  ['build.gradle', fromGradle],
  ['build.gradle.kts', fromGradle],
  ['Gemfile', fromGemfile],
  ['Cargo.toml', fromCargo],
  ['composer.json', fromComposer]
]);

export function isManifest(file) {
  const name = path.basename(file);
  return MANIFESTS.has(name) || name.endsWith('.csproj');
}

export function parseManifest(file) {
  const name = path.basename(file);
  const parser = MANIFESTS.get(name) || (name.endsWith('.csproj') ? fromCsproj : null);
  if (!parser) return [];
  try {
    return parser(file);
  } catch {
    // A manifest that will not parse is not a finding, it is a manifest for a
    // tool we do not read. Reporting it as a problem would be noise.
    return [];
  }
}

// Maven and Go names are hierarchical, so an exact match is not enough.
function lookupLibrary(dependency) {
  const table = LIBRARIES[dependency.ecosystem];
  if (!table) return null;
  if (table[dependency.name]) return { key: dependency.name, entry: table[dependency.name] };
  for (const [key, entry] of Object.entries(table)) {
    if (dependency.name === key || dependency.name.startsWith(`${key}/`) || dependency.name.startsWith(`${key}.`)) {
      return { key, entry };
    }
  }
  return null;
}

export function evaluateDependencies(dependencies) {
  const findings = [];
  const recognised = [];
  const seen = new Set();

  for (const dependency of dependencies) {
    const hit = lookupLibrary(dependency);
    if (!hit) continue;
    const id = `${dependency.ecosystem}:${dependency.name}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const record = Object.assign({}, dependency, {
      library: hit.key,
      provides: hit.entry.provides,
      classical: hit.entry.classical,
      quantum: hit.entry.quantum,
      severity: hit.entry.severity,
      advice: hit.entry.advice
    });
    recognised.push(record);

    findings.push({
      rule: 'MFT-D001',
      title: `${dependency.name} provides ${hit.entry.provides.join(', ')}`,
      severity: hit.entry.severity,
      algorithm: null,
      assetLabel: `${dependency.name} library`,
      assetPrimitive: 'unknown',
      classical: hit.entry.classical,
      quantum: hit.entry.quantum,
      advice: hit.entry.advice,
      file: dependency.manifest || '',
      line: dependency.line || 1,
      detail: dependency.version ? `${dependency.ecosystem} ${dependency.version}` : dependency.ecosystem,
      evidence: `${dependency.name} ${dependency.version}`.trim(),
      dependency: true
    });
  }

  return { dependencies: recognised, findings };
}

// Walks a tree for manifests. The walker is passed in so this module does not
// duplicate the skip rules, the depth cap or the ignore file handling.
export function scanDependencies(files) {
  const all = [];
  for (const file of files) {
    if (!isManifest(file)) continue;
    for (const dependency of parseManifest(file)) {
      all.push(Object.assign(dependency, { manifest: file }));
    }
  }
  return Object.assign(evaluateDependencies(all), { manifests: files.filter(isManifest) });
}

// ---------------------------------------------------------------------------
// Vendors.
//
// Most of an estate is bought rather than built, so the supplier's migration
// schedule becomes yours. Nothing here can be scanned, which is exactly why it
// has to be written down: a list of who has been asked and who has answered.
// ---------------------------------------------------------------------------

const VENDOR_STATUS = new Set(['committed', 'asked', 'unknown']);

export function parseVendors(text, file = '') {
  const trimmed = String(text).trim();

  // JSON when it looks like JSON, otherwise one supplier per line so the file
  // can be started in ten seconds and refined later.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : parsed.vendors || [];
    return list.map((entry) => normaliseVendor(typeof entry === 'string' ? { name: entry } : entry, file));
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.split('#')[0].trim())
    .filter(Boolean)
    .map((line) => {
      // name | status | target
      const [name, status, target] = line.split('|').map((part) => part.trim());
      return normaliseVendor({ name, status, target }, file);
    });
}

function normaliseVendor(entry, file) {
  const status = String(entry.status || '').toLowerCase();
  return {
    name: entry.name || entry.vendor || 'unnamed supplier',
    product: entry.product || '',
    status: VENDOR_STATUS.has(status) ? status : (entry.target ? 'committed' : 'unknown'),
    target: entry.target || '',
    asked: entry.asked || '',
    note: entry.note || '',
    source: file
  };
}

export function readVendors(file) {
  return parseVendors(fs.readFileSync(file, 'utf8'), file);
}

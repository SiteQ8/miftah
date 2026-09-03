// Migration roadmap.
// Sequences the estate into waves. The ordering principle is that anything an
// adversary can record today comes before anything they would have to break in
// real time, because only the first category is losing ground while you plan.

import { QUANTUM, CLASSICAL } from './catalog.js';
import { scoreEstate } from './risk.js';

export const WAVES = [
  {
    id: 0,
    key: 'stop',
    name: 'Stop the bleeding',
    window: 'now',
    goal: 'Remove cryptography that is already broken against a classical attacker. None of this needs a quantum computer to hurt you.'
  },
  {
    id: 1,
    key: 'inventory',
    name: 'Know and govern',
    window: 'months 0 to 6',
    goal: 'Hold a complete inventory, put crypto agility in place, and make the CBOM a build artefact rather than a one off report.'
  },
  {
    id: 2,
    key: 'transport',
    name: 'Protect traffic in flight',
    window: 'months 3 to 12',
    goal: 'Deploy hybrid key establishment everywhere a session key is negotiated. This is the only wave that stops harvest now decrypt later.'
  },
  {
    id: 3,
    key: 'rest',
    name: 'Protect data at rest',
    window: 'months 9 to 24',
    goal: 'Raise symmetric keys to 256 bits and re wrap long lived encrypted data under post quantum key establishment.'
  },
  {
    id: 4,
    key: 'identity',
    name: 'Re root identity and signing',
    window: 'months 18 to 36',
    goal: 'Move certificates, code signing and firmware roots of trust to ML-DSA or a hash based signature. Slowest wave because trust anchors propagate slowly.'
  }
];

const TARGETS = {
  'key-agree': 'X25519MLKEM768 hybrid key exchange',
  kem: 'ML-KEM-768',
  pke: 'ML-KEM-768 for transport, AES-256-GCM under a wrapped key for storage',
  signature: 'ML-DSA-65, or SLH-DSA where the signer can tolerate large signatures',
  'block-cipher': 'AES-256-GCM',
  'stream-cipher': 'ChaCha20-Poly1305',
  hash: 'SHA-384',
  mac: 'HMAC-SHA-256',
  kdf: 'Argon2id for passwords, HKDF-SHA-384 for key separation',
  combiner: 'already hybrid, widen the deployment'
};

function assignWave(asset) {
  if (asset.materialType) return 0;
  if (asset.classical === CLASSICAL.BROKEN || asset.classical === CLASSICAL.WEAK) return 0;
  if (asset.quantum === QUANTUM.RESISTANT) return 1;

  const primitive = asset.primitive;
  if (primitive === 'key-agree' || primitive === 'kem' || asset.protocol === 'tls' || asset.protocol === 'ssh') return 2;
  if (primitive === 'block-cipher' || primitive === 'stream-cipher' || primitive === 'kdf' || primitive === 'ae') return 3;
  if (primitive === 'signature') return 4;
  if (primitive === 'pke') return 2;
  return 3;
}

const MATERIAL_TARGETS = {
  'secret-key': 'a key management service, with the exposed value rotated',
  'private-key': 'a hardware security module, with the exposed key rotated and purged from history',
  'initialization-vector': 'a fresh random IV per message'
};

const PROTOCOL_TARGETS = {
  tls: 'TLS 1.3 with the X25519MLKEM768 group',
  ssh: 'rsa-sha2-512 and ssh-ed25519 host keys with sntrup761x25519-sha512 key exchange'
};

function targetFor(asset) {
  if (asset.materialType && MATERIAL_TARGETS[asset.materialType]) return MATERIAL_TARGETS[asset.materialType];
  if (asset.protocol && !asset.algorithm && PROTOCOL_TARGETS[asset.protocol]) return PROTOCOL_TARGETS[asset.protocol];
  if (asset.replacement) return asset.replacement;
  return TARGETS[asset.primitive] || 'review by hand';
}

function effort(asset) {
  const count = asset.occurrences ? asset.occurrences.length : 1;
  if (asset.primitive === 'signature' || asset.materialType === 'private-key') return 'high';
  if (count > 20) return 'high';
  if (count > 5) return 'medium';
  return 'low';
}

export function buildRoadmap(scan, profile = {}, now = new Date()) {
  const assets = scan.assets || [];
  const estate = scoreEstate(assets, profile, now);
  const scoreById = new Map(estate.assets.map((item) => [item.id, item]));

  const waves = WAVES.map((wave) => Object.assign({}, wave, { items: [], assets: 0, occurrences: 0 }));

  for (const asset of assets) {
    const index = assignWave(asset);
    const wave = waves[index];
    const scored = scoreById.get(asset.id) || { score: 0, band: 'none' };
    const count = asset.occurrences ? asset.occurrences.length : 0;

    wave.items.push({
      asset: asset.name,
      id: asset.id,
      from: asset.name,
      to: asset.quantum === QUANTUM.RESISTANT ? 'no change needed' : targetFor(asset),
      risk: scored.score,
      band: scored.band,
      severity: asset.severity,
      occurrences: count,
      effort: effort(asset),
      firstSeen: (asset.occurrences || []).slice(0, 3).map((o) => `${o.file}:${o.line}`),
      why: asset.note || ''
    });
    wave.assets += 1;
    wave.occurrences += count;
  }

  for (const wave of waves) {
    wave.items.sort((a, b) => b.risk - a.risk || b.occurrences - a.occurrences);
  }

  const actions = deriveActions(scan, estate, waves);

  return {
    generatedAt: now.toISOString(),
    profile: estate.profile,
    mosca: estate.mosca,
    readiness: estate.readiness,
    waves,
    actions,
    summary: {
      totalAssets: assets.length,
      needsMigration: estate.counts.needsMigration,
      alreadyResistant: estate.counts.quantumResistant,
      firstWaveItems: waves[0].items.length,
      criticalItems: estate.assets.filter((a) => a.band === 'critical').length
    }
  };
}

function deriveActions(scan, estate, waves) {
  const actions = [];
  const findings = scan.findings || [];
  const has = (id) => findings.some((f) => f.rule === id);

  if (waves[0].items.length) {
    actions.push({
      wave: 0,
      priority: 1,
      action: `Remove ${waves[0].items.length} broken or weak primitives before anything else`,
      detail: waves[0].items.slice(0, 5).map((i) => i.asset).join(', ')
    });
  }
  if (has('MFT-K001') || has('MFT-K002')) {
    actions.push({
      wave: 0,
      priority: 1,
      action: 'Rotate every key found in the tree and purge it from history',
      detail: 'A key in a repository is a key in every clone, every fork and every backup.'
    });
  }
  if (has('MFT-T002')) {
    actions.push({
      wave: 0,
      priority: 1,
      action: 'Turn certificate verification back on',
      detail: 'Disabled verification defeats the transport layer entirely, quantum computers not required.'
    });
  }
  actions.push({
    wave: 1,
    priority: 2,
    action: 'Generate the CBOM in CI and fail the build on new quantum exposed dependencies',
    detail: 'miftah scan . --cbom cbom.json --fail-on high'
  });
  actions.push({
    wave: 1,
    priority: 2,
    action: 'Put every algorithm choice behind configuration rather than a literal',
    detail: 'Crypto agility is what makes the next migration cheap. This one is already expensive.'
  });
  if (estate.counts.quantumBroken > 0) {
    actions.push({
      wave: 2,
      priority: 3,
      action: 'Enable X25519MLKEM768 on every internet facing TLS terminator',
      detail: 'Hybrid, so a flaw in either half is survivable. Supported by OpenSSL 3.5, BoringSSL, Go 1.24 and current browsers.'
    });
    actions.push({
      wave: 2,
      priority: 3,
      action: 'Add sntrup761x25519-sha512 or mlkem768x25519-sha256 to SSH',
      detail: 'Administrative sessions carry the credentials that unlock everything else.'
    });
  }
  if (estate.counts.quantumWeakened > 0) {
    actions.push({
      wave: 3,
      priority: 4,
      action: 'Raise AES-128 to AES-256 for anything with a long secrecy horizon',
      detail: 'Doubling the key is the whole answer to Grover, and it is cheap.'
    });
  }
  actions.push({
    wave: 4,
    priority: 5,
    action: 'Pilot ML-DSA-65 in an internal certificate authority before touching the public chain',
    detail: 'Signature sizes change assumptions in protocols, embedded devices and hardware security modules.'
  });

  return actions.sort((a, b) => a.priority - b.priority);
}

export default buildRoadmap;

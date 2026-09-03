// Quantum risk model.
//
// The question is not whether an algorithm is broken today. It is whether the
// data it protects will still matter on the day it breaks. Mosca states it as
//
//     x + y > z
//
// where x is how long the data must stay secret, y is how long the migration
// takes, and z is how long until a cryptographically relevant quantum computer
// exists. When the sum exceeds z the exposure has already begun, because an
// adversary can record the traffic now and decrypt it later.

import { QUANTUM, CLASSICAL } from './catalog.js';
import { SEVERITY_WEIGHT } from './rules.js';

export const DEFAULT_PROFILE = {
  // Years the protected data must stay confidential.
  shelfLife: 10,
  // Years to complete the migration across the estate.
  migrationYears: 5,
  // Year a cryptographically relevant quantum computer is assumed to exist.
  // Not a prediction, a planning assumption. Move it and the whole model moves.
  crqcYear: 2033,
  // NIST IR 8547 deprecates 112 bit classical strength after this year.
  deprecateYear: 2030,
  // and disallows it after this one.
  disallowYear: 2035,
  // Whether the estate being scored is reachable from the internet.
  exposure: 'internet'
};

const QUANTUM_EXPOSURE = {
  [QUANTUM.BROKEN]: 1,
  [QUANTUM.WEAKENED]: 0.45,
  [QUANTUM.UNKNOWN]: 0.3,
  [QUANTUM.RESISTANT]: 0
};

const CLASSICAL_PENALTY = {
  [CLASSICAL.BROKEN]: 1,
  [CLASSICAL.WEAK]: 0.7,
  [CLASSICAL.LEGACY]: 0.5,
  [CLASSICAL.ACCEPTABLE]: 0.2,
  [CLASSICAL.STRONG]: 0
};

const EXPOSURE_FACTOR = { internet: 1, partner: 0.85, internal: 0.65, airgapped: 0.35 };

export function normaliseProfile(profile = {}) {
  const merged = Object.assign({}, DEFAULT_PROFILE, profile);
  merged.shelfLife = Math.max(0, Number(merged.shelfLife) || 0);
  merged.migrationYears = Math.max(0, Number(merged.migrationYears) || 0);
  merged.crqcYear = Number(merged.crqcYear) || DEFAULT_PROFILE.crqcYear;
  if (!EXPOSURE_FACTOR[merged.exposure]) merged.exposure = 'internet';
  return merged;
}

// Years by which the secrecy requirement outruns the horizon. Positive means
// the data is already exposed to harvest now decrypt later.
export function moscaDeficit(profile, now = new Date()) {
  const merged = normaliseProfile(profile);
  const yearsToHorizon = merged.crqcYear - (now.getFullYear() + now.getMonth() / 12);
  return {
    shelfLife: merged.shelfLife,
    migrationYears: merged.migrationYears,
    crqcYear: merged.crqcYear,
    yearsToHorizon: Number(yearsToHorizon.toFixed(2)),
    deficit: Number((merged.shelfLife + merged.migrationYears - yearsToHorizon).toFixed(2)),
    breached: merged.shelfLife + merged.migrationYears > yearsToHorizon
  };
}

export function band(score) {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

export function scoreAsset(asset, profile = DEFAULT_PROFILE, now = new Date()) {
  const merged = normaliseProfile(profile);
  const mosca = moscaDeficit(merged, now);

  const exposure = QUANTUM_EXPOSURE[asset.quantum] ?? QUANTUM_EXPOSURE[QUANTUM.UNKNOWN];
  const penalty = CLASSICAL_PENALTY[asset.classical] ?? CLASSICAL_PENALTY[CLASSICAL.ACCEPTABLE];
  const reach = EXPOSURE_FACTOR[merged.exposure];

  // How much of the secrecy requirement lands past the horizon, from 0 to 1.
  const urgency = mosca.yearsToHorizon <= 0
    ? 1
    : Math.min(1, Math.max(0, mosca.deficit) / Math.max(1, merged.shelfLife + merged.migrationYears));

  // A single occurrence and forty occurrences are not the same problem, but the
  // difference is not linear either.
  const count = asset.occurrences ? asset.occurrences.length : 1;
  const spread = Math.min(1, Math.log10(count + 1) / 2);

  const quantumPart = exposure * (0.35 + 0.65 * urgency);
  const raw = 0.5 * quantumPart + 0.35 * penalty + 0.15 * spread;
  const score = Math.round(Math.min(100, raw * 100 * reach));

  const drivers = [];
  if (exposure === 1) drivers.push('Shor breaks this primitive outright.');
  else if (exposure > 0 && exposure < 1) drivers.push('Grover halves the effective strength.');
  if (penalty >= 0.7) drivers.push('Already weak against classical attack.');
  if (mosca.breached) drivers.push(`Secrecy requirement outruns the horizon by ${mosca.deficit} years.`);
  if (count >= 10) drivers.push(`${count} occurrences across the estate.`);
  if (merged.exposure === 'internet') drivers.push('Reachable from the internet, so traffic can be recorded today.');

  return {
    id: asset.id,
    name: asset.name,
    score,
    band: band(score),
    quantum: asset.quantum,
    classical: asset.classical,
    occurrences: count,
    replacement: asset.replacement,
    drivers
  };
}

export function scoreEstate(assets, profile = DEFAULT_PROFILE, now = new Date()) {
  const merged = normaliseProfile(profile);
  const scored = assets.map((asset) => scoreAsset(asset, merged, now));

  const total = scored.length || 1;
  const resistant = assets.filter((a) => a.quantum === QUANTUM.RESISTANT).length;
  const broken = assets.filter((a) => a.quantum === QUANTUM.BROKEN).length;
  const weakened = assets.filter((a) => a.quantum === QUANTUM.WEAKENED).length;

  // Readiness is the share of the estate that needs no quantum migration,
  // weighted so that a widely used broken primitive costs more than a rare one.
  let weightedResistant = 0;
  let weightedTotal = 0;
  for (const asset of assets) {
    const weight = 1 + Math.log10((asset.occurrences ? asset.occurrences.length : 1) + 1);
    weightedTotal += weight;
    if (asset.quantum === QUANTUM.RESISTANT) weightedResistant += weight;
    else if (asset.quantum === QUANTUM.WEAKENED) weightedResistant += weight * 0.5;
  }

  const readiness = weightedTotal ? Math.round((weightedResistant / weightedTotal) * 100) : 100;
  const peak = scored.reduce((max, item) => Math.max(max, item.score), 0);

  return {
    profile: merged,
    mosca: moscaDeficit(merged, now),
    readiness,
    peakRisk: peak,
    band: band(peak),
    counts: {
      assets: assets.length,
      quantumBroken: broken,
      quantumWeakened: weakened,
      quantumResistant: resistant,
      needsMigration: broken + weakened,
      share: {
        broken: Math.round((broken / total) * 100),
        weakened: Math.round((weakened / total) * 100),
        resistant: Math.round((resistant / total) * 100)
      }
    },
    assets: scored.sort((a, b) => b.score - a.score)
  };
}

export function prioritise(findings) {
  return [...findings].sort(
    (a, b) => (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0)
  );
}

export default scoreEstate;

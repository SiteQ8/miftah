// Diff.
//
// A baseline answers "is this build worse than the last one". A diff answers a
// different question that nobody can gate on but somebody has to report: how did
// the estate move over a quarter.
//
// The part that matters most is the part with no code change behind it. A
// horizon is a fixed year, so every month that passes shortens the runway to it.
// An estate that was left completely alone is measurably worse than it was, and
// a report that only lists changed files will never say so.

import { fingerprint } from './baseline.js';
import { moscaDeficit, scoreEstate } from './risk.js';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function bySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) {
    if (counts[finding.severity] !== undefined) counts[finding.severity] += 1;
  }
  return counts;
}

function delta(before, after) {
  const out = {};
  for (const key of Object.keys(after)) out[key] = after[key] - (before[key] || 0);
  return out;
}

// Two scans of the same estate taken at different times. The profile is applied
// to both so a change in readiness is a change in the estate, not a change in
// the assumptions.
export function diffScans(before, after, options = {}) {
  const profile = options.profile || {};

  const beforeIndex = new Map();
  for (const finding of before.findings || []) beforeIndex.set(fingerprint(finding), finding);

  const afterIndex = new Map();
  for (const finding of after.findings || []) afterIndex.set(fingerprint(finding), finding);

  const introduced = [];
  const unchanged = [];
  for (const [id, finding] of afterIndex) {
    if (beforeIndex.has(id)) unchanged.push(finding);
    else introduced.push(Object.assign({ fingerprint: id }, finding));
  }

  const resolved = [];
  for (const [id, finding] of beforeIndex) {
    if (!afterIndex.has(id)) resolved.push(Object.assign({ fingerprint: id }, finding));
  }

  // Assets, so the report can talk about SHA-1 rather than about forty lines.
  const beforeAssets = new Map((before.assets || []).map((a) => [a.id, a]));
  const afterAssets = new Map((after.assets || []).map((a) => [a.id, a]));

  const assetsAdded = [...afterAssets.values()].filter((a) => !beforeAssets.has(a.id));
  const assetsRemoved = [...beforeAssets.values()].filter((a) => !afterAssets.has(a.id));

  const assetsWorse = [];
  const assetsBetter = [];
  for (const [id, asset] of afterAssets) {
    const previous = beforeAssets.get(id);
    if (!previous) continue;
    const from = SEVERITY_RANK[previous.severity];
    const to = SEVERITY_RANK[asset.severity];
    if (to === undefined || from === undefined || to === from) continue;
    const movement = { id, name: asset.name, from: previous.severity, to: asset.severity };
    if (to < from) assetsWorse.push(movement);
    else assetsBetter.push(movement);
  }

  const beforeEstate = scoreEstate(before.assets || [], profile);
  const afterEstate = scoreEstate(after.assets || [], profile);

  // Time moved even if the tree did not. The runway to a fixed horizon is
  // shorter than it was, and nothing in a file listing will say so.
  const beforeAt = before.startedAt ? new Date(before.startedAt) : null;
  const afterAt = after.startedAt ? new Date(after.startedAt) : null;
  const beforeMosca = beforeAt ? moscaDeficit(profile, beforeAt) : beforeEstate.mosca;
  const afterMosca = afterAt ? moscaDeficit(profile, afterAt) : afterEstate.mosca;

  const elapsedDays = beforeAt && afterAt
    ? Math.max(0, Math.round((afterAt - beforeAt) / 86400000))
    : null;

  const marginLost = Number((beforeMosca.yearsToHorizon - afterMosca.yearsToHorizon).toFixed(2));

  return {
    before: { target: before.target || '', at: before.startedAt || null, findings: (before.findings || []).length },
    after: { target: after.target || '', at: after.startedAt || null, findings: (after.findings || []).length },
    elapsedDays,
    findings: {
      introduced,
      resolved,
      unchanged: unchanged.length,
      severity: delta(bySeverity(before.findings || []), bySeverity(after.findings || []))
    },
    assets: {
      added: assetsAdded,
      removed: assetsRemoved,
      worse: assetsWorse,
      better: assetsBetter
    },
    readiness: {
      before: beforeEstate.readiness,
      after: afterEstate.readiness,
      change: afterEstate.readiness - beforeEstate.readiness
    },
    quantum: delta(beforeEstate.counts, afterEstate.counts),
    horizon: {
      yearsBefore: beforeMosca.yearsToHorizon,
      yearsAfter: afterMosca.yearsToHorizon,
      marginLost,
      deficitBefore: beforeMosca.deficit,
      deficitAfter: afterMosca.deficit
    },
    // A regression is anything that made the estate harder to migrate, not
    // simply anything that changed.
    regressed:
      introduced.some((f) => f.severity === 'critical' || f.severity === 'high')
      || assetsWorse.length > 0
      || afterEstate.readiness < beforeEstate.readiness
  };
}

// One sentence a person can put in front of a steering committee.
export function summariseDiff(result) {
  const parts = [];

  if (result.readiness.change > 0) parts.push(`Readiness rose ${result.readiness.change} points to ${result.readiness.after}`);
  else if (result.readiness.change < 0) parts.push(`Readiness fell ${Math.abs(result.readiness.change)} points to ${result.readiness.after}`);
  else parts.push(`Readiness is unchanged at ${result.readiness.after}`);

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (result.findings.resolved.length) parts.push(`${plural(result.findings.resolved.length, 'finding')} fixed`);
  if (result.findings.introduced.length) parts.push(`${result.findings.introduced.length} introduced`);

  if (result.horizon.marginLost > 0) {
    const days = result.elapsedDays === null ? '' : ` over ${result.elapsedDays} days`;
    parts.push(`${result.horizon.marginLost} years of margin lost to time alone${days}`);
  }

  return `${parts.join('. ')}.`;
}

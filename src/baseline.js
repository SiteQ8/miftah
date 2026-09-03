// Baselines.
//
// A scanner that fails the build on everything it finds is deleted from the
// pipeline within a week, because on any codebase with history it fails from
// the first run and never stops. `--fail-on high` was theatre without this.
//
// A baseline records what is already known and accepted, so the build fails on
// what arrives after it. Nothing is hidden: the summary always reports how many
// findings the baseline absorbed, and a suppressed finding is still written to
// the JSON, the CBOM and the report.

import fs from 'node:fs';
import crypto from 'node:crypto';

export const BASELINE_VERSION = 1;
export const DEFAULT_BASELINE = '.miftah-baseline.json';

// The fingerprint deliberately excludes the line number. Code moves constantly,
// and a baseline that expires on every refactor is worse than no baseline
// because it teaches people to regenerate it without reading the diff.
export function fingerprint(finding) {
  const evidence = String(finding.evidence || '').replace(/\s+/g, ' ').trim();
  const parts = [
    finding.rule,
    finding.file,
    finding.detail || '',
    evidence
  ].join('|');
  return crypto.createHash('sha256').update(parts).digest('hex').slice(0, 16);
}

// Entries carry the rule, file and title alongside the hash so the file can be
// read in a pull request. A baseline nobody can review is a rubber stamp.
export function createBaseline(scan, options = {}) {
  const entries = (scan.findings || []).map((finding) => ({
    id: fingerprint(finding),
    rule: finding.rule,
    file: finding.file,
    title: finding.title,
    severity: finding.severity
  }));

  const unique = new Map();
  for (const entry of entries) unique.set(entry.id, entry);

  return {
    version: BASELINE_VERSION,
    tool: 'miftah',
    createdAt: new Date().toISOString(),
    target: scan.target || '',
    note: options.note || 'Findings accepted at the time this file was written. Delete an entry to start failing on it again.',
    counts: { accepted: unique.size },
    accepted: [...unique.values()].sort((a, b) => (a.file + a.rule).localeCompare(b.file + b.rule))
  };
}

export function readBaseline(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('The baseline file is not an object.');
  if (parsed.version !== BASELINE_VERSION) {
    throw new Error(`Baseline version ${parsed.version} is not supported by this release. Regenerate it with: miftah baseline <path>`);
  }
  if (!Array.isArray(parsed.accepted)) throw new Error('The baseline file has no accepted list.');
  return parsed;
}

export function writeBaseline(file, baseline) {
  fs.writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
  return file;
}

// Splits a scan against a baseline. Findings are marked rather than removed, so
// every consumer downstream can still see the whole picture and only the gate
// changes behaviour.
export function applyBaseline(scan, baseline) {
  const accepted = new Set((baseline.accepted || []).map((entry) => entry.id));
  const present = new Set();

  const introduced = [];
  const suppressed = [];

  for (const finding of scan.findings || []) {
    const id = fingerprint(finding);
    finding.fingerprint = id;
    present.add(id);
    if (accepted.has(id)) {
      finding.baselined = true;
      suppressed.push(finding);
    } else {
      finding.baselined = false;
      introduced.push(finding);
    }
  }

  // Entries the code no longer produces. Reporting them lets a baseline shrink
  // as things are fixed, rather than growing for ever.
  const resolved = (baseline.accepted || []).filter((entry) => !present.has(entry.id));

  return { introduced, suppressed, resolved };
}

// Rewrites a baseline against the current scan: keeps what still occurs, drops
// what was fixed, and does not silently adopt anything new.
export function pruneBaseline(baseline, scan) {
  const present = new Set((scan.findings || []).map(fingerprint));
  const kept = (baseline.accepted || []).filter((entry) => present.has(entry.id));
  const removed = (baseline.accepted || []).length - kept.length;
  return {
    baseline: Object.assign({}, baseline, {
      counts: { accepted: kept.length },
      accepted: kept,
      prunedAt: new Date().toISOString()
    }),
    removed
  };
}

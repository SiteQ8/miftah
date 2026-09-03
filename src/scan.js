// Tree scanner.
// Walks a directory, reads the files worth reading, applies every rule to every
// line, and folds the hits into an asset inventory keyed by algorithm.

import fs from 'node:fs';
import path from 'node:path';
import { RULES, SCANNABLE, SCANNABLE_NAMES, SKIP_DIRS, SEVERITY_WEIGHT } from './rules.js';
import { lookup, gradeModulus, CLASSICAL, QUANTUM } from './catalog.js';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_LINE = 4000;

export function walk(root, options = {}) {
  const skip = new Set([...SKIP_DIRS, ...(options.exclude || [])]);
  const files = [];
  const limit = options.maxFiles || 20000;

  function visit(dir, depth) {
    if (depth > 24 || files.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of entries) {
      if (files.length >= limit) return;
      const full = path.join(dir, item.name);
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        if (skip.has(item.name)) continue;
        visit(full, depth + 1);
      } else if (item.isFile()) {
        if (isScannable(item.name)) files.push(full);
      }
    }
  }

  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  visit(root, 0);
  return files;
}

export function isScannable(name) {
  if (SCANNABLE_NAMES.has(name)) return true;
  const ext = path.extname(name).toLowerCase();
  if (ext) return SCANNABLE.has(ext);
  return SCANNABLE_NAMES.has(name);
}

// RSA and DH strength lives in the modulus, so pull it off the same line.
function modulusOnLine(line) {
  const explicit = line.match(/(?<![A-Za-z0-9_])(?:key[_-]?size|bits|modulus[_-]?bits|numbits|rsa_keygen_bits|default_bits)\s*[:=]\s*(\d{3,5})/i);
  if (explicit) return Number(explicit[1]);
  const genrsa = line.match(/genrsa[^\n]*?(?<![A-Za-z0-9_])(\d{3,5})(?![A-Za-z0-9_])/i);
  if (genrsa) return Number(genrsa[1]);
  const named = line.match(/(?<![A-Za-z0-9_])rsa[-_]?(512|768|1024|2048|3072|4096|8192)(?![A-Za-z0-9_])/i);
  if (named) return Number(named[1]);
  const initialize = line.match(/(?:initialize|generate_private_key|generateKeyPair)[^\n]{0,60}?(?<![A-Za-z0-9_])(512|768|1024|2048|3072|4096|8192)(?![A-Za-z0-9_])/i);
  if (initialize) return Number(initialize[1]);
  return null;
}

function iterationsOnLine(line) {
  const match = line.match(/(?:iterations?|rounds|count|iter)\s*[:=]\s*(\d{2,8})/i);
  if (match) return Number(match[1]);
  const positional = line.match(/pbkdf2[^\n]{0,120}?(?<![A-Za-z0-9_.])(\d{3,8})(?![A-Za-z0-9_.])/i);
  return positional ? Number(positional[1]) : null;
}

function redact(text) {
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)} (${text.length} chars)`;
}

export function scanLine(line, rule) {
  if (line.length > MAX_LINE) line = line.slice(0, MAX_LINE);
  const match = rule.pattern.exec(line);
  if (!match) return null;
  if (rule.require && !rule.require.test(line)) return null;
  if (rule.reject && rule.reject.test(line)) return null;
  return match;
}

export function scanText(text, file, options = {}) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const seen = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const line = raw.length > MAX_LINE ? raw.slice(0, MAX_LINE) : raw;

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      const match = scanLine(line, rule);
      if (!match) continue;

      let severity = rule.severity;
      let title = rule.title;
      let algorithm = rule.algorithm;
      let detail = '';
      let bits = null;

      if (rule.sizeAware) {
        bits = modulusOnLine(line);
        if (bits) {
          const grade = gradeModulus(bits);
          severity = grade.severity;
          detail = `modulus ${bits} bits`;
        }
      }

      if (rule.iterationAware) {
        const iterations = iterationsOnLine(line);
        if (iterations === null) continue;
        if (iterations >= 600000) {
          severity = 'info';
          title = 'PBKDF2 iteration count meets guidance';
          detail = `${iterations} iterations`;
        } else if (iterations >= 210000) {
          severity = 'low';
          detail = `${iterations} iterations`;
        } else {
          severity = 'medium';
          detail = `${iterations} iterations, below guidance`;
        }
      }

      if (rule.materialType === 'secret-key' && match[1]) {
        detail = redact(match[1]);
      }

      // One hit per rule per line is enough. A second AES-256 on the same line
      // is the same fact.
      const key = `${rule.id}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        rule: rule.id,
        title,
        severity,
        algorithm,
        mode: rule.mode || null,
        protocol: rule.protocol || null,
        materialType: rule.materialType || null,
        assetLabel: rule.assetLabel || null,
        assetPrimitive: rule.assetPrimitive || null,
        classical: rule.classical,
        quantum: rule.quantum,
        advice: rule.advice,
        file,
        line: i + 1,
        column: match.index + 1,
        bits,
        detail,
        evidence: options.redactEvidence === false ? line.trim().slice(0, 200) : summarise(line, match)
      });
    }
  }
  return findings;
}

// Evidence should prove the finding without copying the secret out of the file.
function summarise(line, match) {
  const trimmed = line.trim();
  if (trimmed.length <= 120) return maskSecrets(trimmed);
  const start = Math.max(0, match.index - 40);
  return maskSecrets(`...${line.slice(start, start + 120).trim()}...`);
}

function maskSecrets(text) {
  return text.replace(/(["'`])([A-Za-z0-9+/=_.-]{24,})\1/g, (whole, quote, body) => `${quote}${body.slice(0, 4)}...${body.slice(-2)}${quote}`);
}

export function scanTree(root, options = {}) {
  const started = Date.now();
  const files = walk(root, options);
  const findings = [];
  let scanned = 0;
  let skipped = 0;

  for (const file of files) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      skipped += 1;
      continue;
    }
    if (stat.size > MAX_BYTES) {
      skipped += 1;
      continue;
    }
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      skipped += 1;
      continue;
    }
    if (text.includes('\u0000')) {
      skipped += 1;
      continue;
    }
    scanned += 1;
    const relative = path.relative(root, file) || path.basename(file);
    findings.push(...scanText(text, relative, options));
  }

  return {
    target: path.resolve(root),
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    filesFound: files.length,
    filesScanned: scanned,
    filesSkipped: skipped,
    findings,
    assets: inventory(findings)
  };
}

// Fold findings into one row per algorithm. This is what the CBOM and the
// risk model both consume.
export function inventory(findings) {
  const assets = new Map();

  for (const finding of findings) {
    // A finding is only an inventory entry if it names something cryptographic.
    // Disabled certificate verification is a real problem, but it is not an
    // asset, and putting it in the CBOM would be a category error.
    const name = finding.algorithm || finding.mode || finding.materialType || finding.protocol;
    if (!name) continue;

    const bucket = finding.bits ? `${name}-${finding.bits}` : name;
    if (!assets.has(bucket)) {
      const meta = lookup(finding.algorithm) || {};
      const label = finding.assetLabel || meta.name || name;
      assets.set(bucket, {
        id: bucket,
        name: finding.bits ? `${label} ${finding.bits}` : label,
        algorithm: finding.algorithm,
        mode: finding.mode || null,
        protocol: finding.protocol || null,
        materialType: finding.materialType || null,
        primitive: finding.assetPrimitive || meta.primitive || 'unknown',
        classical: finding.classical || meta.classical || CLASSICAL.ACCEPTABLE,
        quantum: finding.quantum || meta.quantum || QUANTUM.UNKNOWN,
        nistLevel: meta.nistLevel || 0,
        oid: meta.oid || null,
        replacement: meta.replacement || null,
        note: meta.note || '',
        bits: finding.bits || null,
        functions: meta.functions || [],
        severity: finding.severity,
        occurrences: []
      });
    }
    const asset = assets.get(bucket);
    if (SEVERITY_WEIGHT[finding.severity] > SEVERITY_WEIGHT[asset.severity]) {
      asset.severity = finding.severity;
    }
    asset.occurrences.push({
      file: finding.file,
      line: finding.line,
      rule: finding.rule,
      detail: finding.detail || undefined
    });
  }

  return [...assets.values()].sort(
    (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.occurrences.length - a.occurrences.length
  );
}

export function countBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

export default scanTree;

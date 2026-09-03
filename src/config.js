// Configuration.
//
// The three numbers that decide every score in this tool are how long the data
// must stay secret, how long a migration takes, and when a capable quantum
// computer is assumed to exist. Until now they lived only in command line
// flags, which means they were set once by whoever wrote the pipeline and never
// reviewed by anyone again.
//
// Assumptions that nobody can see are assumptions nobody can argue with, and
// the whole point of drawing the horizon as a line rather than a fact is that it
// should be argued with. A committed file gets read in a pull request.

import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILES = ['.miftahrc.json', '.miftahrc', 'miftah.config.json'];

const EXPOSURES = new Set(['internet', 'partner', 'internal', 'airgapped']);

function coerceProfile(raw, errors) {
  const profile = {};
  if (!raw || typeof raw !== 'object') return profile;

  const number = (key, min, max) => {
    if (raw[key] === undefined) return;
    const value = Number(raw[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${key} must be a number between ${min} and ${max}, got ${JSON.stringify(raw[key])}`);
      return;
    }
    profile[key] = value;
  };

  number('shelfLife', 1, 100);
  number('migrationYears', 1, 50);
  number('crqcYear', 2025, 2100);

  if (raw.exposure !== undefined) {
    if (!EXPOSURES.has(raw.exposure)) {
      errors.push(`exposure must be one of ${[...EXPOSURES].join(', ')}, got ${JSON.stringify(raw.exposure)}`);
    } else {
      profile.exposure = raw.exposure;
    }
  }

  return profile;
}

export function parseConfig(text, source = '') {
  const errors = [];
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    // A configuration file that will not parse is not something to shrug at.
    // Falling back to defaults silently would mean scoring the estate against
    // assumptions nobody chose.
    throw new Error(`${source || 'configuration'} is not valid JSON: ${error.message}`);
  }

  const config = {
    source,
    profile: coerceProfile(raw.profile || raw, errors),
    failOn: raw.failOn || raw['fail-on'] || null,
    vendors: raw.vendors || null,
    baseline: raw.baseline || null,
    exclude: Array.isArray(raw.exclude) ? raw.exclude : [],
    strict: raw.strict === true,
    lockfiles: raw.lockfiles === true,
    maxFiles: Number.isFinite(Number(raw.maxFiles)) ? Number(raw.maxFiles) : null,
    errors
  };

  if (config.failOn && !['critical', 'high', 'medium', 'low', 'info'].includes(config.failOn)) {
    errors.push(`failOn must be a severity, got ${JSON.stringify(config.failOn)}`);
    config.failOn = null;
  }

  return config;
}

export function findConfig(root) {
  for (const name of CONFIG_FILES) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

export function loadConfig(root) {
  const file = findConfig(root);
  if (!file) return null;
  return parseConfig(fs.readFileSync(file, 'utf8'), path.basename(file));
}

// Precedence is defaults, then the committed file, then the command line. A
// flag typed today should win over a file written last year, and the result
// records which of the two supplied each value so a report can say so.
export function resolveProfile(defaults, config, flags) {
  const resolved = { ...defaults };
  const from = {};
  for (const key of Object.keys(defaults)) from[key] = 'default';

  for (const [key, value] of Object.entries(config?.profile || {})) {
    if (value === undefined) continue;
    resolved[key] = value;
    from[key] = config.source || 'configuration';
  }

  for (const [key, value] of Object.entries(flags || {})) {
    if (value === undefined || value === null) continue;
    resolved[key] = value;
    from[key] = 'command line';
  }

  return { profile: resolved, from };
}

// One line a reader can check without running anything.
export function describeProfile(resolved) {
  const { profile, from } = resolved;
  const parts = [
    `${profile.shelfLife} years of secrecy`,
    `${profile.migrationYears} years to migrate`,
    `horizon ${profile.crqcYear}`,
    `${profile.exposure} exposure`
  ];
  const sources = [...new Set(Object.values(from))].filter((s) => s !== 'default');
  const origin = sources.length ? ` set from ${sources.join(' and ')}` : ' using defaults throughout';
  return `${parts.join(', ')}${origin}.`;
}

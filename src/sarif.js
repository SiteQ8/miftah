// SARIF 2.1.0.
//
// Findings that live only in a terminal are read once and forgotten. SARIF is
// what GitHub code scanning, GitLab and Azure DevOps already consume, so this is
// how the results reach the place a team already looks.

import { RULES } from './rules.js';
import { VERSION } from './version.js';

export const SARIF_VERSION = '2.1.0';
const SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

// SARIF has three levels, and cryptographic findings have five severities.
// Anything a reviewer must act on becomes an error; the rest annotates.
const LEVEL = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note'
};

// GitHub renders severity from this numeric property rather than from level,
// so both are set or the whole set arrives looking equally urgent.
const SECURITY_SEVERITY = {
  critical: '9.5',
  high: '7.5',
  medium: '5.0',
  low: '3.0',
  info: '1.0'
};

function ruleDescriptor(rule) {
  const tags = ['cryptography', 'post-quantum'];
  if (rule.quantum) tags.push(`quantum-${rule.quantum}`);
  if (rule.classical) tags.push(`classical-${rule.classical}`);
  if (rule.algorithm) tags.push(rule.algorithm.toLowerCase());

  return {
    id: rule.id,
    name: rule.title.replace(/[^A-Za-z0-9]+/g, ''),
    shortDescription: { text: rule.title },
    fullDescription: { text: rule.advice },
    help: {
      text: rule.advice,
      markdown: `**${rule.title}**\n\n${rule.advice}`
    },
    defaultConfiguration: { level: LEVEL[rule.severity] || 'note' },
    properties: {
      tags,
      'security-severity': SECURITY_SEVERITY[rule.severity] || '1.0',
      precision: 'high'
    }
  };
}

function result(finding) {
  const message = finding.contextNote
    ? `${finding.title}. ${finding.advice} ${finding.contextNote}`
    : `${finding.title}. ${finding.advice}`;

  const entry = {
    ruleId: finding.rule,
    level: LEVEL[finding.severity] || 'note',
    message: { text: message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: String(finding.file).replace(/\\/g, '/'), uriBaseId: '%SRCROOT%' },
          region: {
            startLine: Math.max(1, finding.line || 1),
            startColumn: Math.max(1, finding.column || 1),
            snippet: { text: String(finding.evidence || '').slice(0, 200) }
          }
        }
      }
    ],
    properties: {
      classical: finding.classical,
      quantum: finding.quantum
    }
  };

  // Stable across runs, so code scanning tracks one alert through a refactor
  // instead of closing it and opening a new one.
  if (finding.fingerprint) {
    entry.partialFingerprints = { miftahFindingV1: finding.fingerprint };
  }
  if (finding.context) entry.properties.context = finding.context;
  if (finding.baselined) entry.properties.baselined = true;
  if (finding.detail) entry.properties.detail = finding.detail;

  return entry;
}

export function buildSarif(scan, options = {}) {
  const findings = options.findings || scan.findings || [];
  const used = new Set(findings.map((f) => f.rule));

  // Only rules that fired are declared, which keeps the file small and keeps a
  // code scanning dashboard from listing rules that never matched.
  const rules = RULES.filter((rule) => used.has(rule.id)).map(ruleDescriptor);
  for (const id of used) {
    if (!rules.some((r) => r.id === id)) {
      rules.push({
        id,
        name: id.replace(/[^A-Za-z0-9]+/g, ''),
        shortDescription: { text: id },
        fullDescription: { text: 'Reported by a live probe rather than a source rule.' },
        defaultConfiguration: { level: 'warning' },
        properties: { tags: ['cryptography'], 'security-severity': '5.0' }
      });
    }
  }

  return {
    $schema: SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'Miftah',
            fullName: 'Miftah cryptographic inventory and post quantum readiness',
            version: VERSION,
            semanticVersion: VERSION,
            informationUri: 'https://github.com/SiteQ8/miftah',
            rules
          }
        },
        automationDetails: { id: `miftah/${scan.target || 'scan'}` },
        columnKind: 'utf16CodeUnits',
        results: findings.map(result)
      }
    ]
  };
}

// A structural check run before the file leaves the tool, so a malformed run is
// caught here rather than by a code scanning upload three minutes later.
export function validateSarif(sarif) {
  const errors = [];
  if (sarif.version !== SARIF_VERSION) errors.push(`version must be ${SARIF_VERSION}`);
  if (!Array.isArray(sarif.runs) || sarif.runs.length === 0) errors.push('runs must be a non empty array');

  for (const run of sarif.runs || []) {
    if (!run.tool?.driver?.name) errors.push('every run needs tool.driver.name');
    const declared = new Set((run.tool?.driver?.rules || []).map((r) => r.id));
    for (const entry of run.results || []) {
      if (!entry.ruleId) errors.push('a result has no ruleId');
      else if (!declared.has(entry.ruleId)) errors.push(`result references undeclared rule ${entry.ruleId}`);
      if (!['error', 'warning', 'note', 'none'].includes(entry.level)) errors.push(`invalid level ${entry.level}`);
      if (!entry.message?.text) errors.push(`result ${entry.ruleId} has no message`);
      const region = entry.locations?.[0]?.physicalLocation?.region;
      if (!region || !Number.isInteger(region.startLine) || region.startLine < 1) {
        errors.push(`result ${entry.ruleId} has no usable location`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

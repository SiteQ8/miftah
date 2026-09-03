// Tree scanner.
// Walks a directory, reads the files worth reading, applies every rule to every
// line, and folds the hits into an asset inventory keyed by algorithm.

import fs from 'node:fs';
import path from 'node:path';
import { RULES, SCANNABLE, SCANNABLE_NAMES, SKIP_DIRS, SEVERITY_WEIGHT } from './rules.js';
import { isManifest, scanDependencies } from './deps.js';
import { readCertificates, describeCertificate } from './certs.js';
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
        if (isScannable(item.name) || isManifest(item.name) || isSignalFile(item.name)) files.push(full);
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

// How far either side of a match to look for the context that qualifies it.
// Two lines covers the declare then configure shape common to Java and C#
// without letting an unrelated block leak in.
export const CONTEXT_LINES = 2;


const TEST_PATH = /(?:^|[\\/])(?:tests?|spec|specs|__tests__|testdata|fixtures?|mocks?|benchmarks?)[\\/]|(?:^|[\\/])(?:test_[^\\/]*|[^\\/]*_test|[^\\/]*\\.(?:test|spec))\\.[A-Za-z0-9]+$/i;

// Files that announce they are deliberately wrong.
const FIXTURE_NAME = /(?:vulnerable|insecure|unsafe|weak|bad|broken|deliberately|honeypot|dummy)[-_.]/i;

// Generated dependency lockfiles. A package-lock.json carries a sha512 integrity
// hash per package, which produced 1474 findings on one repository and buried
// everything that mattered.
const LOCKFILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json',
  'composer.lock', 'Gemfile.lock', 'poetry.lock', 'Pipfile.lock',
  'Cargo.lock', 'go.sum', 'gradle.lockfile', 'pubspec.lock'
]);

const OWN_OUTPUT = /^(?:\.miftah-baseline\.json|miftah-baseline\.json|cbom\.json|scan\.json|[^/\\]*\.sarif)$/i;

export function isOwnOutput(file) {
  return OWN_OUTPUT.test(path.basename(file));
}

// ---------------------------------------------------------------------------
// Ignore files.
//
// Every project that works on cryptography has somewhere full of algorithm
// names on purpose: fixtures, rule tables, generated sample output. Without a
// committed way to say so, the only options are a long --exclude nobody
// remembers or ignoring the tool, and people choose the second.
// ---------------------------------------------------------------------------

export const IGNORE_FILE = '.miftahignore';

// Certificates found while walking. The grader already existed and was only
// ever reachable through --certs, so a SHA-1 signed key sitting in the
// repository produced nothing at all.
const CERT_EXT = new Set(['.pem', '.crt', '.cer', '.der', '.p7b']);

// Evidence that the inventory is a control rather than a snapshot, and that
// somebody is accountable for it.
const CI_PATH = /(?:^|[\\/])(?:\.github[\\/]workflows|\.gitlab-ci\.yml|\.circleci|azure-pipelines|Jenkinsfile|\.drone\.yml|bitbucket-pipelines\.yml)/i;
const INVENTORY_HINT = /\b(?:miftah|cyclonedx|cbom|sbom|syft|cdxgen|dependency-track)\b/i;

function recordSignal(signals, root, file) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  const name = path.basename(file);

  if (name === DEFAULT_BASELINE_NAME) signals.baseline = true;
  if (/^CODEOWNERS$/i.test(name)) signals.codeowners = true;
  if (/^SECURITY(\.md|\.txt)?$/i.test(name)) signals.securityPolicy = true;

  if (!CI_PATH.test(relative)) return;
  signals.ci = true;
  if (signals.ciCryptoInventory) return;
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_BYTES) return;
    if (INVENTORY_HINT.test(fs.readFileSync(file, 'utf8'))) signals.ciCryptoInventory = true;
  } catch {
    // A CI file we cannot read tells us nothing either way.
  }
}

const DEFAULT_BASELINE_NAME = '.miftah-baseline.json';

const SIGNAL_NAMES = new Set(['CODEOWNERS', 'SECURITY.md', 'SECURITY.txt', 'SECURITY', '.miftah-baseline.json']);

export function isSignalFile(name) {
  return SIGNAL_NAMES.has(name) || SIGNAL_NAMES.has(String(name).toUpperCase());
}

export function looksLikeCertificate(file) {
  return CERT_EXT.has(path.extname(file).toLowerCase());
}

export function gradeCertificateFile(file, relative) {
  const described = [];
  const findings = [];
  let parsed;
  try {
    parsed = readCertificates(file);
  } catch {
    return { described, findings };
  }

  for (const cert of parsed) {
    // A .pem holding only a private key is not a certificate. That case is
    // already reported by the key material rule and saying so twice is worse
    // than saying it once.
    if (!cert || cert.parseError) continue;
    const detail = describeCertificate(cert, relative);
    if (detail.error) continue;
    described.push(detail);

    findings.push({
      rule: 'MFT-X002',
      title: `Certificate ${detail.publicKey.name} signed with ${detail.signatureAlgorithm}`,
      severity: detail.severity,
      algorithm: detail.publicKey.algorithm || null,
      assetLabel: detail.publicKey.name,
      assetPrimitive: detail.publicKey.algorithm === 'RSA' ? 'pke' : 'signature',
      classical: detail.signature.classical,
      quantum: detail.quantum,
      advice: detail.signature.advice,
      file: relative,
      line: 1,
      column: 1,
      detail: `${detail.subject || ''} expires in ${detail.daysLeft} days`.trim(),
      evidence: `${detail.publicKey.name}, ${detail.signatureAlgorithm}, ${detail.daysLeft} days left`
    });
  }
  return { described, findings };
}

function patternToRegExp(pattern) {
  const directory = pattern.endsWith('/');
  const body = directory ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*');
  const anchored = body.includes('/') ? `^${escaped}` : `(?:^|/)${escaped}`;
  return new RegExp(directory ? `${anchored}(?:/|$)` : `${anchored}(?:/|$)`);
}

export function parseIgnore(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((pattern) => ({ pattern, test: patternToRegExp(pattern) }));
}

export function loadIgnore(root) {
  const file = path.join(root, IGNORE_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    return parseIgnore(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

export function isIgnored(relative, rules) {
  const normal = String(relative).replace(/\\/g, '/');
  return rules.some((rule) => rule.test.test(normal));
}

export function isLockfile(file) {
  return LOCKFILES.has(path.basename(file));
}

export function classifyPath(file) {
  const name = path.basename(file);
  if (FIXTURE_NAME.test(name)) return 'fixture';
  if (TEST_PATH.test(file.replace(/\\/g, '/'))) return 'test';
  return null;
}

// Real code uses one algorithm per line. Naming three or more in a short block
// is a list about cryptography rather than a use of it, which is what a
// denylist, a protocol table and a grading rubric all look like.
const CATALOGUE_MIN = 3;

const CONFIG_EXT = new Set([
  '.yaml', '.yml', '.conf', '.cnf', '.cfg', '.ini', '.properties',
  '.toml', '.env', '.tf', '.tfvars'
]);

function isConfig(file) {
  const name = path.basename(file);
  return CONFIG_EXT.has(path.extname(file).toLowerCase()) || SCANNABLE_NAMES.has(name);
}

// An OpenSSL cipher string names many suites inside one quoted value. That is a
// directive being set, never a catalogue.
const CIPHER_STRING = /["'][A-Za-z0-9!+@-]+(?::[A-Za-z0-9!+@-]+){2,}["']/;
const CATALOGUE_SPAN = 2;

// A source file naming ten or more distinct algorithms is a table of them. An
// algorithm registry, a cipher grading rubric and a rule set all look like this,
// and no application reaches for ten primitives in one file. Registry entries
// sit too far apart for the line window to group them, so the judgement has to
// be made across the whole file.
const CATALOGUE_FILE_MIN = 10;

// Text that talks about an algorithm instead of calling it. Remediation advice
// is the common case: "Remove RC4, 3DES, export and null ciphers".
const DISCUSSING = /\b(?:remove|removed|disable|disabled|avoid|prefer|deprecat\w*|forbid\w*|reject\w*|block(?:ed|s)?|insecure|unsupported|legacy|obsolete|no longer|should not|must not|do not|don't|weak(?:er|est)?)\b/i;

// A regex naming algorithms is a detector, not a use of them. The second
// alternative catches a plain literal being tested, /md5|md2|md4/.test(x),
// which carries none of the usual regex metacharacters.
const REGEX_LITERAL = /\(\?[:=!<]|\\[dwsbA-Z]|\[\^?[A-Za-z0-9]-[A-Za-z0-9]\]|re\.(?:compile|match|search|fullmatch)\s*\(|new RegExp\s*\(|\/[^/\s][^/\n]*\/[gimsuy]*\s*\.\s*(?:test|exec)\s*\(|\bgrep\s+-[a-zA-Z]*E\b|\begrep\b/;

// Languages where a hash opens a comment. Applying the rule everywhere would
// read a CSS colour as the start of one.
const HASH_COMMENT = new Set([
  '.py', '.sh', '.bash', '.zsh', '.rb', '.yaml', '.yml', '.conf', '.cnf', '.cfg',
  '.ini', '.toml', '.properties', '.env', '.tf', '.tfvars', '.ps1', '.pl', '.r'
]);

// An algorithm named in a comment is being discussed, not called. This is the
// single largest source of noise when scanning a security codebase, where the
// comments are about cryptography by definition.
function inComment(line, index, file) {
  const before = line.slice(0, Math.max(0, index));
  if (/(?<!:)\/\//.test(before)) return true;
  if (before.includes('/*') || /^\s*\*/.test(line)) return true;
  if (before.includes('<!--')) return true;
  const ext = path.extname(file).toLowerCase();
  const hashLang = HASH_COMMENT.has(ext) || SCANNABLE_NAMES.has(path.basename(file));
  if ((hashLang || /^\s*#/.test(line)) && /(?:^|\s)#/.test(before)) return true;
  return false;
}

// Prose about the system rather than the system.
const DOC_EXT = new Set(['.md', '.markdown', '.txt', '.rst', '.adoc']);

// Secret material stays at full severity even in prose, because a key pasted
// into a README is a leaked key and not a description of one.
function namesAlgorithmOnly(finding) {
  return !finding.materialType;
}

// A line that is nothing but quoted strings and punctuation, which is how a
// table entry looks and never how a call looks.
const BARE_LITERALS = /^[\s([{]*(?:["'][^"']*["']\s*[,:]?\s*)+[)\]},;]*$/;

// A name bound to a collection of string literals. const VERSIONS = ['TLSv1',
// 'TLSv1.1'] is a list of things to try, not a protocol being configured.
const LITERAL_COLLECTION = /[=:]\s*[[({]\s*(?:["'][^"']*["']\s*,?\s*){2,}[\])}]/;

// A command that deliberately offers weak cryptography to find out whether the
// far end accepts it. The weak names are the probe, not the configuration.
const PROBE_COMMAND = /\b(?:s_client|s_server|testssl|sslscan|sslyze|nmap|--ciphers?\b|-cipher\b)/;

// A quoted string of three or more words is prose. 'RC4 keystream bias.' is a
// sentence about RC4. Cipher names and suite strings carry no spaces, so this
// does not reach them.
const PROSE_STRING = /["'][^"']*\s[^"']*\s[^"']*["']/;

function markCatalogueLines(findings, lines = []) {
  // Distinct algorithms named per line, so a block can be summed.
  const perLine = new Map();
  const perFile = new Map();
  for (const finding of findings) {
    const name = finding.algorithm || finding.mode || finding.protocol;
    if (!name) continue;
    const key = `${finding.file}:${finding.line}`;
    if (!perLine.has(key)) perLine.set(key, new Set());
    perLine.get(key).add(name);
    if (!perFile.has(finding.file)) perFile.set(finding.file, new Set());
    perFile.get(finding.file).add(name);
  }

  for (const finding of findings) {
    if (finding.context) continue;
    const names = new Set();
    for (let offset = -CATALOGUE_SPAN; offset <= CATALOGUE_SPAN; offset += 1) {
      for (const name of perLine.get(`${finding.file}:${finding.line + offset}`) || []) {
        names.add(name);
      }
    }
    const source = lines[finding.line - 1] || '';
    if (isConfig(finding.file) && !PROBE_COMMAND.test(source)) continue;
    if (CIPHER_STRING.test(source) && !PROBE_COMMAND.test(source)) continue;

    if ((perFile.get(finding.file) || new Set()).size >= CATALOGUE_FILE_MIN && namesAlgorithmOnly(finding)) {
      finding.context = 'catalogue';
      continue;
    }

    if (DOC_EXT.has(path.extname(finding.file).toLowerCase()) && namesAlgorithmOnly(finding)) {
      finding.context = 'documentation';
      continue;
    }

    // Key material is never downgraded for being in a comment, because a key
    // pasted above the code that used to use it is still a leaked key.
    if (namesAlgorithmOnly(finding) && inComment(source, (finding.column || 1) - 1, finding.file)) {
      finding.context = 'comment';
      continue;
    }

    const talkingAbout = namesAlgorithmOnly(finding)
      && (REGEX_LITERAL.test(source) || LITERAL_COLLECTION.test(source)
        || PROSE_STRING.test(source) || PROBE_COMMAND.test(source));

    if (names.size >= CATALOGUE_MIN || DISCUSSING.test(source) || BARE_LITERALS.test(source) || talkingAbout) {
      finding.context = 'catalogue';
    }
  }
  return findings;
}

const DOWNGRADE = { critical: 'low', high: 'low', medium: 'info', low: 'info', info: 'info' };

const CONTEXT_NOTE = {
  test: 'Found in test code, so it may be an assertion rather than a use.',
  fixture: 'Found in a file that names itself as deliberately insecure.',
  catalogue: 'The line names several algorithms at once, so it reads as a list about cryptography rather than a use of it.',
  documentation: 'Found in prose rather than in code. Key material would still be reported in full.',
  comment: 'Named in a comment rather than called. Key material would still be reported in full.'
};

// Severity is reduced rather than removed. A real key committed to a test
// fixture is still a real key.
export function applyContext(findings, options = {}, lines = []) {
  markCatalogueLines(findings, lines);
  for (const finding of findings) {
    if (!finding.context) continue;
    if (options.strict) continue;
    finding.originalSeverity = finding.severity;
    finding.severity = DOWNGRADE[finding.severity] || 'info';
    finding.contextNote = CONTEXT_NOTE[finding.context];
  }
  return findings;
}

export function scanLine(line, rule, context) {
  if (line.length > MAX_LINE) line = line.slice(0, MAX_LINE);
  const match = rule.pattern.exec(line);
  if (!match) return null;
  const around = context === undefined ? line : context;
  if (rule.require && !rule.require.test(around)) return null;
  // Rejection stays on the matched line, because a placeholder two lines away
  // does not make this line safe. The exception is a rule whose evidence spans
  // lines by nature: a PEM block's body, and so its placeholder, is never on
  // the header line that matched.
  const rejectScope = rule.rejectInContext ? around : line;
  if (rule.reject && rule.reject.test(rejectScope)) return null;
  return match;
}

function windowAround(lines, index, radius = CONTEXT_LINES) {
  return lines.slice(Math.max(0, index - radius), index + radius + 1).join('\n');
}

export function scanText(text, file, options = {}) {
  const findings = [];
  const pathContext = classifyPath(file);
  const lines = text.split(/\r?\n/);
  const seen = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    const line = raw.length > MAX_LINE ? raw.slice(0, MAX_LINE) : raw;
    const context = windowAround(lines, i);

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      const match = scanLine(line, rule, context);
      if (!match) continue;

      let severity = rule.severity;
      let title = rule.title;
      let algorithm = rule.algorithm;
      let detail = '';
      let bits = null;

      if (rule.sizeAware) {
        bits = modulusOnLine(line) || modulusOnLine(context);
        if (bits) {
          const grade = gradeModulus(bits);
          severity = grade.severity;
          detail = `modulus ${bits} bits`;
        }
      }

      if (rule.iterationAware) {
        const iterations = iterationsOnLine(line) ?? iterationsOnLine(context);
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
        context: pathContext,
        line: i + 1,
        column: match.index + 1,
        bits,
        detail,
        evidence: options.redactEvidence === false ? line.trim().slice(0, 200) : summarise(line, match)
      });
    }
  }
  return applyContext(findings, options, lines);
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
  let ignored = 0;
  const manifests = [];
  const certFiles = [];
  const signals = { ci: false, ciCryptoInventory: false, baseline: false, codeowners: false, securityPolicy: false };
  const ignoreRules = options.ignoreFile === false ? [] : loadIgnore(root);

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
    if (isManifest(file)) manifests.push(file);
    if (looksLikeCertificate(file)) certFiles.push(file);
    recordSignal(signals, root, file);
    if (isLockfile(file) && options.lockfiles !== true) {
      skipped += 1;
      continue;
    }
    if (isOwnOutput(file)) {
      skipped += 1;
      continue;
    }
    if (ignoreRules.length && isIgnored(path.relative(root, file), ignoreRules)) {
      ignored += 1;
      continue;
    }
    scanned += 1;
    const relative = path.relative(root, file) || path.basename(file);
    findings.push(...scanText(text, relative, options));
  }

  // Certificates are parsed rather than pattern matched, so a signature
  // algorithm and an expiry date are read from the DER rather than guessed.
  const certificates = [];
  const certFindings = [];
  if (options.certificates !== false) {
    for (const file of certFiles) {
      const relative = path.relative(root, file) || path.basename(file);
      const graded = gradeCertificateFile(file, relative);
      certificates.push(...graded.described);
      certFindings.push(...graded.findings);
    }
  }

  // Manifests are read structurally rather than line by line, and their
  // findings join the same list so one gate, one report and one CBOM cover the
  // whole estate instead of two half pictures.
  const deps = options.dependencies === false
    ? { dependencies: [], findings: [], manifests: [] }
    : scanDependencies(manifests.map((file) => ({ toString: () => file, valueOf: () => file })).map(String));
  const allFindings = findings.concat(certFindings).concat(
    deps.findings.map((finding) => Object.assign(finding, {
      file: path.relative(root, finding.file) || path.basename(finding.file)
    }))
  );

  return {
    target: path.resolve(root),
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    filesFound: files.length,
    filesScanned: scanned,
    filesSkipped: skipped,
    filesIgnored: ignored,
    manifestsRead: manifests.length,
    dependenciesRead: deps.dependencies.length,
    certificatesRead: certificates.length,
    signals,
    ignoreRules: ignoreRules.map((r) => r.pattern),
    findings: allFindings,
    dependencies: deps.dependencies,
    certificates,
    assets: inventory(allFindings)
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

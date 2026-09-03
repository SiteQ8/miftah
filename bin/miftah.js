#!/usr/bin/env node
// Miftah command line.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { scanTree, countBySeverity } from '../src/scan.js';
import { inspectPath } from '../src/certs.js';
import { probe as probeTls } from '../src/tls.js';
import { probeSsh } from '../src/ssh.js';
import { buildCbom, validateCbom } from '../src/cbom.js';
import { scoreEstate, DEFAULT_PROFILE } from '../src/risk.js';
import { buildRoadmap } from '../src/roadmap.js';
import { runChecklist } from '../src/agility.js';
import { assemble, toMarkdown, toHtml } from '../src/report.js';
import { buildConsole } from '../src/console.js';
import { SEVERITY_WEIGHT } from '../src/rules.js';
import { VERSION } from '../src/index.js';

const COLOUR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (COLOUR ? `\u001b[${code}m${text}\u001b[0m` : text);
const bold = (text) => paint('1', text);
const dim = (text) => paint('2', text);
const red = (text) => paint('31', text);
const amber = (text) => paint('33', text);
const green = (text) => paint('32', text);
const cyan = (text) => paint('36', text);

const SEVERITY_PAINT = {
  critical: red,
  high: red,
  medium: amber,
  low: dim,
  info: green
};

const USAGE = `miftah ${VERSION}
Cryptographic inventory and post quantum readiness.

Usage
  miftah scan <path>              Read a code and config tree
  miftah cert <path>              Inspect a certificate, or a directory of them
  miftah tls <host:port>          Probe a live TLS endpoint
  miftah ssh <host:port>          Probe a live SSH endpoint
  miftah cbom <scan.json>         Emit CycloneDX 1.6 from a saved scan
  miftah risk <scan.json>         Score quantum risk from a saved scan
  miftah roadmap <scan.json>      Sequence the migration from a saved scan
  miftah checklist [scan.json]    Run the crypto agility checklist
  miftah report <scan.json>       Write a Markdown or HTML report
  miftah console [scan.json]      Build the interactive console page

Options
  --json <file>        Write the raw result as JSON
  --cbom <file>        Write a CycloneDX 1.6 CBOM
  --md <file>          Write a Markdown report
  --html <file>        Write an HTML report
  --out <file>         Output path for cbom, report and console
  --lang <en|ar>       Report language, default en
  --shelf-life <n>     Years the data must stay secret, default ${DEFAULT_PROFILE.shelfLife}
  --migration <n>      Years the migration takes, default ${DEFAULT_PROFILE.migrationYears}
  --horizon <year>     Year a relevant quantum computer is assumed, default ${DEFAULT_PROFILE.crqcYear}
  --exposure <kind>    internet, partner, internal or airgapped
  --certs <path>       Fold certificates into a scan
  --endpoint <h:p>     Fold a live TLS probe into a scan, repeatable
  --fail-on <level>    Exit non zero at or above this severity
  --exclude <dir>      Skip a directory, repeatable
  --quiet              Suppress the console summary
  --version            Print the version
  --help               Print this text

Examples
  miftah scan . --cbom cbom.json --md CRYPTO.md --fail-on high
  miftah scan ./service --endpoint api.example.com:443 --html report.html
  miftah tls example.com:443 --json tls.json
  miftah console scan.json --out console.html
`;

function parseArgs(argv) {
  const options = { _: [], exclude: [], endpoint: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const takesValue = ![
      'quiet', 'help', 'version', 'no-color', 'validate', 'redact'
    ].includes(name);
    if (!takesValue) {
      options[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      options[name] = true;
      continue;
    }
    i += 1;
    if (name === 'exclude' || name === 'endpoint') options[name].push(value);
    else options[name] = value;
  }
  return options;
}

function profileFrom(options) {
  return {
    shelfLife: options['shelf-life'] !== undefined ? Number(options['shelf-life']) : DEFAULT_PROFILE.shelfLife,
    migrationYears: options.migration !== undefined ? Number(options.migration) : DEFAULT_PROFILE.migrationYears,
    crqcYear: options.horizon !== undefined ? Number(options.horizon) : DEFAULT_PROFILE.crqcYear,
    exposure: options.exposure || DEFAULT_PROFILE.exposure
  };
}

function write(file, contents) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}

function readScan(file) {
  if (!file) throw new Error('A saved scan is required. Run miftah scan <path> --json scan.json first.');
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error(`No such file: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function bar(value, width = 24) {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * width);
  return `${'#'.repeat(filled)}${'.'.repeat(width - filled)}`;
}

function printSummary(scan, profile) {
  const estate = scoreEstate(scan.assets || [], profile);
  const counts = countBySeverity(scan.findings || []);
  const mosca = estate.mosca;

  process.stdout.write('\n');
  process.stdout.write(`${bold('Miftah')} ${dim(`v${VERSION}`)}  ${dim(scan.target || '')}\n`);
  process.stdout.write(`${dim('-'.repeat(64))}\n`);
  if (scan.filesScanned !== undefined) {
    process.stdout.write(`  Files read           ${scan.filesScanned}\n`);
  }
  process.stdout.write(`  Cryptographic assets ${estate.counts.assets}\n`);
  process.stdout.write(`  Findings             ${(scan.findings || []).length}  `);
  process.stdout.write(
    `${red(`critical ${counts.critical}`)}  ${red(`high ${counts.high}`)}  ` +
    `${amber(`medium ${counts.medium}`)}  ${dim(`low ${counts.low}`)}  ${green(`info ${counts.info}`)}\n`
  );
  process.stdout.write(`${dim('-'.repeat(64))}\n`);
  const readinessPaint = estate.readiness >= 70 ? green : estate.readiness >= 35 ? amber : red;
  process.stdout.write(`  Readiness  ${readinessPaint(bar(estate.readiness))} ${readinessPaint(`${estate.readiness}/100`)}\n`);
  process.stdout.write(`  Quantum    ${red(`broken ${estate.counts.quantumBroken}`)}  ${amber(`weakened ${estate.counts.quantumWeakened}`)}  ${green(`resistant ${estate.counts.quantumResistant}`)}\n`);
  process.stdout.write(`${dim('-'.repeat(64))}\n`);
  process.stdout.write(`  ${bold('Mosca')}  shelf life ${mosca.shelfLife}y + migration ${mosca.migrationYears}y vs horizon ${mosca.yearsToHorizon}y\n`);
  process.stdout.write(
    mosca.breached
      ? `  ${red(`Exposed by ${mosca.deficit} years.`)} Traffic recorded today is readable before the data stops mattering.\n`
      : `  ${green(`Inside the horizon by ${Math.abs(mosca.deficit)} years.`)} The margin shrinks every year the migration waits.\n`
  );

  const top = estate.assets.slice(0, 8);
  if (top.length) {
    process.stdout.write(`${dim('-'.repeat(64))}\n`);
    process.stdout.write(`  ${bold('Highest risk assets')}\n`);
    for (const asset of top) {
      const painter = SEVERITY_PAINT[asset.band] || dim;
      process.stdout.write(
        `    ${painter(String(asset.score).padStart(3))}  ${asset.name.padEnd(30)} ${dim(plural(asset.occurrences, 'use'))}` +
        `${asset.replacement ? dim(`  -> ${asset.replacement}`) : ''}\n`
      );
    }
  }
  process.stdout.write('\n');
  return estate;
}

function failLevel(scan, level) {
  if (!level || level === true) return 0;
  const threshold = SEVERITY_WEIGHT[level];
  if (threshold === undefined) return 0;
  const hit = (scan.findings || []).filter((f) => (SEVERITY_WEIGHT[f.severity] || 0) >= threshold);
  return hit.length ? 1 : 0;
}

async function commandScan(options) {
  const target = options._[1] || '.';
  if (!fs.existsSync(target)) throw new Error(`No such path: ${target}`);

  const scan = scanTree(target, { exclude: options.exclude, redactEvidence: options.redact !== false });
  scan.version = VERSION;

  if (options.certs) {
    scan.certificates = inspectPath(options.certs);
    for (const cert of scan.certificates) {
      if (cert.error || cert.severity === 'info' || cert.severity === 'low') continue;
      scan.findings.push({
        rule: 'MFT-X002',
        title: `Certificate signed with ${cert.signatureAlgorithm}`,
        severity: cert.severity,
        classical: cert.signature.classical,
        quantum: cert.quantum,
        advice: cert.signature.advice,
        file: cert.source,
        line: 0,
        detail: `${cert.publicKey.name}, expires in ${cert.daysLeft} days`
      });
    }
  }

  if (options.endpoint.length) {
    scan.endpoints = [];
    for (const endpoint of options.endpoint) {
      const result = await probeTls(endpoint);
      scan.endpoints.push(result);
      scan.findings.push(...result.findings);
      if (!scan.certificates) scan.certificates = [];
      scan.certificates.push(...result.chain.filter((c) => c && !c.error));
    }
  }

  // Findings gathered after the tree walk still belong in the inventory.
  if (options.certs || options.endpoint.length) {
    const { inventory } = await import('../src/scan.js');
    scan.assets = inventory(scan.findings);
  }

  emit(scan, options);
  if (!options.quiet) printSummary(scan, profileFrom(options));
  return failLevel(scan, options['fail-on']);
}

function emit(scan, options) {
  const profile = profileFrom(options);
  const written = [];

  if (options.json && options.json !== true) written.push(write(options.json, `${JSON.stringify(scan, null, 2)}\n`));

  if (options.cbom && options.cbom !== true) {
    const bom = buildCbom(scan, { version: VERSION });
    const check = validateCbom(bom);
    if (!check.valid) {
      process.stderr.write(`${red('CBOM failed validation:')}\n${check.errors.map((e) => `  ${e}`).join('\n')}\n`);
    }
    written.push(write(options.cbom, `${JSON.stringify(bom, null, 2)}\n`));
  }

  const model = assemble(scan, profile);
  const locale = options.lang === 'ar' ? 'ar' : 'en';
  if (options.md && options.md !== true) written.push(write(options.md, toMarkdown(model, locale)));
  if (options.html && options.html !== true) written.push(write(options.html, toHtml(model, locale)));

  if (written.length && !options.quiet) {
    for (const file of written) process.stdout.write(`${cyan('wrote')} ${path.relative(process.cwd(), file)}\n`);
  }
}

async function commandCert(options) {
  const target = options._[1];
  if (!target) throw new Error('Give a certificate file or a directory.');
  const results = inspectPath(target);
  if (options.json && options.json !== true) write(options.json, `${JSON.stringify(results, null, 2)}\n`);
  if (options.quiet) return 0;

  for (const cert of results) {
    if (cert.error) {
      process.stdout.write(`${red('unreadable')} ${cert.source}: ${cert.error}\n`);
      continue;
    }
    const painter = SEVERITY_PAINT[cert.severity] || dim;
    process.stdout.write(`\n${bold(cert.subject.split('\n')[0])}\n`);
    process.stdout.write(`  issuer     ${cert.issuer.split('\n')[0]}\n`);
    process.stdout.write(`  signature  ${cert.signatureAlgorithm} ${painter(`(${cert.signature.classical})`)}\n`);
    process.stdout.write(`  key        ${cert.publicKey.name}\n`);
    process.stdout.write(`  expires    ${cert.validTo.slice(0, 10)} ${dim(`${cert.daysLeft} days`)}\n`);
    process.stdout.write(`  quantum    ${cert.quantum === 'resistant' ? green(cert.quantum) : red(cert.quantum)}\n`);
    process.stdout.write(`  ${dim(cert.publicKey.advice)}\n`);
  }
  process.stdout.write('\n');
  return results.some((c) => c.severity === 'critical') ? 1 : 0;
}

async function commandTls(options) {
  const endpoint = options._[1];
  if (!endpoint) throw new Error('Give an endpoint as host:port.');
  const result = await probeTls(endpoint, { timeout: Number(options.timeout) || 7000 });
  if (options.json && options.json !== true) write(options.json, `${JSON.stringify(result, null, 2)}\n`);
  if (options.quiet) return 0;

  process.stdout.write(`\n${bold(result.endpoint)}\n`);
  if (!result.reachable) {
    process.stdout.write(`  ${red('no TLS handshake completed')}\n\n`);
    return 1;
  }
  for (const version of result.versions) {
    const label = version.version.padEnd(8);
    if (!version.supported) {
      process.stdout.write(`  ${label} ${dim('refused')} ${dim(version.error || '')}\n`);
      continue;
    }
    const painter = version.version === 'TLSv1.3' ? green : version.version === 'TLSv1.2' ? amber : red;
    process.stdout.write(`  ${label} ${painter('accepted')}  ${version.cipher || ''}  ${dim(version.group || '')}\n`);
  }
  if (result.negotiated) {
    process.stdout.write(`\n  negotiated ${bold(result.negotiated.version)} ${result.negotiated.cipher}\n`);
    process.stdout.write(`  group      ${result.negotiated.group || 'not reported'}\n`);
  }
  const leaf = result.chain[0];
  if (leaf && !leaf.error) {
    process.stdout.write(`  leaf       ${leaf.publicKey.name}, ${leaf.signatureAlgorithm}, ${leaf.daysLeft} days left\n`);
  }
  process.stdout.write('\n');
  for (const finding of result.findings.filter((f) => f.severity !== 'info')) {
    const painter = SEVERITY_PAINT[finding.severity] || dim;
    process.stdout.write(`  ${painter(finding.severity.padEnd(8))} ${finding.title}\n    ${dim(finding.advice)}\n`);
  }
  process.stdout.write('\n');
  return failLevel(result, options['fail-on']);
}

async function commandSsh(options) {
  const endpoint = options._[1];
  if (!endpoint) throw new Error('Give an endpoint as host:port.');
  const result = await probeSsh(endpoint, { timeout: Number(options.timeout) || 7000 });
  if (options.json && options.json !== true) write(options.json, `${JSON.stringify(result, null, 2)}\n`);
  if (options.quiet) return 0;

  process.stdout.write(`\n${bold(result.endpoint)}\n`);
  if (!result.reachable) {
    process.stdout.write(`  ${red(result.error || 'unreachable')}\n\n`);
    return 1;
  }
  process.stdout.write(`  banner     ${result.banner}\n`);
  if (result.algorithms) {
    process.stdout.write(`  kex        ${result.algorithms.kex.slice(0, 4).join(', ')}\n`);
    process.stdout.write(`  host key   ${result.algorithms.hostKey.join(', ')}\n`);
    process.stdout.write(`  cipher     ${result.algorithms.cipherServerToClient.slice(0, 4).join(', ')}\n`);
  }
  process.stdout.write('\n');
  for (const finding of result.findings || []) {
    const painter = SEVERITY_PAINT[finding.severity] || dim;
    process.stdout.write(`  ${painter(finding.severity.padEnd(8))} ${finding.title}\n    ${dim(finding.advice)}\n`);
  }
  process.stdout.write('\n');
  return failLevel(result, options['fail-on']);
}

async function commandCbom(options) {
  const scan = readScan(options._[1]);
  const bom = buildCbom(scan, { version: VERSION });
  const check = validateCbom(bom);
  const out = options.out || options.cbom;
  const text = `${JSON.stringify(bom, null, 2)}\n`;
  if (out && out !== true) {
    write(out, text);
    if (!options.quiet) process.stdout.write(`${cyan('wrote')} ${out}  ${bom.components.length} components\n`);
  } else {
    process.stdout.write(text);
  }
  if (!check.valid) {
    process.stderr.write(`${red('validation errors')}\n${check.errors.map((e) => `  ${e}`).join('\n')}\n`);
    return 1;
  }
  return 0;
}

async function commandRisk(options) {
  const scan = readScan(options._[1]);
  const estate = scoreEstate(scan.assets || [], profileFrom(options));
  if (options.json && options.json !== true) write(options.json, `${JSON.stringify(estate, null, 2)}\n`);
  if (!options.quiet) printSummary(scan, profileFrom(options));
  return estate.peakRisk >= 75 ? 1 : 0;
}

async function commandRoadmap(options) {
  const scan = readScan(options._[1]);
  const roadmap = buildRoadmap(scan, profileFrom(options));
  if (options.json && options.json !== true) write(options.json, `${JSON.stringify(roadmap, null, 2)}\n`);
  if (options.quiet) return 0;

  process.stdout.write(`\n${bold('Migration roadmap')}  ${dim(`readiness ${roadmap.readiness}/100`)}\n\n`);
  process.stdout.write(`${bold('Priority actions')}\n`);
  for (const [index, action] of roadmap.actions.entries()) {
    process.stdout.write(`  ${index + 1}. ${action.action}\n     ${dim(action.detail)}\n`);
  }
  for (const wave of roadmap.waves) {
    process.stdout.write(`\n${bold(`Wave ${wave.id}. ${wave.name}`)}  ${dim(`(${wave.window})`)}\n`);
    process.stdout.write(`  ${dim(wave.goal)}\n`);
    if (!wave.items.length) {
      process.stdout.write(`  ${dim('nothing in this wave')}\n`);
      continue;
    }
    for (const item of wave.items) {
      const painter = SEVERITY_PAINT[item.band] || dim;
      process.stdout.write(`  ${painter(String(item.risk).padStart(3))}  ${item.from.padEnd(30)} ${dim('->')} ${item.to}\n${' '.repeat(7)}${dim(`${plural(item.occurrences, 'use')}, ${item.effort} effort`)}\n`);
    }
  }
  process.stdout.write('\n');
  return 0;
}

async function commandChecklist(options) {
  const scan = options._[1] ? readScan(options._[1]) : { findings: [], assets: [] };
  const result = runChecklist(scan);
  if (options.json && options.json !== true) write(options.json, `${JSON.stringify(result, null, 2)}\n`);
  if (options.quiet) return 0;

  const painter = { pass: green, fail: red, partial: amber, manual: dim };
  process.stdout.write(`\n${bold('Crypto agility')}  ${dim(`${result.score}/100 across ${result.scorable} scorable checks`)}\n\n`);
  for (const check of result.results) {
    process.stdout.write(`  ${painter[check.status](check.status.padEnd(8))} ${check.title}\n`);
    if (check.detail) process.stdout.write(`           ${dim(check.detail)}\n`);
  }
  process.stdout.write('\n');
  return result.counts.fail > 0 ? 1 : 0;
}

async function commandReport(options) {
  const scan = readScan(options._[1]);
  const model = assemble(scan, profileFrom(options));
  const locale = options.lang === 'ar' ? 'ar' : 'en';
  const out = options.out;

  if (options.md && options.md !== true) write(options.md, toMarkdown(model, locale));
  if (options.html && options.html !== true) write(options.html, toHtml(model, locale));
  if (out && out !== true) {
    write(out, out.endsWith('.html') ? toHtml(model, locale) : toMarkdown(model, locale));
  }
  if (!options.md && !options.html && !out) {
    process.stdout.write(toMarkdown(model, locale));
    return 0;
  }
  if (!options.quiet) process.stdout.write(`${cyan('wrote')} report in ${locale}\n`);
  return 0;
}

async function commandConsole(options) {
  const scan = options._[1] ? readScan(options._[1]) : null;
  const html = buildConsole(scan, { version: VERSION });
  const out = options.out || 'miftah-console.html';
  write(out, html);
  if (!options.quiet) process.stdout.write(`${cyan('wrote')} ${out}  ${dim('open it in a browser')}\n`);
  return 0;
}

const COMMANDS = {
  scan: commandScan,
  cert: commandCert,
  certs: commandCert,
  tls: commandTls,
  ssh: commandSsh,
  cbom: commandCbom,
  risk: commandRisk,
  roadmap: commandRoadmap,
  checklist: commandChecklist,
  agility: commandChecklist,
  report: commandReport,
  console: commandConsole
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const command = options._[0];
  if (!command || options.help) {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`${red(`Unknown command: ${command}`)}\n\n${USAGE}`);
    return 1;
  }
  return handler(options);
}

main()
  .then((code) => {
    process.exitCode = code || 0;
  })
  .catch((error) => {
    process.stderr.write(`${red('miftah:')} ${error.message}\n`);
    process.exitCode = 2;
  });

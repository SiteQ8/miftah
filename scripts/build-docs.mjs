// Builds the published site from the tool's own output, so the page can never
// drift from what the tool actually produces.
import fs from 'node:fs';
import path from 'node:path';

import { scanTree } from '../src/scan.js';
import { moscaDeficit, scoreEstate } from '../src/risk.js';
import { horizonStrip, compositionBar, PALETTE, FONT } from '../src/timeline.js';
import { buildConsole } from '../src/console.js';
import { assemble, toHtml, toMarkdown } from '../src/report.js';
import { buildCbom } from '../src/cbom.js';
import { VERSION } from '../src/index.js';

const ROOT = path.join(import.meta.dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const MEDIA = path.join(DOCS, 'media');
fs.mkdirSync(MEDIA, { recursive: true });

const scan = scanTree(path.join(ROOT, 'examples', 'sample-estate'));
const profile = { shelfLife: 10, migrationYears: 5, crqcYear: 2033, exposure: 'internet' };
const mosca = moscaDeficit(profile);
const estate = scoreEstate(scan.assets, profile);

// ------------------------------------------------------------------ media
fs.writeFileSync(path.join(MEDIA, 'horizon-breached.svg'), horizonStrip(mosca));
fs.writeFileSync(
  path.join(MEDIA, 'horizon-clear.svg'),
  horizonStrip(moscaDeficit({ shelfLife: 3, migrationYears: 2, crqcYear: 2045 }))
);
fs.writeFileSync(
  path.join(MEDIA, 'horizon-rtl.svg'),
  horizonStrip(mosca, {
    rtl: true,
    yearWord: 'سنة',
    labels: {
      migration: 'مدة الانتقال',
      shelf: 'مدة سرية البيانات',
      horizon: 'الأفق الكمي',
      exposed: 'نافذة الانكشاف',
      today: 'اليوم'
    }
  })
);
fs.writeFileSync(path.join(MEDIA, 'composition.svg'), compositionBar(estate.counts));

// ---------------------------------------------------------------- artefacts
fs.writeFileSync(path.join(DOCS, 'console.html'), buildConsole(scan));
fs.writeFileSync(path.join(DOCS, 'sample-scan.json'), JSON.stringify(scan, null, 2));
fs.writeFileSync(path.join(DOCS, 'sample-cbom.json'), JSON.stringify(buildCbom(scan, { profile }), null, 2));

const report = assemble(scan, profile);
for (const locale of ['en', 'ar']) {
  fs.writeFileSync(path.join(DOCS, `sample-report-${locale}.html`), toHtml(report, locale));
  fs.writeFileSync(path.join(DOCS, `sample-report-${locale}.md`), toMarkdown(report, locale));
}

// --------------------------------------------------------------- the page
const hero = horizonStrip(mosca, { width: 960, height: 250 });
const counts = estate.counts;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Miftah, cryptographic inventory and post quantum readiness</title>
<meta name="description" content="Miftah reads a code tree, certificates and live endpoints, writes a CycloneDX 1.6 CBOM, and scores post quantum exposure using Mosca's inequality.">
<style>
  :root {
    --ink: ${PALETTE.ink};
    --muted: ${PALETTE.muted};
    --rule: ${PALETTE.rule};
    --paper: ${PALETTE.paper};
    --brass: ${PALETTE.brass};
    --broken: ${PALETTE.broken};
    --resistant: ${PALETTE.resistant};
    --weakened: ${PALETTE.weakened};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: ${FONT};
    font-size: 17px;
    line-height: 1.62;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 0 24px; }
  header { padding: 84px 0 32px; }
  h1 { font-size: 46px; margin: 0 0 4px; letter-spacing: -0.01em; font-weight: 600; }
  .arabic { font-family: 'Noto Naskh Arabic', Amiri, serif; color: var(--brass); font-size: 30px; }
  .tagline { font-size: 21px; color: var(--muted); margin: 12px 0 0; max-width: 46em; }
  .rule { height: 1px; background: var(--rule); border: 0; margin: 48px 0; }
  h2 { font-size: 25px; margin: 0 0 14px; font-weight: 600; }
  h3 { font-size: 18px; margin: 30px 0 8px; font-weight: 600; }
  p { margin: 0 0 16px; }
  a { color: var(--brass); }
  figure { margin: 28px 0; }
  figure svg { width: 100%; height: auto; display: block; }
  figcaption { color: var(--muted); font-size: 15px; margin-top: 8px; }
  pre {
    background: #fff;
    border: 1px solid var(--rule);
    border-left: 3px solid var(--brass);
    padding: 14px 18px;
    overflow-x: auto;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 14.5px;
    line-height: 1.55;
  }
  code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.93em; }
  p code, li code, td code { background: #fff; border: 1px solid var(--rule); padding: 1px 5px; }
  .cta { display: flex; gap: 12px; flex-wrap: wrap; margin: 30px 0 0; }
  .cta a {
    display: inline-block; padding: 11px 20px; text-decoration: none;
    border: 1px solid var(--ink); color: var(--ink); font-size: 16px;
  }
  .cta a.primary { background: var(--ink); color: var(--paper); }
  .stats { display: flex; flex-wrap: wrap; gap: 34px; margin: 26px 0 0; }
  .stat-value { font-size: 32px; font-weight: 600; line-height: 1.1; }
  .stat-label { color: var(--muted); font-size: 14px; }
  .broken { color: var(--broken); }
  .weakened { color: var(--weakened); }
  .resistant { color: var(--resistant); }
  table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 16px; }
  th, td { text-align: left; padding: 9px 12px 9px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 14px; }
  blockquote {
    margin: 22px 0; padding: 4px 0 4px 20px;
    border-left: 3px solid var(--brass); color: var(--ink); font-size: 19px;
  }
  footer { color: var(--muted); font-size: 15px; padding: 20px 0 70px; }
  @media (max-width: 620px) {
    h1 { font-size: 34px; }
    header { padding-top: 52px; }
    body { font-size: 16px; }
  }
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>Miftah <span class="arabic">مفتاح</span></h1>
  <p class="tagline">Cryptographic inventory and post quantum readiness. Reads your code, your certificates and your live endpoints, then tells you what a quantum computer breaks and in what order to fix it.</p>
  <div class="cta">
    <a class="primary" href="console.html">Open the console</a>
    <a href="https://github.com/SiteQ8/miftah">Source on GitHub</a>
    <a href="sample-report-en.html">Sample report</a>
  </div>
</header>

<pre>npx github:SiteQ8/miftah scan .</pre>

<hr class="rule">

<h2>The argument</h2>
<p>Advice about quantum computers is usually a date argument, and dates are easy to dismiss. Mosca's inequality turns it into arithmetic:</p>

<blockquote>If <strong>x</strong>, the years your data must stay secret, plus <strong>y</strong>, the years your migration takes, is greater than <strong>z</strong>, the years until a capable quantum computer exists, then you are already late.</blockquote>

<p>You do not get to start migrating when the machine is announced. You had to have finished by then, and the traffic you encrypted years earlier is already sitting in somebody's archive waiting for it. That is harvest now, decrypt later, and it is why the inventory is worth building today rather than in 2031.</p>

<figure>
${hero}
<figcaption>Ten years of required secrecy plus a five year migration against a 2033 horizon. The shaded region is the part of your secrecy requirement that the horizon eats. Change any of the three numbers in the console and the picture changes with it.</figcaption>
</figure>

<hr class="rule">

<h2>Two verdicts, never one</h2>
<p>Every algorithm gets judged twice, because collapsing the two is how inventories end up misleading:</p>

<table>
<tr><th>Algorithm</th><th>Classically</th><th>Against a quantum computer</th></tr>
<tr><td>RSA-4096</td><td class="resistant">strong</td><td class="broken">broken</td></tr>
<tr><td>SHA-256</td><td class="resistant">strong</td><td class="weakened">weakened</td></tr>
<tr><td>AES-256</td><td class="resistant">strong</td><td class="resistant">resistant</td></tr>
<tr><td>MD5</td><td class="broken">broken</td><td class="broken">broken</td></tr>
</table>

<p>RSA-4096 is not a weak key, it is a doomed scheme. SHA-256 loses half its bits to Grover and still has 128 left, which is usually fine. MD5 does not need a quantum computer to hurt anyone, and that distinction is what wave 0 of the roadmap is built on.</p>

<hr class="rule">

<h2>What a scan looks like</h2>
<p>Run against the sample estate in the repository:</p>

<div class="stats">
  <div><div class="stat-value">${estate.readiness}</div><div class="stat-label">readiness out of 100</div></div>
  <div><div class="stat-value broken">${counts.quantumBroken}</div><div class="stat-label">quantum broken</div></div>
  <div><div class="stat-value weakened">${counts.quantumWeakened}</div><div class="stat-label">weakened</div></div>
  <div><div class="stat-value resistant">${counts.quantumResistant}</div><div class="stat-label">resistant</div></div>
  <div><div class="stat-value broken">${mosca.deficit}</div><div class="stat-label">years exposed</div></div>
</div>

<figure>
${compositionBar(counts, { width: 860 })}
<figcaption>The estate by quantum verdict. ${scan.findings.length} findings across ${scan.filesRead} files, reduced to ${scan.assets.length} distinct cryptographic assets.</figcaption>
</figure>

<p><a href="sample-report-en.html">Read the full report</a>, or <a href="sample-report-ar.html">the same report in Arabic</a> with a mirrored timeline. The machine readable inventory is <a href="sample-cbom.json">here</a>.</p>

<hr class="rule">

<h2>A CBOM you can actually use</h2>
<p>The inventory is written as <strong>CycloneDX 1.6</strong>, validated against the published schema, with every asset typed <code>cryptographic-asset</code> and carrying its registered OID, its CycloneDX primitive, its NIST security level where one applies, and <code>evidence.occurrences</code> pointing back at the file and line it came from.</p>
<p>It is a standard format on purpose. A cryptographic inventory that only one tool can read is another silo, and the point is to plug into the SBOM pipeline you already run.</p>

<pre>miftah scan . --cbom cbom.json --fail-on high</pre>

<hr class="rule">

<h2>What it looks at</h2>

<h3>Code and configuration</h3>
<p>Thirty rules covering broken hashes, legacy ciphers, ECB mode, undersized RSA and DH, static initialisation vectors, hard coded keys, weak randomness in a cryptographic context, low PBKDF2 iteration counts, deprecated TLS versions and disabled certificate verification. Post quantum algorithms are detected too, so the inventory records what is already right rather than only what is wrong.</p>

<h3>Certificates</h3>
<p>Signature algorithm read straight out of the DER, public key type, size and curve, and expiry. Graded on all three, worst one wins.</p>

<h3>The wire</h3>
<p>TLS is probed once per protocol version from 1.0 to 1.3, capturing the negotiated suite, the key exchange group and the chain. SSH is spoken at the transport layer to read the server KEXINIT, which judges key exchange, host key, cipher and MAC algorithms, and reports whether any post quantum key exchange is offered at all.</p>

<hr class="rule">

<h2>The roadmap</h2>
<p>Findings sort into five waves, because doing this in the wrong order is how the budget disappears.</p>

<table>
<tr><th>Wave</th><th></th><th>When</th></tr>
<tr><td>0</td><td>Stop the bleeding</td><td>now</td></tr>
<tr><td>1</td><td>Know and govern</td><td>0 to 6 months</td></tr>
<tr><td>2</td><td>Protect traffic in flight</td><td>3 to 12 months</td></tr>
<tr><td>3</td><td>Protect data at rest</td><td>9 to 24 months</td></tr>
<tr><td>4</td><td>Re root identity and signing</td><td>18 to 36 months</td></tr>
</table>

<p>Traffic comes before signatures deliberately. Recorded sessions are being harvested today, whereas a forged signature requires the machine to already exist.</p>

<hr class="rule">

<h2>Assumptions, drawn so you can argue with them</h2>
<p>The 2033 horizon is an assumption, not a prediction, which is why it is a dashed line rather than a number in a box. NIST IR 8547 sets 2030 for deprecating classical public key cryptography and 2035 for disallowing it; Miftah treats those as policy anchors rather than physics.</p>

<pre>miftah scan . --shelf-life 25 --migration 7 --horizon 2035 --exposure internal</pre>

<p>Medical records and legal archives justify a long shelf life. A session token justifies almost none. <code>--exposure airgapped</code> lowers the score but never to zero.</p>

<hr class="rule">

<h2>Zero dependencies</h2>
<p>Node built-ins only: <code>fs</code>, <code>net</code>, <code>tls</code>, <code>crypto</code>. Nothing is uploaded, nothing is phoned home, and the console is a single HTML file that works offline. A tool that reads your private keys should not have a dependency tree.</p>

<hr class="rule">

<footer>
  Miftah v${VERSION}. MIT licensed. Built by <a href="https://github.com/SiteQ8">Ali</a>.
</footer>

</div>
</body>
</html>
`;

fs.writeFileSync(path.join(DOCS, 'index.html'), page);
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');

console.log(`docs built. index ${page.length} bytes, console ${fs.statSync(path.join(DOCS, 'console.html')).size} bytes`);

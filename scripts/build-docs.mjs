// Builds the published site from the tool's own output, so the page can never
// drift from what the tool actually produces.
import fs from 'node:fs';
import path from 'node:path';

import { scanTree } from '../src/scan.js';
import { moscaDeficit, scoreEstate } from '../src/risk.js';
import { horizonStrip, compositionBar } from '../src/timeline.js';
import { THEME, SANS, MONO } from '../src/theme.js';
import { buildConsole } from '../src/console.js';
import { assemble, toHtml, toMarkdown } from '../src/report.js';
import { buildCbom } from '../src/cbom.js';
import { RULES } from '../src/rules.js';
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
const hero = horizonStrip(mosca, { theme: 'dark', width: 1000, height: 210 });
const counts = estate.counts;
const worst = [...estate.assets].sort((a, b) => b.score - a.score).slice(0, 6);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Miftah, cryptographic inventory and post quantum readiness</title>
<meta name="description" content="Miftah reads a code tree, certificates and live endpoints, writes a CycloneDX 1.6 CBOM, and scores post quantum exposure using Mosca inequality.">
<style>
  :root {
    --vault: ${THEME.vault};
    --vault-raised: ${THEME.vaultRaised};
    --vault-line: ${THEME.vaultLine};
    --paper: ${THEME.paper};
    --paper-raised: ${THEME.paperRaised};
    --paper-line: ${THEME.paperLine};
    --ink: ${THEME.ink};
    --slate: ${THEME.slate};
    --on-vault: ${THEME.onVault};
    --on-vault-dim: ${THEME.onVaultDim};
    --signal: ${THEME.signal};
    --live: ${THEME.live};
    --alarm: ${THEME.alarm};
    --steel: ${THEME.steel};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: ${SANS};
    font-size: 16px;
    line-height: 1.6;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }
  code, pre { font-family: ${MONO}; }

  .vault { background: var(--vault); color: var(--on-vault); padding: 0 32px 56px; }
  .inner { max-width: 1060px; margin: 0 auto; }

  .bar { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; padding: 22px 0 46px; }
  .brand { display: flex; align-items: baseline; }
  .wordmark { font-size: 20px; font-weight: 600; letter-spacing: 0.02em; margin-right: 12px; }
  .wordmark-ar { font-size: 20px; color: var(--signal); }
  .bar nav a { color: var(--on-vault-dim); text-decoration: none; font-size: 15px; margin-left: 22px; }
  .bar nav a:hover { color: var(--signal); }

  .readout { display: flex; align-items: baseline; flex-wrap: wrap; }
  .huge {
    font-size: 130px;
    font-size: clamp(72px, 15vw, 168px);
    font-weight: 300;
    line-height: 0.84;
    letter-spacing: -0.04em;
    color: var(--signal);
    margin-right: 20px;
  }
  .huge-unit { font-size: 19px; color: var(--on-vault-dim); }

  .claim { font-size: 21px; line-height: 1.45; max-width: 34ch; margin: 26px 0 0; color: var(--on-vault); }
  .hero-figure { margin: 34px 0 0; }
  .hero-figure svg { display: block; width: 100%; height: auto; }
  .hero-note { margin: 14px 0 0; font-size: 14px; color: var(--on-vault-dim); max-width: 70ch; }

  .cta { display: flex; flex-wrap: wrap; margin: 40px 0 0; }
  .cta a {
    display: inline-block; padding: 12px 22px; text-decoration: none; font-size: 16px;
    border: 1px solid var(--vault-line); color: var(--on-vault); margin-right: 10px; margin-bottom: 10px;
  }
  .cta a.primary { background: var(--signal); border-color: var(--signal); color: var(--vault); font-weight: 600; }
  .cta a:hover { border-color: var(--signal); }

  .install { margin: 34px 0 0; padding: 16px 20px; background: var(--vault-raised); border-left: 3px solid var(--signal); font-size: 15px; overflow-x: auto; }
  .install span { color: var(--signal); }

  main { padding: 72px 32px 90px; }
  section { margin-bottom: 76px; }
  h2 { font-size: 30px; font-weight: 600; letter-spacing: -0.015em; margin: 0 0 16px; }
  h3 { font-size: 18px; font-weight: 600; margin: 30px 0 6px; }
  p { margin: 0 0 16px; max-width: 70ch; }
  a { color: ${THEME.alarmDeep}; }
  .lede { font-size: 19px; color: var(--slate); max-width: 64ch; }

  .rule-quote {
    margin: 28px 0; padding: 22px 26px;
    background: var(--paper-raised); border-left: 4px solid var(--signal);
    font-size: 19px; line-height: 1.5; max-width: 66ch;
  }

  table { width: 100%; border-collapse: collapse; margin: 20px 0; max-width: 760px; }
  th { text-align: left; font-size: 12px; font-weight: 600; color: var(--slate); padding: 0 16px 10px 0; border-bottom: 1px solid var(--paper-line); }
  td { padding: 13px 16px 13px 0; border-bottom: 1px solid var(--paper-line); }
  .chip { display: inline-block; padding: 3px 9px; font-size: 12px; font-weight: 600; color: #fff; }
  .broken { background: var(--alarm); }
  .weakened { background: var(--signal); color: var(--vault); }
  .resistant { background: var(--live); color: var(--vault); }

  .composition { max-width: 860px; margin: 26px 0 0; }
  .composition svg { display: block; width: 100%; height: auto; }

  pre { background: var(--paper-raised); border-left: 3px solid var(--paper-line); padding: 15px 18px; overflow-x: auto; font-size: 14px; max-width: 760px; }
  p code, td code, li code { background: var(--paper-raised); border: 1px solid var(--paper-line); padding: 1px 5px; font-size: 0.9em; }

  .waves { max-width: 760px; }
  .wave-row { display: flex; align-items: baseline; padding: 13px 0; border-bottom: 1px solid var(--paper-line); }
  .wave-n { width: 34px; color: var(--signal); font-weight: 600; }
  .wave-name { flex: 1; }
  .wave-when { color: var(--slate); font-size: 14px; }

  footer { background: var(--vault); color: var(--on-vault-dim); padding: 34px 32px; font-size: 14px; }
  footer a { color: var(--signal); }

  @media (max-width: 620px) {
    .vault { padding: 0 18px 40px; }
    main { padding: 48px 18px 64px; }
    h2 { font-size: 25px; }
    .bar nav a { margin-left: 0; margin-right: 18px; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
</head>
<body>

<div class="vault">
  <div class="inner">
    <header class="bar">
      <div class="brand">
        <span class="wordmark">miftah</span>
        <span class="wordmark-ar" lang="ar" dir="rtl">مفتاح</span>
      </div>
      <nav>
        <a href="console.html">Console</a>
        <a href="sample-report-en.html">Sample report</a>
        <a href="https://github.com/SiteQ8/miftah">GitHub</a>
      </nav>
    </header>

    <div class="readout">
      <span class="huge">${mosca.deficit}</span>
      <span class="huge-unit">years your traffic is readable<br>before it stops mattering</span>
    </div>

    <p class="claim">That is what ten years of required secrecy and a five year migration cost you against a 2033 horizon.</p>

    <figure class="hero-figure">${hero}</figure>
    <p class="hero-note">Recorded today, decrypted later. The amber span is not a risk in the abstract, it is the stretch of calendar during which traffic captured now can be read.</p>

    <div class="cta">
      <a class="primary" href="console.html">Open the console</a>
      <a href="sample-report-en.html">Read a sample report</a>
      <a href="https://github.com/SiteQ8/miftah">Source</a>
    </div>

    <div class="install"><span>npx</span> github:SiteQ8/miftah scan .</div>
  </div>
</div>

<main class="inner">

<section>
  <h2>Dates are easy to dismiss. Arithmetic is not.</h2>
  <p class="lede">Nobody knows when a cryptographically relevant quantum computer arrives, so any argument that rests on the date loses. Mosca's inequality does not rest on the date.</p>

  <div class="rule-quote">If the years your data must stay secret, plus the years your migration takes, exceed the years until the machine exists, you are already late.</div>

  <p>You do not get to start migrating when it is announced. You had to have finished by then, and the traffic you encrypted years earlier is already sitting in somebody's archive waiting for it. Move the horizon out five years and the arithmetic still bites, which is the point: the conclusion survives disagreement about the date.</p>
</section>

<section>
  <h2>Two verdicts, never one</h2>
  <p>Every algorithm is judged twice. Collapsing the two is how inventories end up misleading the people who read them.</p>

  <table>
    <tr><th>Algorithm</th><th>Classically</th><th>Against a quantum computer</th></tr>
    <tr><td>RSA-4096</td><td>strong</td><td><span class="chip broken">broken</span></td></tr>
    <tr><td>SHA-256</td><td>strong</td><td><span class="chip weakened">weakened</span></td></tr>
    <tr><td>AES-256</td><td>strong</td><td><span class="chip resistant">resistant</span></td></tr>
    <tr><td>MD5</td><td>broken</td><td><span class="chip broken">broken</span></td></tr>
  </table>

  <p>RSA-4096 is not a weak key, it is a doomed scheme. SHA-256 loses half its bits to Grover and still has 128 left, which is usually fine. MD5 needs no quantum computer to hurt anyone, and that last distinction is what the first wave of the roadmap is built on.</p>
</section>

<section>
  <h2>What a scan says</h2>
  <p>Run against the sample estate in the repository: ${scan.findings.length} findings across ${scan.filesRead} files, reduced to ${scan.assets.length} distinct cryptographic assets.</p>

  <figure class="composition">${compositionBar(counts, { width: 860 })}</figure>

  <table>
    <tr><th>Asset</th><th>Risk</th><th>Replace with</th></tr>
    ${worst.map((a) => `<tr><td>${a.name}</td><td>${a.score}</td><td>${a.replacement || 'review by hand'}</td></tr>`).join('\n    ')}
  </table>

  <p><a href="sample-report-en.html">Read the full report</a>, or <a href="sample-report-ar.html">the same report in Arabic</a> with a mirrored timeline. The machine readable inventory is <a href="sample-cbom.json">here</a>.</p>
</section>

<section>
  <h2>A CBOM that plugs into what you already run</h2>
  <p>The inventory is written as CycloneDX 1.6 and validated against the published schema. Every asset is typed <code>cryptographic-asset</code> and carries its registered OID, its CycloneDX primitive, its NIST security level where one applies, and <code>evidence.occurrences</code> pointing back at the file and line it came from.</p>
  <p>Standard format on purpose. A cryptographic inventory only one tool can read is just another silo.</p>
  <pre>miftah scan . --cbom cbom.json --fail-on high</pre>
</section>

<section>
  <h2>What it looks at</h2>
  <h3>Code and configuration</h3>
  <p>${RULES.length} rules covering broken hashes, legacy ciphers, ECB mode, undersized RSA and DH, static initialisation vectors, embedded keys, weak randomness in a cryptographic context, low PBKDF2 iteration counts, deprecated TLS and disabled certificate verification. Post quantum algorithms are detected too, so the inventory records what is already right rather than only what is wrong.</p>
  <p>Read in their own idioms: JavaScript, TypeScript, Python, <strong>Java</strong>, <strong>C#</strong>, <strong>Go</strong>, <strong>PHP</strong>, <strong>Ruby</strong>, <strong>Swift</strong>, Rust, Kotlin, shell and the usual configuration formats. <code>TripleDESCryptoServiceProvider</code>, <code>Cipher.getInstance("DESede/CBC/PKCS5Padding")</code>, <code>MCRYPT_3DES</code> and <code>kCCAlgorithm3DES</code> are the same asset, and all four are found. A scanner that reads nothing is worse than no scanner, because a clean report retires the question.</p>
  <h3>Certificates</h3>
  <p>Signature algorithm read straight out of the DER, public key type, size and curve, and expiry. Graded on all three, worst one wins.</p>
  <h3>The wire</h3>
  <p>TLS probed once per protocol version from 1.0 to 1.3, capturing the negotiated suite, the key exchange group and the chain. SSH spoken at the transport layer to read the server KEXINIT, judging key exchange, host key, cipher and MAC, and reporting whether any post quantum key exchange is offered at all.</p>
</section>

<section>
  <h2>Five waves, in this order</h2>
  <p>Doing this in the wrong order is how the budget disappears before the risk does.</p>
  <div class="waves">
    <div class="wave-row"><span class="wave-n">0</span><span class="wave-name">Stop the bleeding</span><span class="wave-when">now</span></div>
    <div class="wave-row"><span class="wave-n">1</span><span class="wave-name">Know and govern</span><span class="wave-when">0 to 6 months</span></div>
    <div class="wave-row"><span class="wave-n">2</span><span class="wave-name">Protect traffic in flight</span><span class="wave-when">3 to 12 months</span></div>
    <div class="wave-row"><span class="wave-n">3</span><span class="wave-name">Protect data at rest</span><span class="wave-when">9 to 24 months</span></div>
    <div class="wave-row"><span class="wave-n">4</span><span class="wave-name">Re root identity and signing</span><span class="wave-when">18 to 36 months</span></div>
  </div>
  <p>Traffic before signatures, deliberately. Recorded sessions are being harvested today, whereas a forged signature needs the machine to already exist.</p>
</section>

<section>
  <h2>Argue with the assumptions</h2>
  <p>The 2033 horizon is an assumption, not a prediction, which is why the console puts it on a slider instead of in a box. NIST IR 8547 sets 2030 for deprecating classical public key cryptography and 2035 for disallowing it; those are policy anchors, not physics.</p>
  <pre>miftah scan . --shelf-life 25 --migration 7 --horizon 2035 --exposure internal</pre>
  <p>Medical records and legal archives justify a long shelf life. A session token justifies almost none. <code>--exposure airgapped</code> lowers the score but never to zero.</p>
</section>

<section>
  <h2>Zero dependencies</h2>
  <p>Node built-ins only: <code>fs</code>, <code>net</code>, <code>tls</code>, <code>crypto</code>. Nothing is uploaded, nothing is phoned home, and the console is a single HTML file that works with the network unplugged. A tool you point at your private keys should not arrive with a dependency tree.</p>
</section>

</main>

<footer>
  <div class="inner">Miftah v${VERSION}. MIT licensed. Built by <a href="https://github.com/SiteQ8">Ali</a>.</div>
</footer>

</body>
</html>
`;

fs.writeFileSync(path.join(DOCS, 'index.html'), page);
fs.writeFileSync(path.join(DOCS, '.nojekyll'), '');

console.log(`docs built. index ${page.length} bytes, console ${fs.statSync(path.join(DOCS, 'console.html')).size} bytes`);

// Console builder.
// Produces one self contained page. Drop a scan result on it and it rescores
// the estate live as the planning assumptions move, because the assumptions are
// the argument, not the numbers that fall out of them.
//
// The page script is deliberately a classic script rather than a module, so it
// runs in file:// context and in a headless DOM without a server.

import { PALETTE } from './timeline.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildConsole(scan = null, options = {}) {
  const seeded = scan ? JSON.stringify(scan) : 'null';
  const version = options.version || '0.1.0';

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Miftah console</title>
<style>${consoleStyles()}</style>
</head>
<body>
<header class="bar">
  <div class="brand">
    <span class="mark" aria-hidden="true">&#1605;</span>
    <div>
      <h1>Miftah console</h1>
      <p>Cryptographic inventory and post quantum readiness</p>
    </div>
  </div>
  <div class="bar-actions">
    <button type="button" id="load">Load a scan</button>
    <button type="button" id="sample">Use the sample</button>
    <button type="button" id="download" disabled>Save report</button>
    <input type="file" id="file" accept="application/json,.json" hidden>
  </div>
</header>

<main id="app">
  <section id="empty" class="dropzone">
    <h2>Drop a scan result here</h2>
    <p>Run <code>miftah scan . --json scan.json</code> and drop the file on this page. Nothing is uploaded, the scoring runs in this tab.</p>
    <p class="hint">Or paste the JSON below.</p>
    <textarea id="paste" rows="4" placeholder='{"target":"...","findings":[],"assets":[]}'></textarea>
    <button type="button" id="parse">Read the pasted scan</button>
    <p id="error" class="error" hidden></p>
  </section>

  <div id="report" hidden>
    <section class="assumptions">
      <h2>Planning assumptions</h2>
      <p class="assumptions-lede">These three numbers decide everything below. Move them and the whole estate is rescored.</p>
      <div class="controls">
        <label>
          <span>Data shelf life <b id="shelfOut">10</b> years</span>
          <input type="range" id="shelf" min="1" max="30" value="10">
          <small>How long the data must stay secret.</small>
        </label>
        <label>
          <span>Migration time <b id="migrationOut">5</b> years</span>
          <input type="range" id="migration" min="1" max="15" value="5">
          <small>How long a full migration realistically takes.</small>
        </label>
        <label>
          <span>Quantum horizon <b id="horizonOut">2033</b></span>
          <input type="range" id="horizon" min="2028" max="2045" value="2033">
          <small>The year a relevant quantum computer is assumed to exist.</small>
        </label>
        <label>
          <span>Exposure</span>
          <select id="exposure">
            <option value="internet" selected>Reachable from the internet</option>
            <option value="partner">Partner network</option>
            <option value="internal">Internal only</option>
            <option value="airgapped">Air gapped</option>
          </select>
          <small>Whether traffic can be recorded today.</small>
        </label>
      </div>
    </section>

    <section class="figures" id="figures"></section>

    <section class="horizon-block">
      <h2>The horizon</h2>
      <figure id="horizonFigure"></figure>
      <p class="verdict" id="verdict"></p>
    </section>

    <nav class="tabs" role="tablist">
      <button type="button" class="tab active" data-panel="inventory" role="tab">Inventory</button>
      <button type="button" class="tab" data-panel="debt" role="tab">Technical debt</button>
      <button type="button" class="tab" data-panel="roadmap" role="tab">Roadmap</button>
    </nav>

    <div class="filter">
      <input type="search" id="search" placeholder="Filter by algorithm, file or rule">
    </div>

    <section id="inventory" class="panel" role="tabpanel"></section>
    <section id="debt" class="panel" role="tabpanel" hidden></section>
    <section id="roadmap" class="panel" role="tabpanel" hidden></section>
  </div>
</main>

<script>
${consoleScript()}
</script>
<script>
(function () {
  var seeded = ${seeded};
  window.MIFTAH_VERSION = ${JSON.stringify(version)};
  if (seeded) window.miftah.load(seeded);
  window.miftah.ready();
})();
</script>
</body>
</html>`;
}

function consoleScript() {
  return String.raw`
var PALETTE = ${JSON.stringify(PALETTE)};

var QUANTUM_EXPOSURE = { broken: 1, weakened: 0.45, unknown: 0.3, resistant: 0 };
var CLASSICAL_PENALTY = { broken: 1, weak: 0.7, legacy: 0.5, acceptable: 0.2, strong: 0 };
var EXPOSURE_FACTOR = { internet: 1, partner: 0.85, internal: 0.65, airgapped: 0.35 };
var SEVERITY_WEIGHT = { critical: 100, high: 70, medium: 40, low: 15, info: 5 };
var SEVERITY_COLOUR = {
  critical: PALETTE.broken, high: '#b8541f', medium: PALETTE.weakened,
  low: '#6d7b88', info: PALETTE.resistant
};

var state = { scan: null, profile: { shelfLife: 10, migrationYears: 5, crqcYear: 2033, exposure: 'internet' }, filter: '', panel: 'inventory' };

function esc(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function moscaDeficit(profile, now) {
  now = now || new Date();
  var yearsToHorizon = profile.crqcYear - (now.getFullYear() + now.getMonth() / 12);
  var deficit = profile.shelfLife + profile.migrationYears - yearsToHorizon;
  return {
    shelfLife: profile.shelfLife,
    migrationYears: profile.migrationYears,
    crqcYear: profile.crqcYear,
    yearsToHorizon: Number(yearsToHorizon.toFixed(2)),
    deficit: Number(deficit.toFixed(2)),
    breached: deficit > 0
  };
}

function band(score) {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function scoreAsset(asset, profile, mosca) {
  var exposure = QUANTUM_EXPOSURE[asset.quantum];
  if (exposure === undefined) exposure = QUANTUM_EXPOSURE.unknown;
  var penalty = CLASSICAL_PENALTY[asset.classical];
  if (penalty === undefined) penalty = CLASSICAL_PENALTY.acceptable;
  var reach = EXPOSURE_FACTOR[profile.exposure] || 1;
  var urgency = mosca.yearsToHorizon <= 0
    ? 1
    : Math.min(1, Math.max(0, mosca.deficit) / Math.max(1, profile.shelfLife + profile.migrationYears));
  var count = asset.occurrences ? asset.occurrences.length : 1;
  var spread = Math.min(1, Math.log(count + 1) / Math.LN10 / 2);
  var raw = 0.5 * (exposure * (0.35 + 0.65 * urgency)) + 0.35 * penalty + 0.15 * spread;
  var score = Math.round(Math.min(100, raw * 100 * reach));
  return { id: asset.id, name: asset.name, score: score, band: band(score), occurrences: count };
}

function scoreEstate(assets, profile) {
  var mosca = moscaDeficit(profile);
  var scored = assets.map(function (asset) { return scoreAsset(asset, profile, mosca); });
  var broken = 0, weakened = 0, resistant = 0;
  var weightedResistant = 0, weightedTotal = 0;
  assets.forEach(function (asset) {
    var count = asset.occurrences ? asset.occurrences.length : 1;
    var weight = 1 + Math.log(count + 1) / Math.LN10;
    weightedTotal += weight;
    if (asset.quantum === 'resistant') { resistant += 1; weightedResistant += weight; }
    else if (asset.quantum === 'weakened') { weakened += 1; weightedResistant += weight * 0.5; }
    else if (asset.quantum === 'broken') { broken += 1; }
  });
  var peak = scored.reduce(function (max, item) { return Math.max(max, item.score); }, 0);
  return {
    mosca: mosca,
    readiness: weightedTotal ? Math.round((weightedResistant / weightedTotal) * 100) : 100,
    peakRisk: peak,
    band: band(peak),
    counts: {
      assets: assets.length,
      quantumBroken: broken,
      quantumWeakened: weakened,
      quantumResistant: resistant,
      needsMigration: broken + weakened
    },
    assets: scored.sort(function (a, b) { return b.score - a.score; })
  };
}

function assignWave(asset) {
  if (asset.materialType) return 0;
  if (asset.classical === 'broken' || asset.classical === 'weak') return 0;
  if (asset.quantum === 'resistant') return 1;
  if (asset.primitive === 'key-agree' || asset.primitive === 'kem' || asset.protocol === 'tls' || asset.protocol === 'ssh') return 2;
  if (asset.primitive === 'block-cipher' || asset.primitive === 'stream-cipher' || asset.primitive === 'kdf' || asset.primitive === 'ae') return 3;
  if (asset.primitive === 'signature') return 4;
  if (asset.primitive === 'pke') return 2;
  return 3;
}

var WAVES = [
  { id: 0, name: 'Stop the bleeding', window: 'now', goal: 'Remove cryptography that is already broken against a classical attacker.' },
  { id: 1, name: 'Know and govern', window: 'months 0 to 6', goal: 'Hold a complete inventory and make the CBOM a build artefact.' },
  { id: 2, name: 'Protect traffic in flight', window: 'months 3 to 12', goal: 'Deploy hybrid key establishment wherever a session key is negotiated.' },
  { id: 3, name: 'Protect data at rest', window: 'months 9 to 24', goal: 'Raise symmetric keys to 256 bits and re wrap long lived data.' },
  { id: 4, name: 'Re root identity and signing', window: 'months 18 to 36', goal: 'Move certificates and code signing to ML-DSA or a hash based signature.' }
];

function horizonSvg(mosca) {
  var width = 900, height = 250;
  var startYear = new Date().getFullYear();
  var migration = Math.max(0, mosca.migrationYears);
  var shelf = Math.max(0, mosca.shelfLife);
  var horizonYears = Math.max(0.1, mosca.yearsToHorizon);
  var span = Math.max(migration + shelf, horizonYears) * 1.12 + 1;
  var left = 60, right = width - 40, usable = right - left;
  function x(years) { return left + (years / span) * usable; }
  var barY = 100, barH = 38, axisY = barY + barH + 42;
  var horizonX = x(horizonYears), migrationEnd = x(migration), shelfEnd = x(migration + shelf);
  var exposedStart = Math.min(horizonX, shelfEnd);
  var svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="100%" role="img">'];
  svg.push('<rect width="' + width + '" height="' + height + '" fill="' + PALETTE.paper + '"/>');
  svg.push('<line x1="' + left + '" y1="' + axisY + '" x2="' + right + '" y2="' + axisY + '" stroke="' + PALETTE.rule + '"/>');
  var step = span > 22 ? 5 : span > 11 ? 2 : 1;
  for (var year = 0; year <= span; year += step) {
    var tick = x(year);
    svg.push('<line x1="' + tick.toFixed(1) + '" y1="' + axisY + '" x2="' + tick.toFixed(1) + '" y2="' + (axisY + 6) + '" stroke="' + PALETTE.rule + '"/>');
    svg.push('<text x="' + tick.toFixed(1) + '" y="' + (axisY + 22) + '" font-family="Georgia, serif" font-size="12" fill="' + PALETTE.muted + '" text-anchor="middle">' + (startYear + year) + '</text>');
  }
  if (mosca.breached && shelfEnd > exposedStart) {
    svg.push('<rect x="' + exposedStart.toFixed(1) + '" y="' + (barY - 22) + '" width="' + (shelfEnd - exposedStart).toFixed(1) + '" height="' + (barH + 44) + '" fill="' + PALETTE.broken + '" fill-opacity="0.10"/>');
  }
  svg.push('<rect x="' + left + '" y="' + barY + '" width="' + (migrationEnd - left).toFixed(1) + '" height="' + barH + '" fill="' + PALETTE.brass + '" fill-opacity="0.85"/>');
  svg.push('<rect x="' + migrationEnd.toFixed(1) + '" y="' + barY + '" width="' + (shelfEnd - migrationEnd).toFixed(1) + '" height="' + barH + '" fill="' + PALETTE.ink + '" fill-opacity="0.82"/>');
  svg.push('<line x1="' + horizonX.toFixed(1) + '" y1="' + (barY - 42) + '" x2="' + horizonX.toFixed(1) + '" y2="' + axisY + '" stroke="' + PALETTE.horizon + '" stroke-width="2" stroke-dasharray="6 4"/>');
  svg.push('<circle cx="' + horizonX.toFixed(1) + '" cy="' + (barY - 42) + '" r="4" fill="' + PALETTE.horizon + '"/>');
  var anchor = horizonX > width - 170 ? 'end' : 'start';
  svg.push('<text x="' + (horizonX + (anchor === 'end' ? -8 : 8)).toFixed(1) + '" y="' + (barY - 50) + '" font-family="Georgia, serif" font-size="14" font-weight="bold" fill="' + PALETTE.horizon + '" text-anchor="' + anchor + '">Quantum horizon ' + (mosca.crqcYear || Math.round(startYear + horizonYears)) + '</text>');
  if (migrationEnd - left > 90) {
    svg.push('<text x="' + ((left + migrationEnd) / 2).toFixed(1) + '" y="' + (barY + 24) + '" font-family="Georgia, serif" font-size="13" fill="#ffffff" text-anchor="middle">Migration ' + migration + '</text>');
  }
  if (shelfEnd - migrationEnd > 140) {
    svg.push('<text x="' + ((migrationEnd + shelfEnd) / 2).toFixed(1) + '" y="' + (barY + 24) + '" font-family="Georgia, serif" font-size="13" fill="#ffffff" text-anchor="middle">Must stay secret ' + shelf + '</text>');
  }
  if (mosca.breached && shelfEnd - exposedStart > 70) {
    svg.push('<text x="' + ((exposedStart + shelfEnd) / 2).toFixed(1) + '" y="' + (barY + barH + 24) + '" font-family="Georgia, serif" font-size="13" font-weight="bold" fill="' + PALETTE.broken + '" text-anchor="middle">Exposed ' + mosca.deficit + ' years</text>');
  }
  svg.push('</svg>');
  return svg.join('');
}

function figure(value, label, headline) {
  return '<div class="figure' + (headline ? ' headline' : '') + '"><span class="figure-value">' + esc(value) + '</span><span class="figure-label">' + esc(label) + '</span></div>';
}

function matches(text) {
  if (!state.filter) return true;
  return String(text).toLowerCase().indexOf(state.filter) !== -1;
}

function renderInventory(estate) {
  var scored = {};
  estate.assets.forEach(function (item) { scored[item.id] = item; });
  var rows = (state.scan.assets || []).filter(function (asset) {
    return matches(asset.name + ' ' + asset.primitive + ' ' + (asset.replacement || ''));
  }).map(function (asset) {
    var score = scored[asset.id] || { score: 0 };
    var chipColour = asset.quantum === 'broken' ? PALETTE.broken
      : asset.quantum === 'weakened' ? PALETTE.weakened
      : asset.quantum === 'resistant' ? PALETTE.resistant
      : PALETTE.muted;
    return '<tr>'
      + '<td><strong>' + esc(asset.name) + '</strong>' + (asset.note ? '<span class="note">' + esc(asset.note) + '</span>' : '') + '</td>'
      + '<td>' + esc(asset.primitive) + '</td>'
      + '<td>' + esc(asset.classical) + '</td>'
      + '<td><span class="chip" style="background:' + chipColour + '">' + esc(asset.quantum) + '</span></td>'
      + '<td class="num"><span class="score" style="--fill:' + score.score + '%">' + score.score + '</span></td>'
      + '<td class="num">' + (asset.occurrences ? asset.occurrences.length : 0) + '</td>'
      + '<td>' + esc(asset.replacement || '') + '</td>'
      + '</tr>';
  });
  if (!rows.length) return '<p class="empty">Nothing matches that filter.</p>';
  return '<table><thead><tr><th>Asset</th><th>Primitive</th><th>Classical</th><th>Quantum</th><th class="num">Risk</th><th class="num">Uses</th><th>Target</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
}

function renderDebt() {
  var findings = (state.scan.findings || []).filter(function (finding) {
    return finding.severity !== 'info' && matches(finding.title + ' ' + finding.file + ' ' + finding.rule);
  }).sort(function (a, b) { return (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0); });
  if (!findings.length) return '<p class="empty">No findings match that filter.</p>';
  var rows = findings.slice(0, 400).map(function (finding) {
    var where = finding.line ? finding.file + ':' + finding.line : finding.file;
    return '<tr>'
      + '<td><span class="chip" style="background:' + (SEVERITY_COLOUR[finding.severity] || PALETTE.muted) + '">' + esc(finding.severity) + '</span></td>'
      + '<td><strong>' + esc(finding.title) + '</strong>' + (finding.detail ? '<span class="note">' + esc(finding.detail) + '</span>' : '') + '</td>'
      + '<td><code>' + esc(where) + '</code></td>'
      + '<td>' + esc(finding.advice) + '</td>'
      + '</tr>';
  });
  return '<table><thead><tr><th>Severity</th><th>Finding</th><th>Location</th><th>Advice</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
}

function renderRoadmap(estate) {
  var scored = {};
  estate.assets.forEach(function (item) { scored[item.id] = item; });
  var buckets = WAVES.map(function (wave) { return { wave: wave, items: [] }; });
  (state.scan.assets || []).forEach(function (asset) {
    if (!matches(asset.name + ' ' + (asset.replacement || ''))) return;
    var score = scored[asset.id] || { score: 0 };
    buckets[assignWave(asset)].items.push({ asset: asset, score: score.score });
  });
  return buckets.map(function (bucket) {
    bucket.items.sort(function (a, b) { return b.score - a.score; });
    var body = bucket.items.length
      ? '<table><thead><tr><th>From</th><th>To</th><th class="num">Risk</th><th class="num">Uses</th></tr></thead><tbody>'
        + bucket.items.map(function (item) {
            return '<tr><td>' + esc(item.asset.name) + '</td><td>' + esc(item.asset.quantum === 'resistant' ? 'no change needed' : (item.asset.replacement || 'review by hand')) + '</td><td class="num">' + item.score + '</td><td class="num">' + (item.asset.occurrences ? item.asset.occurrences.length : 0) + '</td></tr>';
          }).join('')
        + '</tbody></table>'
      : '<p class="empty">Nothing in this wave.</p>';
    return '<section class="wave"><h3><span class="wave-mark">' + bucket.wave.id + '</span>' + esc(bucket.wave.name) + '</h3>'
      + '<p class="wave-window">' + esc(bucket.wave.window) + '</p><p class="wave-goal">' + esc(bucket.wave.goal) + '</p>' + body + '</section>';
  }).join('');
}

function render() {
  if (!state.scan) return;
  var estate = scoreEstate(state.scan.assets || [], state.profile);
  state.estate = estate;

  var severe = (state.scan.findings || []).filter(function (f) { return f.severity === 'critical' || f.severity === 'high'; }).length;
  document.getElementById('figures').innerHTML =
    figure(estate.readiness, 'Post quantum readiness', true)
    + figure(estate.counts.needsMigration, 'Assets needing migration')
    + figure(estate.counts.assets, 'Cryptographic assets')
    + figure(severe, 'Critical and high findings')
    + figure(estate.peakRisk, 'Highest asset risk');

  document.getElementById('horizonFigure').innerHTML = horizonSvg(estate.mosca);
  var verdict = document.getElementById('verdict');
  verdict.className = 'verdict ' + (estate.mosca.breached ? 'breached' : 'clear');
  verdict.textContent = estate.mosca.breached
    ? 'The secrecy requirement outruns the horizon by ' + estate.mosca.deficit + ' years, so traffic recorded today is readable before the data stops mattering.'
    : 'The secrecy requirement fits inside the horizon with ' + Math.abs(estate.mosca.deficit) + ' years to spare, though the margin shrinks every year the migration is deferred.';

  document.getElementById('inventory').innerHTML = renderInventory(estate);
  document.getElementById('debt').innerHTML = renderDebt();
  document.getElementById('roadmap').innerHTML = renderRoadmap(estate);
}

function showReport() {
  document.getElementById('empty').hidden = true;
  document.getElementById('report').hidden = false;
  document.getElementById('download').disabled = false;
}

function load(data) {
  var scan = typeof data === 'string' ? JSON.parse(data) : data;
  if (!scan || typeof scan !== 'object') throw new Error('That does not look like a scan result.');
  if (!Array.isArray(scan.assets)) scan.assets = [];
  if (!Array.isArray(scan.findings)) scan.findings = [];
  state.scan = scan;
  showReport();
  render();
  return scan;
}

function fail(message) {
  var box = document.getElementById('error');
  box.textContent = message;
  box.hidden = false;
}

function bind() {
  var shelf = document.getElementById('shelf');
  var migration = document.getElementById('migration');
  var horizon = document.getElementById('horizon');
  var exposure = document.getElementById('exposure');

  function sync() {
    state.profile.shelfLife = Number(shelf.value);
    state.profile.migrationYears = Number(migration.value);
    state.profile.crqcYear = Number(horizon.value);
    state.profile.exposure = exposure.value;
    document.getElementById('shelfOut').textContent = shelf.value;
    document.getElementById('migrationOut').textContent = migration.value;
    document.getElementById('horizonOut').textContent = horizon.value;
    render();
  }
  [shelf, migration, horizon].forEach(function (input) { input.addEventListener('input', sync); });
  exposure.addEventListener('change', sync);

  document.getElementById('search').addEventListener('input', function (event) {
    state.filter = event.target.value.trim().toLowerCase();
    render();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (other) { other.classList.remove('active'); });
      tab.classList.add('active');
      state.panel = tab.getAttribute('data-panel');
      ['inventory', 'debt', 'roadmap'].forEach(function (name) {
        document.getElementById(name).hidden = name !== state.panel;
      });
    });
  });

  var file = document.getElementById('file');
  document.getElementById('load').addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () {
    if (!file.files || !file.files[0]) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { load(String(reader.result)); } catch (error) { fail(error.message); }
    };
    reader.readAsText(file.files[0]);
  });

  document.getElementById('parse').addEventListener('click', function () {
    try { load(document.getElementById('paste').value); } catch (error) { fail('That is not valid JSON. ' + error.message); }
  });

  document.getElementById('sample').addEventListener('click', function () {
    load(sampleScan());
  });

  document.getElementById('download').addEventListener('click', function () {
    var payload = JSON.stringify({ profile: state.profile, estate: state.estate, scan: state.scan }, null, 2);
    var blob = new Blob([payload], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'miftah-report.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  ['dragover', 'dragenter'].forEach(function (name) {
    document.addEventListener(name, function (event) { event.preventDefault(); document.body.classList.add('dragging'); });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    document.addEventListener(name, function (event) { event.preventDefault(); document.body.classList.remove('dragging'); });
  });
  document.addEventListener('drop', function (event) {
    var dropped = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!dropped) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { load(String(reader.result)); } catch (error) { fail(error.message); }
    };
    reader.readAsText(dropped);
  });
}

function sampleScan() {
  return {
    target: 'sample estate',
    filesScanned: 42,
    findings: [
      { rule: 'MFT-H002', title: 'SHA-1 in use', severity: 'high', file: 'src/sign.js', line: 18, advice: 'Replace with SHA-256.', algorithm: 'SHA-1' },
      { rule: 'MFT-K001', title: 'Hard coded secret', severity: 'critical', file: 'config/app.yaml', line: 7, advice: 'Move to a KMS and rotate.' },
      { rule: 'MFT-A003', title: 'ECDH key agreement', severity: 'high', file: 'src/tls.js', line: 44, advice: 'Move to X25519MLKEM768.', algorithm: 'ECDH' }
    ],
    assets: [
      { id: 'SHA-1', name: 'SHA-1', primitive: 'hash', classical: 'broken', quantum: 'broken', replacement: 'SHA-256', occurrences: [{ file: 'src/sign.js', line: 18 }] },
      { id: 'ECDH', name: 'ECDH', primitive: 'key-agree', classical: 'strong', quantum: 'broken', replacement: 'X25519MLKEM768 hybrid key exchange', occurrences: [{ file: 'src/tls.js', line: 44 }, { file: 'src/peer.js', line: 9 }] },
      { id: 'RSA-2048', name: 'RSA 2048', primitive: 'pke', classical: 'acceptable', quantum: 'broken', replacement: 'ML-KEM-768', occurrences: [{ file: 'src/keys.js', line: 3 }] },
      { id: 'AES-128', name: 'AES-128', primitive: 'block-cipher', classical: 'strong', quantum: 'weakened', replacement: 'AES-256', occurrences: [{ file: 'src/store.js', line: 21 }] },
      { id: 'AES-256', name: 'AES-256', primitive: 'block-cipher', classical: 'strong', quantum: 'resistant', occurrences: [{ file: 'src/vault.js', line: 12 }] }
    ]
  };
}

window.miftah = {
  load: load,
  render: render,
  scoreEstate: scoreEstate,
  moscaDeficit: moscaDeficit,
  sampleScan: sampleScan,
  state: state,
  ready: function () { bind(); if (state.scan) render(); }
};
`;
}

function consoleStyles() {
  return `
:root {
  --ink: ${PALETTE.ink};
  --muted: ${PALETTE.muted};
  --rule: ${PALETTE.rule};
  --paper: ${PALETTE.paper};
  --brass: ${PALETTE.brass};
  --broken: ${PALETTE.broken};
  --resistant: ${PALETTE.resistant};
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
  font-size: 16px; line-height: 1.6;
}
body.dragging { outline: 3px dashed var(--brass); outline-offset: -12px; }
.bar {
  display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 16px 28px; border-bottom: 1px solid var(--rule); background: #fff;
  position: sticky; top: 0; z-index: 5; flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 14px; }
.brand svg, .brand img { flex: 0 0 auto; margin-right: 14px; }
.mark {
  width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--brass); color: var(--brass); font-size: 22px; flex-shrink: 0;
}
.bar h1 { margin: 0; font-size: 19px; font-weight: 600; }
.bar p { margin: 0; font-size: 12.5px; color: var(--muted); }
.bar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
button {
  font: inherit; font-size: 14px; padding: 7px 14px; background: #fff;
  border: 1px solid var(--rule); color: var(--ink); cursor: pointer; border-radius: 2px;
}
button:hover:not(:disabled) { border-color: var(--brass); color: var(--brass); }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }

main { max-width: 1080px; margin: 0 auto; padding: 32px 24px 72px; }
.dropzone { border: 1px dashed var(--rule); padding: 48px 32px; text-align: center; }
.dropzone h2 { margin: 0 0 10px; font-size: 24px; font-weight: 600; }
.dropzone p { margin: 0 auto 12px; max-width: 56ch; color: var(--muted); }
.dropzone .hint { font-size: 14px; }
textarea {
  width: 100%; max-width: 620px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px; padding: 10px; border: 1px solid var(--rule); border-radius: 2px; margin-bottom: 12px;
}
.error { color: var(--broken); }

h2 { font-size: 23px; margin: 0 0 12px; font-weight: 600; border-bottom: 1px solid var(--rule); padding-bottom: 8px; }
section { margin-bottom: 36px; }
.assumptions-lede { margin: 0 0 18px; color: var(--muted); max-width: 68ch; }
.controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 22px; }
.controls label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.controls label > span { font-weight: 600; }
.controls b { color: var(--brass); font-variant-numeric: tabular-nums; }
.controls small { color: var(--muted); font-size: 12px; }
input[type=range] { width: 100%; accent-color: ${PALETTE.brass}; }
select { font: inherit; font-size: 14px; padding: 6px 8px; border: 1px solid var(--rule); background: #fff; border-radius: 2px; }

.figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); }
.figures { display: -webkit-box; display: -webkit-flex; display: flex; -webkit-flex-wrap: wrap; flex-wrap: wrap; }
@supports (display: grid) { .figures { display: grid; } }
.figure { background: var(--paper); padding: 18px 16px; display: flex; flex-direction: column; gap: 4px; -webkit-flex: 1 1 150px; flex: 1 1 150px; min-width: 150px; }
.figure + .figure { border-left: 1px solid var(--rule); }
.figure-value { font-size: 32px; line-height: 1; font-variant-numeric: tabular-nums; }
.headline .figure-value { font-size: 50px; color: var(--brass); }
.figure-label { font-size: 12px; color: var(--muted); }

figure { margin: 18px 0; border: 1px solid var(--rule); overflow-x: auto; }
figure svg { display: block; width: 100%; height: auto; }
.verdict { padding: 13px 17px; border-left: 4px solid var(--muted); background: rgba(28,39,51,0.03); }
.verdict.breached { border-left-color: var(--broken); }
.verdict.clear { border-left-color: var(--resistant); }

.tabs { display: flex; gap: 0; border-bottom: 1px solid var(--rule); margin-bottom: 16px; flex-wrap: wrap; }
.tab { border: none; border-bottom: 2px solid transparent; background: none; padding: 10px 18px; border-radius: 0; }
.tab.active { border-bottom-color: var(--brass); color: var(--brass); }
.filter { margin-bottom: 14px; }
.filter input { font: inherit; font-size: 14px; width: 100%; max-width: 380px; padding: 8px 12px; border: 1px solid var(--rule); background: #fff; border-radius: 2px; }

table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { font-size: 12px; color: var(--muted); font-weight: 600; border-bottom: 2px solid var(--ink); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tbody tr:hover { background: rgba(168,121,28,0.06); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; background: rgba(28,39,51,0.05); padding: 1px 5px; border-radius: 3px; }
.note { display: block; font-size: 12.5px; color: var(--muted); margin-top: 2px; }
.chip { display: inline-block; padding: 2px 9px; border-radius: 2px; font-size: 12px; color: #fff; white-space: nowrap; }
.score { display: inline-block; width: 62px; padding: 2px 8px; text-align: right; font-variant-numeric: tabular-nums; background-color: rgba(168,52,31,0.06); background-image: linear-gradient(to right, rgba(168,52,31,0.24) 0%, rgba(168,52,31,0.24) var(--fill, 0%), transparent var(--fill, 0%)); }
.empty { color: var(--muted); font-style: italic; }
.wave { margin-top: 26px; }
.wave h3 { display: flex; align-items: baseline; gap: 12px; font-size: 18px; margin: 0 0 6px; font-weight: 600; }
.wave-mark { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid var(--brass); color: var(--brass); font-size: 14px; flex-shrink: 0; }
.wave-window { margin: 0 0 4px; font-size: 13px; color: var(--muted); }
.wave-goal { margin: 0 0 10px; max-width: 70ch; }

@media (max-width: 620px) {
  main { padding: 20px 14px 56px; }
  .bar { padding: 12px 16px; }
  table { font-size: 13px; }
  th, td { padding: 7px 8px; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;
}

export default buildConsole;

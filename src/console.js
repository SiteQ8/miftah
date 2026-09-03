// Console builder.
// Produces one self contained page. Drop a scan result on it and it rescores
// the estate live as the planning assumptions move, because the assumptions are
// the argument, not the numbers that fall out of them.
//
// The page script is deliberately a classic script rather than a module, so it
// runs in file:// context and in a headless DOM without a server.

import { PALETTE } from './timeline.js';
import { VERSION } from './version.js';
import { THEME, SANS, MONO, severityColour, quantumColour } from './theme.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildConsole(scan = null, options = {}) {
  const seeded = scan ? JSON.stringify(scan) : 'null';
  const version = options.version || VERSION;

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Miftah console</title>
<style>${consoleStyles()}</style>
</head>
<body>

<div class="vault">
  <header class="bar">
    <div class="brand">
      <span class="wordmark">miftah</span>
      <span class="wordmark-ar" lang="ar" dir="rtl">مفتاح</span>
    </div>
    <div class="bar-actions">
      <button type="button" id="load">Load a scan</button>
      <button type="button" id="sample">Use the sample</button>
      <button type="button" id="download" disabled>Save report</button>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
  </header>

  <section id="empty" class="dropzone">
    <h2>Drop a scan result here</h2>
    <p>Run <code>miftah scan . --json scan.json</code> and drop the file on this page. Nothing is uploaded and nothing leaves this tab.</p>
    <textarea id="paste" rows="3" placeholder='{"target":"...","findings":[],"assets":[]}' aria-label="Paste a scan result"></textarea>
    <div class="dropzone-actions">
      <button type="button" id="parse">Read the pasted scan</button>
      <button type="button" id="sample2">Use the sample instead</button>
    </div>
    <p id="error" class="error" hidden></p>
  </section>

  <div id="readout" hidden>
    <div class="readout-number">
      <span class="huge" id="deficit">0</span>
      <span class="huge-unit" id="deficitUnit">years exposed</span>
    </div>
    <p class="verdict" id="verdict"></p>
    <figure id="horizonFigure"></figure>

    <div class="controls">
      <label class="control">
        <span class="control-name">Data must stay secret <b id="shelfOut">10</b> years</span>
        <input type="range" id="shelf" min="1" max="30" value="10">
      </label>
      <label class="control">
        <span class="control-name">Migration takes <b id="migrationOut">5</b> years</span>
        <input type="range" id="migration" min="1" max="15" value="5">
      </label>
      <label class="control">
        <span class="control-name">Quantum horizon <b id="horizonOut">2033</b></span>
        <input type="range" id="horizon" min="2028" max="2045" value="2033">
      </label>
      <label class="control control-select">
        <span class="control-name">Exposure</span>
        <select id="exposure">
          <option value="internet" selected>Reachable from the internet</option>
          <option value="partner">Partner network</option>
          <option value="internal">Internal only</option>
          <option value="airgapped">Air gapped</option>
        </select>
      </label>
    </div>
  </div>
</div>

<main id="app">
  <div id="report" hidden>
    <section class="figures" id="figures"></section>

    <nav class="tabs" role="tablist">
      <button type="button" class="tab active" data-panel="inventory" role="tab">Inventory</button>
      <button type="button" class="tab" data-panel="debt" role="tab">Technical debt</button>
      <button type="button" class="tab" data-panel="roadmap" role="tab">Roadmap</button>
      <input type="search" id="search" placeholder="Filter by algorithm, file or rule" aria-label="Filter">
    </nav>

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
var C = ${JSON.stringify({
    vault: THEME.vault,
    onVault: THEME.onVault,
    axis: THEME.vaultLine,
    axisText: THEME.onVaultDim,
    migration: THEME.steel,
    secrecy: '#2C5A70',
    exposed: THEME.signal,
    live: THEME.live,
    alarm: THEME.alarm,
    slate: THEME.slate
  })};

var QUANTUM_EXPOSURE = { broken: 1, weakened: 0.45, unknown: 0.3, resistant: 0 };
var CLASSICAL_PENALTY = { broken: 1, weak: 0.7, legacy: 0.5, acceptable: 0.2, strong: 0 };
var EXPOSURE_FACTOR = { internet: 1, partner: 0.85, internal: 0.65, airgapped: 0.35 };
var SEVERITY_WEIGHT = { critical: 100, high: 70, medium: 40, low: 15, info: 5 };
var SEVERITY_COLOUR = ${JSON.stringify({
    critical: severityColour('critical'),
    high: severityColour('high'),
    medium: severityColour('medium'),
    low: severityColour('low'),
    info: severityColour('info')
  })};
var QUANTUM_COLOUR = ${JSON.stringify({
    broken: quantumColour('broken'),
    weakened: quantumColour('weakened'),
    resistant: quantumColour('resistant'),
    unknown: quantumColour('unknown')
  })};

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
  var width = 960, height = 200;
  var startYear = new Date().getFullYear();
  var migration = Math.max(0, mosca.migrationYears);
  var shelf = Math.max(0, mosca.shelfLife);
  var horizonYears = Math.max(0.1, mosca.yearsToHorizon);
  var span = Math.max(migration + shelf, horizonYears) * 1.08 + 0.8;
  var left = 28, right = width - 28, usable = right - left;
  function x(years) { return left + (years / span) * usable; }
  function between(a, b) { var p = x(a), q = x(b); return { x: Math.min(p, q), w: Math.abs(q - p) }; }
  var barY = 64, barH = 56, axisY = barY + barH + 34;
  var secrecyEnd = migration + shelf;
  var splitAt = Math.min(Math.max(horizonYears, migration), secrecyEnd);

  var svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="100%" role="img" aria-label="Quantum horizon">'];
  function text(v, tx, ty, size, fill, anchor, weight) {
    return '<text x="' + Number(tx).toFixed(1) + '" y="' + ty + '" font-size="' + size + '"'
      + (weight ? ' font-weight="' + weight + '"' : '') + ' fill="' + fill + '" text-anchor="'
      + (anchor || 'start') + '" style="font-variant-numeric:tabular-nums">' + esc(v) + '</text>';
  }

  svg.push('<line x1="' + left + '" y1="' + axisY + '" x2="' + right + '" y2="' + axisY + '" stroke="' + C.axis + '"/>');
  var step = span > 18 ? 4 : span > 9 ? 2 : 1;
  for (var year = 0; year <= Math.floor(span); year += step) {
    var tick = x(year);
    svg.push('<line x1="' + tick.toFixed(1) + '" y1="' + axisY + '" x2="' + tick.toFixed(1) + '" y2="' + (axisY + 5) + '" stroke="' + C.axis + '"/>');
    svg.push(text(startYear + year, tick, axisY + 22, 12, C.axisText, 'middle'));
  }

  var mig = between(0, migration);
  svg.push('<rect x="' + mig.x.toFixed(1) + '" y="' + barY + '" width="' + mig.w.toFixed(1) + '" height="' + barH + '" fill="' + C.migration + '"/>');
  if (mig.w > 96) svg.push(text('Migration ' + migration, mig.x + mig.w / 2, barY + barH / 2 + 5, 14, C.onVault, 'middle', 500));

  var safe = between(migration, splitAt);
  var labelled = false;
  if (safe.w > 0) {
    svg.push('<rect x="' + safe.x.toFixed(1) + '" y="' + barY + '" width="' + safe.w.toFixed(1) + '" height="' + barH + '" fill="' + C.secrecy + '"/>');
    if (safe.w > 150) { svg.push(text('Must stay secret ' + shelf, safe.x + safe.w / 2, barY + barH / 2 + 5, 14, C.onVault, 'middle', 500)); labelled = true; }
  }

  if (mosca.deficit > 0 && secrecyEnd > splitAt) {
    var hot = between(splitAt, secrecyEnd);
    svg.push('<rect x="' + hot.x.toFixed(1) + '" y="' + barY + '" width="' + hot.w.toFixed(1) + '" height="' + barH + '" fill="' + C.exposed + '"/>');
    var caption = 'Exposed ' + mosca.deficit + ' years';
    if (hot.w > 140) {
      svg.push(text(caption, hot.x + hot.w / 2, barY + barH / 2 + 5, 14, C.vault, 'middle', 600));
      if (!labelled) {
        var whole = between(migration, secrecyEnd);
        svg.push(text('Must stay secret ' + shelf, whole.x + whole.w / 2, barY + barH + 24, 13, C.axisText, 'middle'));
        labelled = true;
      }
    } else {
      svg.push(text(caption, hot.x + hot.w / 2, barY + barH + 24, 13, C.exposed, 'middle', 600));
    }
  }

  if (!labelled && shelf > 0) {
    var span2 = between(migration, secrecyEnd);
    svg.push(text('Must stay secret ' + shelf, span2.x + span2.w / 2, barY + barH + 24, 13, C.axisText, 'middle'));
  }

  var hx = x(horizonYears);
  svg.push('<line x1="' + hx.toFixed(1) + '" y1="' + (barY - 30) + '" x2="' + hx.toFixed(1) + '" y2="' + axisY + '" stroke="' + C.exposed + '" stroke-width="2"/>');
  svg.push('<circle cx="' + hx.toFixed(1) + '" cy="' + (barY - 30) + '" r="4" fill="' + C.exposed + '"/>');
  var nearEnd = hx > width - 210;
  svg.push(text('Quantum horizon ' + (mosca.crqcYear || Math.round(startYear + horizonYears)), hx + (nearEnd ? -10 : 10), barY - 26, 14, C.exposed, nearEnd ? 'end' : 'start', 600));
  svg.push(text('Today', left, barY - 14, 12, C.axisText, 'start'));
  svg.push('</svg>');
  return svg.join('');
}

function figure(value, label, headline) {
  return '<div class="figure' + (headline ? ' headline' : '') + '"><span class="figure-value">' + esc(value) + '</span><span class="figure-label">' + esc(label) + '</span></div>';
}

function riskColour(score) {
  if (score >= 75) return C.alarm;
  if (score >= 55) return '#B3341F';
  if (score >= 30) return C.exposed;
  return C.migration;
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
    var chipColour = QUANTUM_COLOUR[asset.quantum] || QUANTUM_COLOUR.unknown;
    return '<tr>'
      + '<td><span class="asset-name">' + esc(asset.name) + '</span>' + (asset.note ? '<span class="asset-note">' + esc(asset.note) + '</span>' : '') + '</td>'
      + '<td>' + esc(asset.primitive) + '</td>'
      + '<td>' + esc(asset.classical) + '</td>'
      + '<td><span class="chip" style="--chip-dot:' + chipColour + '">' + esc(asset.quantum) + '</span></td>'
      + '<td><span class="risk"><span class="risk-track"><span class="risk-fill" style="width:' + score.score + '%;background:' + riskColour(score.score) + '"></span></span><span class="risk-value">' + score.score + '</span></span></td>'
      + '<td class="num">' + (asset.occurrences ? asset.occurrences.length : 0) + '</td>'
      + '<td>' + esc(asset.replacement || '') + '</td>'
      + '</tr>';
  });
  if (!rows.length) return '<p class="empty">Nothing matches that filter.</p>';
  return '<table>'
    + '<colgroup><col class="c-asset"><col class="c-primitive"><col class="c-classical">'
    + '<col class="c-quantum"><col class="c-risk"><col class="c-uses"><col class="c-target"></colgroup>'
    + '<thead><tr><th>Asset</th><th>Primitive</th><th>Classical</th><th>Quantum</th>'
    + '<th>Risk</th><th class="num">Uses</th><th>Target</th></tr></thead>'
    + '<tbody>' + rows.join('') + '</tbody></table>';
}

function renderDebt() {
  var findings = (state.scan.findings || []).filter(function (finding) {
    return finding.severity !== 'info' && matches(finding.title + ' ' + finding.file + ' ' + finding.rule);
  }).sort(function (a, b) { return (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0); });
  if (!findings.length) return '<p class="empty">No findings match that filter.</p>';
  var rows = findings.slice(0, 400).map(function (finding) {
    var where = finding.line ? finding.file + ':' + finding.line : finding.file;
    return '<tr>'
      + '<td><span class="chip solid" style="background:' + (SEVERITY_COLOUR[finding.severity] || C.slate) + ';color:#fff">' + esc(finding.severity) + '</span></td>'
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

  var mosca = estate.mosca;
  var deficit = document.getElementById('deficit');
  var unit = document.getElementById('deficitUnit');
  if (mosca.deficit > 0) {
    deficit.textContent = mosca.deficit;
    deficit.className = 'huge';
    unit.textContent = mosca.deficit === 1 ? 'year exposed' : 'years exposed';
  } else {
    deficit.textContent = Math.abs(mosca.deficit);
    deficit.className = 'huge clear';
    unit.textContent = Math.abs(mosca.deficit) === 1 ? 'year of margin' : 'years of margin';
  }

  document.getElementById('horizonFigure').innerHTML = horizonSvg(mosca);
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
  document.getElementById('readout').hidden = false;
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

// A native range track gives no read on position, so paint the travelled part.
function paintRange(input) {
  var min = Number(input.min), max = Number(input.max);
  var pct = max === min ? 0 : ((Number(input.value) - min) / (max - min)) * 100;
  input.style.backgroundImage =
    'linear-gradient(to right, ' + C.exposed + ' 0%, ' + C.exposed + ' ' + pct + '%, transparent ' + pct + '%)';
  input.style.backgroundSize = '100% 3px';
  input.style.backgroundPosition = 'center';
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
    paintRange(shelf);
    paintRange(migration);
    paintRange(horizon);
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

  // Both sample buttons do the same thing, one in the bar and one in the empty
  // state, because an empty screen should offer the way forward itself.
  ['sample', 'sample2'].forEach(function (id) {
    var button = document.getElementById(id);
    if (button) button.addEventListener('click', function () { load(sampleScan()); });
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
  --vault: ${THEME.vault};
  --vault-raised: ${THEME.vaultRaised};
  --vault-line: ${THEME.vaultLine};
  --paper: ${THEME.paper};
  --paper-raised: ${THEME.paperRaised};
  --paper-line: ${THEME.paperLine};
  --ink: ${THEME.ink};
  --slate: ${THEME.slate};
  --slate-dim: ${THEME.slateDim};
  --on-vault: ${THEME.onVault};
  --on-vault-dim: ${THEME.onVaultDim};
  --signal: ${THEME.signal};
  --live: ${THEME.live};
  --alarm: ${THEME.alarm};
  --steel: ${THEME.steel};
  --sans: ${SANS};
  --mono: ${MONO};
}

* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.55;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

/* Content is capped; the bands behind it are not. */
.bar, #readout, .dropzone, #report { max-width: 1240px; margin-left: auto; margin-right: auto; }

/* ----------------------------------------------------------- the archive */

.vault {
  background: var(--vault);
  color: var(--on-vault);
  padding: 0 32px 40px;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 20px 0 30px;
}

.brand { display: flex; align-items: baseline; gap: 12px; }
.brand > * + * { margin-left: 12px; }
@supports (gap: 1px) { .brand > * + * { margin-left: 0; } }

.wordmark {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--on-vault);
}

.wordmark-ar { font-size: 19px; color: var(--signal); }

.bar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.bar-actions > * + * { margin-left: 8px; }
@supports (gap: 1px) { .bar-actions > * + * { margin-left: 0; } }

.bar-actions button {
  font-family: inherit;
  font-size: 14px;
  color: var(--on-vault);
  background: transparent;
  border: 1px solid var(--vault-line);
  padding: 8px 15px;
  cursor: pointer;
}

.bar-actions button:hover:not(:disabled) { border-color: var(--signal); color: var(--signal); }
.bar-actions button:disabled { opacity: 0.4; cursor: default; }

/* The readout. One number, large enough that nothing else competes with it. */

.readout-number { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
.readout-number > * + * { margin-left: 16px; }
@supports (gap: 1px) { .readout-number > * + * { margin-left: 0; } }

.huge {
  font-size: 116px;
  font-size: clamp(64px, 13vw, 136px);
  font-weight: 300;
  line-height: 0.88;
  letter-spacing: -0.035em;
  color: var(--signal);
}

.huge.clear { color: var(--live); }

.huge-unit { font-size: 17px; color: var(--on-vault-dim); }

.verdict {
  margin: 18px 0 0;
  max-width: 62ch;
  font-size: 17px;
  line-height: 1.5;
  color: var(--on-vault);
}

#horizonFigure { margin: 26px 0 0; }
#horizonFigure svg { display: block; width: 100%; height: auto; }

/* Controls sit under the strip because they drive it directly. */

.controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 22px 30px;
  margin-top: 30px;
  padding-top: 26px;
  border-top: 1px solid var(--vault-line);
}

.control { display: block; }
.control-name { display: block; font-size: 13px; color: var(--on-vault-dim); margin-bottom: 10px; }
.control-name b { color: var(--signal); font-weight: 600; font-size: 15px; }

input[type=range] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  margin: 8px 0;
  background: var(--vault-line);
  background-repeat: no-repeat;
  cursor: pointer;
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--signal);
  border: 0;
  cursor: pointer;
}

input[type=range]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--signal);
  border: 0;
  cursor: pointer;
}

input[type=range]::-moz-range-track { height: 3px; background: var(--vault-line); }

select {
  font-family: inherit;
  font-size: 14px;
  width: 100%;
  color: var(--on-vault);
  background: var(--vault-raised);
  border: 1px solid var(--vault-line);
  padding: 8px 10px;
}

/* Empty state. An invitation to act rather than a blank panel. */

.dropzone { padding: 8px 0 40px; }
.dropzone h2, .dropzone p, .dropzone textarea { max-width: 62ch; }
.dropzone h2 { font-size: 26px; font-weight: 500; margin: 0 0 10px; letter-spacing: -0.01em; }
.dropzone p { color: var(--on-vault-dim); margin: 0 0 16px; }
.dropzone code { font-family: var(--mono); font-size: 13px; color: var(--signal); }

.dropzone textarea {
  width: 100%;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--on-vault);
  background: var(--vault-raised);
  border: 1px solid var(--vault-line);
  padding: 12px;
  resize: vertical;
}

.dropzone-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }

.dropzone-actions button {
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 9px 16px;
  border: 1px solid var(--vault-line);
  background: transparent;
  color: var(--on-vault);
}

.dropzone-actions button:first-child { background: var(--signal); border-color: var(--signal); color: var(--vault); font-weight: 500; }
.dropzone-actions button:hover { border-color: var(--signal); }

.dragging { outline: 2px dashed var(--signal); outline-offset: -8px; }

.error { color: var(--alarm); margin-top: 12px; }

/* ------------------------------------------------------ working surface */

#app { padding: 0 32px 80px; }

.figures {
  display: -webkit-box;
  display: flex;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--paper-line);
  margin-bottom: 34px;
}

@supports (display: grid) {
  .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
}

.figure {
  flex: 1 1 140px;
  min-width: 140px;
  padding: 22px 20px 22px 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.figure-value { font-size: 34px; font-weight: 300; line-height: 1.05; letter-spacing: -0.02em; }
.figure-label { font-size: 13px; color: var(--slate); }
.headline .figure-value { color: var(--alarm); }

.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--paper-line);
  margin-bottom: 22px;
}

.tab {
  font-family: inherit;
  font-size: 15px;
  color: var(--slate);
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 11px 14px;
  margin-bottom: -1px;
  cursor: pointer;
}

.tab:hover { color: var(--ink); }
.tab.active { color: var(--ink); border-bottom-color: var(--signal); font-weight: 500; }

#search {
  font-family: inherit;
  font-size: 14px;
  margin-left: auto;
  margin-bottom: 6px;
  padding: 8px 12px;
  min-width: 240px;
  color: var(--ink);
  background: var(--paper-raised);
  border: 1px solid var(--paper-line);
}

table { width: 100%; border-collapse: collapse; }

th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--slate);
  padding: 0 14px 10px 0;
  border-bottom: 1px solid var(--paper-line);
}

td { padding: 14px 14px 14px 0; border-bottom: 1px solid var(--paper-line); vertical-align: top; }

tbody tr:hover { background: var(--paper-raised); }

.asset-name { font-weight: 600; }
.asset-note { display: block; color: var(--slate); font-size: 13.5px; margin-top: 3px; max-width: 46ch; }
.num { text-align: right; white-space: nowrap; }
.mono { font-family: var(--mono); font-size: 13px; color: var(--slate); }

/* The verdict column repeated a solid block on every row, which reads as
   decoration rather than information. The colour becomes a dot and the word
   carries itself. Severity keeps the solid chip, because in the debt table it
   is the thing being scanned for. */
.chip {
  display: inline-block;
  padding: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
}

.chip::before {
  content: '';
  display: inline-block;
  vertical-align: middle;
  width: 8px;
  height: 8px;
  margin-right: 7px;
  border-radius: 50%;
  background: var(--chip-dot);
}

.chip.solid { padding: 3px 9px; color: #fff; font-weight: 600; }
.chip.solid::before { display: none; }

/* Inline blocks rather than flexbox, because gap degrades to nothing in older
   engines and the bar disappears entirely. */
.risk { white-space: nowrap; }
.risk-track { display: inline-block; vertical-align: middle; width: 56px; height: 6px; background: var(--paper-line); overflow: hidden; }
.risk-fill { display: block; height: 6px; }
.risk-value { display: inline-block; vertical-align: middle; margin-left: 8px; font-variant-numeric: tabular-nums; font-size: 13px; color: var(--slate); }

/* Without widths the asset column takes a quarter of the table and the uses
   column wraps its own header. */
table { table-layout: fixed; }
#inventory col.c-asset { width: 30%; }
#inventory col.c-primitive { width: 11%; }
#inventory col.c-classical { width: 10%; }
#inventory col.c-quantum { width: 12%; }
#inventory col.c-risk { width: 11%; }
#inventory col.c-uses { width: 6%; }
#inventory col.c-target { width: 20%; }

.wave { margin-bottom: 34px; }
.wave h3 { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-size: 19px; font-weight: 600; margin: 0 0 4px; }
.wave-window { font-size: 13px; font-weight: 400; color: var(--slate); }
.wave-why { color: var(--slate); margin: 0 0 14px; max-width: 68ch; }

.panel h2 { font-size: 21px; font-weight: 600; margin: 0 0 6px; }
.panel > p { color: var(--slate); max-width: 68ch; margin: 0 0 18px; }

@media (max-width: 620px) {
  .vault { padding: 0 18px 30px; }
  #app { padding: 0 18px 60px; }
  .huge { line-height: 0.9; }
  #search { margin-left: 0; width: 100%; }
  .figure { padding-right: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;
}

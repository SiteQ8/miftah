// Reports.
// One assembled model, two renderers. Markdown for the pull request and the
// ticket, HTML for the person who has to present it.

import { t, STRINGS } from './i18n.js';
import { scoreEstate } from './risk.js';
import { buildRoadmap } from './roadmap.js';
import { runChecklist } from './agility.js';
import { horizonStrip, compositionBar, PALETTE } from './timeline.js';
import { THEME, SANS, SANS_AR, MONO, severityColour, quantumColour } from './theme.js';
import { countBySeverity } from './scan.js';

export function assemble(scan, profile = {}, now = new Date()) {
  const estate = scoreEstate(scan.assets || [], profile, now);
  const roadmap = buildRoadmap(scan, profile, now);
  const agility = runChecklist(scan);
  return {
    scan,
    estate,
    roadmap,
    agility,
    severity: countBySeverity(scan.findings || []),
    generatedAt: now.toISOString()
  };
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ------------------------------------------------------------------ markdown

export function toMarkdown(model, locale = 'en') {
  const L = (key, vars) => t(locale, key, vars);
  const { scan, estate, roadmap, agility, severity } = model;
  const out = [];

  out.push(`# ${L('title')}`);
  out.push('');
  out.push(`${L('subtitle')}.`);
  out.push('');
  out.push(`${L('target')}: \`${scan.target}\``);
  out.push(`${L('generated')}: ${model.generatedAt}`);
  out.push('');

  out.push(`## ${L('sectionSummary')}`);
  out.push('');
  out.push(`| | |`);
  out.push(`| --- | --- |`);
  out.push(`| ${L('readiness')} | ${estate.readiness} / 100 |`);
  out.push(`| ${L('peakRisk')} | ${estate.peakRisk} (${L(`band.${estate.band}`)}) |`);
  out.push(`| ${L('assets')} | ${estate.counts.assets} |`);
  out.push(`| ${L('needsMigration')} | ${estate.counts.needsMigration} |`);
  out.push(`| ${L('alreadyResistant')} | ${estate.counts.quantumResistant} |`);
  out.push(`| ${L('findings')} | ${(scan.findings || []).length} |`);
  if (scan.filesScanned !== undefined) out.push(`| ${L('filesScanned')} | ${scan.filesScanned} |`);
  out.push(`| ${L('agilityScore')} | ${agility.score} / 100 ${L('acrossChecks', { scorable: agility.scorable, total: agility.results.length })} |`);
  out.push('');
  out.push(`${L('severity.critical')} ${severity.critical}, ${L('severity.high')} ${severity.high}, ${L('severity.medium')} ${severity.medium}, ${L('severity.low')} ${severity.low}, ${L('severity.info')} ${severity.info}.`);
  out.push('');

  out.push(`## ${L('sectionHorizon')}`);
  out.push('');
  out.push(L('moscaExplain'));
  out.push('');
  const mosca = estate.mosca;
  out.push(mosca.breached
    ? L('moscaBreached', { deficit: mosca.deficit })
    : L('moscaClear', { slack: Math.abs(mosca.deficit) }));
  out.push('');
  out.push(`| | ${L('years')} |`);
  out.push(`| --- | --- |`);
  out.push(`| ${L('shelfLife')} | ${mosca.shelfLife} |`);
  out.push(`| ${L('migrationTime')} | ${mosca.migrationYears} |`);
  out.push(`| ${L('yearsToHorizon')} | ${mosca.yearsToHorizon} |`);
  out.push('');

  out.push(`## ${L('sectionInventory')}`);
  out.push('');
  if (!(scan.assets || []).length) {
    out.push(L('noFindings'));
  } else {
    out.push(`| ${L('colAsset')} | ${L('colPrimitive')} | ${L('colClassical')} | ${L('colQuantum')} | ${L('colRisk')} | ${L('colUses')} | ${L('colTarget')} |`);
    out.push('| --- | --- | --- | --- | ---: | ---: | --- |');
    const scored = new Map(estate.assets.map((a) => [a.id, a]));
    for (const asset of scan.assets) {
      const score = scored.get(asset.id) || { score: 0 };
      out.push(`| ${escapeCell(asset.name)} | ${asset.primitive} | ${L(`classical.${asset.classical}`)} | ${L(`quantum.${asset.quantum}`)} | ${score.score} | ${asset.occurrences.length} | ${escapeCell(asset.replacement || '')} |`);
    }
  }
  out.push('');

  const findings = (scan.findings || []).filter((f) => f.severity !== 'info').slice(0, 100);
  out.push(`## ${L('sectionFindings')}`);
  out.push('');
  if (!findings.length) {
    out.push(L('noFindings'));
  } else {
    out.push(`| ${L('colSeverity')} | ${L('colFinding')} | ${L('colLocation')} | ${L('colAdvice')} |`);
    out.push('| --- | --- | --- | --- |');
    for (const finding of findings) {
      const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      out.push(`| ${L(`severity.${finding.severity}`)} | ${escapeCell(finding.title)} | \`${escapeCell(where)}\` | ${escapeCell(finding.advice)} |`);
    }
  }
  out.push('');

  if ((scan.certificates || []).length) {
    out.push(`## ${L('sectionCertificates')}`);
    out.push('');
    out.push(`| ${L('colAsset')} | ${L('colSignature')} | ${L('colKey')} | ${L('colExpiry')} | ${L('colSeverity')} |`);
    out.push('| --- | --- | --- | ---: | --- |');
    for (const cert of scan.certificates) {
      if (cert.error) continue;
      out.push(`| ${escapeCell((cert.subject || '').split('\n')[0])} | ${escapeCell(cert.signatureAlgorithm)} | ${escapeCell(cert.publicKey.name)} | ${cert.daysLeft} | ${L(`severity.${cert.severity}`)} |`);
    }
    out.push('');
  }

  out.push(`## ${L('sectionRoadmap')}`);
  out.push('');
  out.push(`### ${L('priorityActions')}`);
  out.push('');
  for (const action of roadmap.actions) {
    out.push(`${roadmap.actions.indexOf(action) + 1}. **${escapeCell(action.action)}** ${escapeCell(action.detail)}`);
  }
  out.push('');
  for (const wave of roadmap.waves) {
    out.push(`### ${L('wave')} ${wave.id}. ${wave.name}`);
    out.push('');
    out.push(`${L('window')}: ${wave.window}`);
    out.push('');
    out.push(wave.goal);
    out.push('');
    if (!wave.items.length) {
      out.push(L('noItems'));
      out.push('');
      continue;
    }
    out.push(`| ${L('colAsset')} | ${L('colTarget')} | ${L('colRisk')} | ${L('colUses')} | ${L('colEffort')} |`);
    out.push('| --- | --- | ---: | ---: | --- |');
    for (const item of wave.items) {
      out.push(`| ${escapeCell(item.from)} | ${escapeCell(item.to)} | ${item.risk} | ${item.occurrences} | ${item.effort} |`);
    }
    out.push('');
  }

  out.push(`## ${L('sectionAgility')}`);
  out.push('');
  out.push(`${L('agilityScore')}: ${agility.score} / 100 ${L('acrossChecks', { scorable: agility.scorable, total: agility.results.length })}`);
  out.push('');
  out.push(`| ${L('colStatus')} | ${L('colCheck')} | ${L('colAdvice')} |`);
  out.push('| --- | --- | --- |');
  for (const check of agility.results) {
    out.push(`| ${L(`status.${check.status}`)} | ${escapeCell(check.title)} | ${escapeCell(check.detail)} |`);
  }
  out.push('');

  out.push(`## ${L('sectionMethod')}`);
  out.push('');
  out.push(L('methodText'));
  out.push('');
  out.push(`_${L('footer')}_`);
  out.push('');

  return out.join('\n');
}

// ---------------------------------------------------------------------- html

const SEVERITY_COLOUR = {
  critical: PALETTE.broken,
  high: '#b8541f',
  medium: PALETTE.weakened,
  low: '#6d7b88',
  info: PALETTE.resistant
};

// Amber and green need dark text to stay legible; red and slate need light.
function chipText(background) {
  return background === THEME.signal || background === THEME.live ? THEME.vault : '#ffffff';
}

function chip(label, background) {
  return `<span class="chip" style="--chip-dot:${background}">${escapeHtml(label)}</span>`;
}

// Severity stays solid, because in the findings table it is the thing being
// sorted on and a dot is too quiet to scan.
function solidChip(label, background) {
  return `<span class="chip solid" style="background:${background};color:${chipText(background)}">${escapeHtml(label)}</span>`;
}

function severityChip(label, severity) {
  return solidChip(label, severityColour(severity));
}

// A quantum verdict is not a severity. Routing one through the other made
// "resistant" borrow whatever colour "info" happened to be.
function quantumChip(label, verdict) {
  return chip(label, quantumColour(verdict));
}

function table(headers, rows, align = [], cols = []) {
  const group = cols.length
    ? `<colgroup>${cols.map((c) => `<col class="${c}">`).join('')}</colgroup>`
    : '';
  const head = headers.map((h, i) => `<th${align[i] === 'right' ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell, i) => `<td${align[i] === 'right' ? ' class="num"' : ''}>${cell}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table>${group}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

// A bar that is always the same colour tells you only the length. This tells you
// the band at a glance.
function riskColour(score) {
  if (score >= 75) return THEME.alarm;
  if (score >= 55) return THEME.alarmDeep;
  if (score >= 30) return THEME.signal;
  return THEME.steel;
}

export function toHtml(model, locale = 'en') {
  const L = (key, vars) => t(locale, key, vars);
  const dir = STRINGS[locale] ? STRINGS[locale].dir : 'ltr';
  const { scan, estate, roadmap, agility, severity } = model;
  const mosca = estate.mosca;

  const horizon = horizonStrip(mosca, {
    theme: 'dark',
    rtl: dir === 'rtl',
    yearWord: L('years'),
    labels: {
      migration: L('migrationTime'),
      shelf: L('shelfLife'),
      horizon: L('horizonLabel'),
      exposed: locale === 'ar' ? 'نافذة الانكشاف' : 'Exposed window',
      today: locale === 'ar' ? 'اليوم' : 'Today'
    }
  });

  const composition = compositionBar(estate.counts, {
    labels: {
      broken: L('quantum.broken'),
      weakened: L('quantum.weakened'),
      resistant: L('quantum.resistant')
    }
  });

  const scored = new Map(estate.assets.map((a) => [a.id, a]));

  const inventoryRows = (scan.assets || []).map((asset) => {
    const score = scored.get(asset.id) || { score: 0, band: 'none' };
    return [
      `<strong>${escapeHtml(asset.name)}</strong>${asset.note ? `<span class="note">${escapeHtml(asset.note)}</span>` : ''}`,
      escapeHtml(asset.primitive),
      escapeHtml(L(`classical.${asset.classical}`)),
      quantumChip(L(`quantum.${asset.quantum}`), asset.quantum),
      `<span class="risk"><span class="risk-track"><span class="risk-fill" style="width:${score.score}%;background:${riskColour(score.score)}"></span></span><span class="risk-value">${score.score}</span></span>`,
      String(asset.occurrences.length),
      escapeHtml(asset.replacement || '')
    ];
  });

  const findingRows = (scan.findings || [])
    .filter((f) => f.severity !== 'info')
    .slice(0, 200)
    .map((finding) => [
      severityChip(L(`severity.${finding.severity}`), finding.severity),
      `<strong>${escapeHtml(finding.title)}</strong>${finding.detail ? `<span class="note">${escapeHtml(finding.detail)}</span>` : ''}`,
      `<code>${escapeHtml(finding.line ? `${finding.file}:${finding.line}` : finding.file)}</code>`,
      escapeHtml(finding.advice)
    ]);

  const agilityRows = agility.results.map((check) => [
    `<span class="status status-${check.status}">${escapeHtml(L(`status.${check.status}`))}</span>`,
    `<strong>${escapeHtml(check.title)}</strong><span class="note">${escapeHtml(check.why)}</span>`,
    escapeHtml(check.detail)
  ]);

  const waves = roadmap.waves
    .map((wave) => {
      const rows = wave.items.map((item) => [
        escapeHtml(item.from),
        escapeHtml(item.to),
        String(item.risk),
        String(item.occurrences),
        escapeHtml(item.effort)
      ]);
      return `<section class="wave">
  <h3><span class="wave-mark">${wave.id}</span>${escapeHtml(wave.name)}</h3>
  <p class="wave-window">${escapeHtml(L('window'))}: ${escapeHtml(wave.window)}</p>
  <p class="wave-goal">${escapeHtml(wave.goal)}</p>
  ${wave.items.length
    ? table([L('colAsset'), L('colTarget'), L('colRisk'), L('colUses'), L('colEffort')], rows, ['', '', 'right', 'right', ''])
    : `<p class="empty">${escapeHtml(L('noItems'))}</p>`}
</section>`;
    })
    .join('\n');

  const actions = roadmap.actions
    .map((action) => `<li><strong>${escapeHtml(action.action)}</strong><span class="note">${escapeHtml(action.detail)}</span></li>`)
    .join('\n');

  const certificates = (scan.certificates || []).filter((c) => !c.error);
  const certificateSection = certificates.length
    ? `<section id="certificates"><h2>${escapeHtml(L('sectionCertificates'))}</h2>${table(
        [L('colAsset'), L('colSignature'), L('colKey'), L('colExpiry'), L('colSeverity')],
        certificates.map((cert) => [
          escapeHtml((cert.subject || '').split('\n')[0]),
          escapeHtml(cert.signatureAlgorithm),
          escapeHtml(cert.publicKey.name),
          String(cert.daysLeft),
          severityChip(L(`severity.${cert.severity}`), cert.severity)
        ]),
        ['', '', '', 'right', '']
      )}</section>`
    : '';

  return `<!doctype html>
<html lang="${STRINGS[locale] ? STRINGS[locale].lang : 'en'}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(L('title'))}</title>
<style>
${styles(dir)}
</style>
</head>
<body>
<div class="vault">
  <header class="bar">
    <div class="brand">
      <span class="wordmark">miftah</span>
      <span class="wordmark-ar" lang="ar" dir="rtl">مفتاح</span>
    </div>
    <dl class="meta">
      <div><dt>${escapeHtml(L('target'))}</dt><dd><code>${escapeHtml(scan.target || '')}</code></dd></div>
      <div><dt>${escapeHtml(L('generated'))}</dt><dd>${escapeHtml(model.generatedAt.slice(0, 10))}</dd></div>
    </dl>
  </header>

  <h1>${escapeHtml(L('title'))}</h1>

  <div class="readout-number">
    <span class="huge ${mosca.breached ? '' : 'clear'}">${mosca.breached ? mosca.deficit : Math.abs(mosca.deficit)}</span>
    <span class="huge-unit">${escapeHtml(mosca.breached ? L('exposedYears') : L('marginYears'))}</span>
  </div>

  <p class="verdict">${escapeHtml(mosca.breached ? L('moscaBreached', { deficit: mosca.deficit }) : L('moscaClear', { slack: Math.abs(mosca.deficit) }))}</p>

  <figure class="horizon-figure">${horizon}</figure>
  <p class="horizon-note">${escapeHtml(L('moscaExplain'))}</p>
</div>

<main>
  <section class="figures">
    <div class="figure headline">
      <span class="figure-value">${estate.readiness}</span>
      <span class="figure-label">${escapeHtml(L('readiness'))}</span>
    </div>
    <div class="figure"><span class="figure-value">${estate.counts.needsMigration}</span><span class="figure-label">${escapeHtml(L('needsMigration'))}</span></div>
    <div class="figure"><span class="figure-value">${estate.counts.assets}</span><span class="figure-label">${escapeHtml(L('assets'))}</span></div>
    <div class="figure"><span class="figure-value">${severity.critical + severity.high}</span><span class="figure-label">${escapeHtml(L('severity.critical'))} + ${escapeHtml(L('severity.high'))}</span></div>
    <div class="figure"><span class="figure-value">${agility.score}</span><span class="figure-label">${escapeHtml(L('agilityScore'))}</span></div>
  </section>

  <section id="composition">
    <h2>${escapeHtml(L('sectionHorizon'))}</h2>
    <figure>${composition}</figure>
  </section>

  ${(scan.dependencies || []).length ? `<section id="dependencies">
    <h2>${escapeHtml(L('sectionDependencies'))}</h2>
    <p>${escapeHtml(L('dependenciesExplain'))}</p>
    ${table(
      [L('colLibrary'), L('colEcosystem'), L('colVersion'), L('colProvides'), L('colQuantum'), L('colAdvice')],
      [...scan.dependencies]
        .sort((a, b) => (SEVERITY_ORDER[a.severity] || 9) - (SEVERITY_ORDER[b.severity] || 9))
        .map((dep) => [
          `<strong>${escapeHtml(dep.name)}</strong>`,
          escapeHtml(dep.ecosystem),
          `<code>${escapeHtml(dep.version || '')}</code>`,
          escapeHtml((dep.provides || []).join(', ')),
          quantumChip(L(`quantum.${dep.quantum}`), dep.quantum),
          escapeHtml(dep.advice)
        ]),
      [],
      ['c-lib', 'c-eco', 'c-ver', 'c-prov', 'c-q', 'c-adv']
    )}
  </section>` : ''}

  <section id="inventory">
    <h2>${escapeHtml(L('sectionInventory'))}</h2>
    ${inventoryRows.length
      ? table(
        [L('colAsset'), L('colPrimitive'), L('colClassical'), L('colQuantum'), L('colRisk'), L('colUses'), L('colTarget')],
        inventoryRows,
        ['', '', '', '', '', 'right', ''],
        ['c-asset', 'c-primitive', 'c-classical', 'c-quantum', 'c-risk', 'c-uses', 'c-target']
      )
      : `<p class="empty">${escapeHtml(L('noFindings'))}</p>`}
  </section>

  <section id="findings">
    <h2>${escapeHtml(L('sectionFindings'))}</h2>
    ${findingRows.length
      ? table([L('colSeverity'), L('colFinding'), L('colLocation'), L('colAdvice')], findingRows, [], ['c-sev', 'c-what', 'c-where', 'c-adv'])
      : `<p class="empty">${escapeHtml(L('noFindings'))}</p>`}
  </section>

  ${certificateSection}

  <section id="roadmap">
    <h2>${escapeHtml(L('sectionRoadmap'))}</h2>
    <h3>${escapeHtml(L('priorityActions'))}</h3>
    <ol class="actions">${actions}</ol>
    ${waves}
  </section>

  <section id="agility">
    <h2>${escapeHtml(L('sectionAgility'))}</h2>
    <p class="agility-score">${escapeHtml(L('agilityScore'))} <strong>${agility.score}</strong> / 100
      <span class="muted">${escapeHtml(L('acrossChecks', { scorable: agility.scorable, total: agility.results.length }))}</span></p>
    ${table([L('colStatus'), L('colCheck'), L('colAdvice')], agilityRows)}
  </section>

  <section id="method">
    <h2>${escapeHtml(L('sectionMethod'))}</h2>
    <p>${escapeHtml(L('methodText'))}</p>
  </section>

  <footer><p>${escapeHtml(L('footer'))}</p></footer>
</main>
</body>
</html>`;
}

function styles(dir) {
  const start = dir === 'rtl' ? 'right' : 'left';
  const end = dir === 'rtl' ? 'left' : 'right';
  return `
:root {
  --vault: ${THEME.vault};
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
}

* { box-sizing: border-box; }

html { overflow-x: hidden; }

body {
  margin: 0;
  max-width: 100%;
  background: var(--paper);
  color: var(--ink);
  font-family: ${dir === 'rtl' ? SANS_AR : SANS};
  font-size: 15px;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

.vault { background: var(--vault); color: var(--on-vault); padding: 0 32px 44px; }
.vault > * { max-width: 1180px; margin-left: auto; margin-right: auto; }

.bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 22px 0 34px;
}

.brand { display: flex; align-items: baseline; }
.wordmark { font-size: 19px; font-weight: 600; letter-spacing: 0.02em; margin-${end}: 12px; }
.wordmark-ar { font-size: 19px; color: var(--signal); }

.meta { display: flex; flex-wrap: wrap; margin: 0; font-size: 13px; min-width: 0; max-width: 100%; }
.meta > div { margin-${start}: 26px; }
.meta dt { color: var(--on-vault-dim); margin: 0 0 2px; }
.meta dd { margin: 0; color: var(--on-vault); }
.meta code { font-family: ${MONO}; font-size: 12.5px; }

.vault h1 { font-size: 21px; font-weight: 400; color: var(--on-vault-dim); margin: 0 0 18px; letter-spacing: 0; }

.readout-number { display: flex; align-items: baseline; flex-wrap: wrap; }

.huge {
  font-size: 116px;
  font-size: clamp(58px, 12vw, 128px);
  font-weight: 300;
  line-height: 0.88;
  letter-spacing: -0.035em;
  color: var(--signal);
  margin-${end}: 16px;
}

.huge.clear { color: var(--live); }
.huge-unit { font-size: 17px; color: var(--on-vault-dim); }

.verdict { margin: 18px 0 0; max-width: 62ch; font-size: 17px; color: var(--on-vault); }
.horizon-figure { margin: 28px 0 0; }
.horizon-figure svg { display: block; width: 100%; height: auto; }
.horizon-note { margin: 16px 0 0; max-width: 68ch; font-size: 14px; color: var(--on-vault-dim); }

main { padding: 0 32px 80px; }
main > * { max-width: 1180px; margin-left: auto; margin-right: auto; }

.figures {
  display: -webkit-box;
  display: flex;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--paper-line);
  margin-bottom: 40px;
}

@supports (display: grid) {
  .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
}

.figure { flex: 1 1 140px; min-width: 140px; padding: 24px 20px 24px 0; }
.figure-value { display: block; font-size: 34px; font-weight: 300; line-height: 1.05; letter-spacing: -0.02em; }
.figure-label { display: block; font-size: 13px; color: var(--slate); margin-top: 2px; }
.headline .figure-value { color: var(--alarm); }

section { margin-bottom: 46px; }
h2 { font-size: 22px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }
h3 { font-size: 17px; font-weight: 600; margin: 26px 0 6px; }
p { margin: 0 0 14px; max-width: 74ch; }
figure { margin: 20px 0; }
figure svg { display: block; width: 100%; height: auto; max-width: 920px; }

table { width: 100%; border-collapse: collapse; margin: 14px 0; table-layout: fixed; }
#inventory col.c-asset { width: 27%; }
#inventory col.c-primitive { width: 10%; }
#inventory col.c-classical { width: 9%; }
#inventory col.c-quantum { width: 13%; }
#inventory col.c-risk { width: 11%; }
#inventory col.c-uses { width: 9%; }
#inventory col.c-target { width: 21%; }
#dependencies col.c-lib { width: 18%; }
#dependencies col.c-eco { width: 8%; }
#dependencies col.c-ver { width: 10%; }
#dependencies col.c-prov { width: 16%; }
#dependencies col.c-q { width: 12%; }
#dependencies col.c-adv { width: 36%; }
#findings col.c-sev { width: 9%; }
#findings col.c-what { width: 26%; }
#findings col.c-where { width: 22%; }
#findings col.c-adv { width: 43%; }
th, td { overflow-wrap: break-word; }
td .mono, td code { overflow-wrap: anywhere; }
th { text-align: ${start}; font-size: 12px; font-weight: 600; color: var(--slate); padding: 0 14px 10px 0; border-bottom: 1px solid var(--paper-line); }
td { padding: 13px 14px 13px 0; border-bottom: 1px solid var(--paper-line); vertical-align: top; }
td.right, th.right { text-align: ${end}; }
tbody tr:hover { background: var(--paper-raised); }

.note { display: block; color: var(--slate); font-size: 13.5px; margin-top: 3px; max-width: 46ch; }
.mono, code { font-family: ${MONO}; font-size: 13px; }
/* A file path reads left to right even inside a right to left document. */
code, .mono { direction: ltr; unicode-bidi: isolate; display: inline-block; max-width: 100%; overflow-wrap: anywhere; }
code { color: var(--slate); }

.chip { display: inline-flex; align-items: center; gap: 6px; padding: 0; font-size: 12.5px; font-weight: 500; color: var(--ink); background: none !important; white-space: normal; }
.chip::before { content: ''; display: inline-block; flex: 0 0 auto; width: 8px; height: 8px; margin-${end}: 7px; border-radius: 50%; background: var(--chip-dot); }
.risk { white-space: nowrap; }
.risk-track { display: inline-block; vertical-align: middle; width: 58px; height: 6px; background: var(--paper-line); overflow: hidden; }
.risk-fill { display: block; height: 6px; }
.risk-value { display: inline-block; vertical-align: middle; margin-${start}: 8px; font-variant-numeric: tabular-nums; font-size: 13px; color: var(--slate); }
.chip.solid { padding: 3px 9px; color: #fff; font-weight: 600; white-space: nowrap; }
.chip.solid::before { display: none; }

.wave { margin-bottom: 30px; }
.wave-window { font-size: 13px; font-weight: 400; color: var(--slate); margin-${start}: 10px; }
.empty { color: var(--slate); }

ul { margin: 0 0 14px; padding-${start}: 20px; }
li { margin-bottom: 5px; }

@media (max-width: 620px) {
  .vault { padding: 0 18px 32px; }
  main { padding: 0 18px 60px; }
  .meta > div { margin-${start}: 0; margin-${end}: 24px; }
}

@media print {
  body { background: #fff; font-size: 11pt; }
  .vault { background: #fff; color: var(--ink); padding: 0 0 20pt; border-bottom: 2px solid var(--ink); }
  .vault h1, .horizon-note, .meta dt { color: var(--slate); }
  .verdict, .meta dd, .wordmark { color: var(--ink); }
  .huge { font-size: 60pt; color: var(--alarm); }
  .huge.clear { color: #1a7a5c; }
  main { padding: 0; }
  section { break-inside: avoid; margin-bottom: 24pt; }
  tbody tr:hover { background: none; }
  .chip { border: 1px solid currentColor; }
}
`;
}

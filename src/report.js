// Reports.
// One assembled model, two renderers. Markdown for the pull request and the
// ticket, HTML for the person who has to present it.

import { t, STRINGS } from './i18n.js';
import { scoreEstate } from './risk.js';
import { buildRoadmap } from './roadmap.js';
import { runChecklist } from './agility.js';
import { horizonStrip, compositionBar, PALETTE } from './timeline.js';
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
  out.push(`| ${L('agilityScore')} | ${agility.score} / 100 |`);
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
  out.push(`${L('agilityScore')}: ${agility.score} / 100`);
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

function severityChip(label, severity) {
  return `<span class="chip" style="--chip:${SEVERITY_COLOUR[severity] || PALETTE.muted}">${escapeHtml(label)}</span>`;
}

function table(headers, rows, align = []) {
  const head = headers.map((h, i) => `<th${align[i] === 'right' ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell, i) => `<td${align[i] === 'right' ? ' class="num"' : ''}>${cell}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function toHtml(model, locale = 'en') {
  const L = (key, vars) => t(locale, key, vars);
  const dir = STRINGS[locale] ? STRINGS[locale].dir : 'ltr';
  const { scan, estate, roadmap, agility, severity } = model;
  const mosca = estate.mosca;

  const horizon = horizonStrip(mosca, {
    rtl: dir === 'rtl',
    yearWord: L('years'),
    labels: {
      migration: L('migrationTime'),
      shelf: L('shelfLife'),
      horizon: L('moscaHeading'),
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
      severityChip(L(`quantum.${asset.quantum}`), asset.quantum === 'broken' ? 'critical' : asset.quantum === 'weakened' ? 'medium' : 'info'),
      `<span class="score" style="background-image:linear-gradient(to ${dir === 'rtl' ? 'left' : 'right'}, rgba(168,52,31,0.24) 0%, rgba(168,52,31,0.24) ${score.score}%, transparent ${score.score}%)">${score.score}</span>`,
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
<main>
  <header class="masthead">
    <p class="kicker">${escapeHtml(L('tool'))}</p>
    <h1>${escapeHtml(L('title'))}</h1>
    <p class="lede">${escapeHtml(L('subtitle'))}.</p>
    <dl class="meta">
      <div><dt>${escapeHtml(L('target'))}</dt><dd><code>${escapeHtml(scan.target || '')}</code></dd></div>
      <div><dt>${escapeHtml(L('generated'))}</dt><dd>${escapeHtml(model.generatedAt.slice(0, 10))}</dd></div>
    </dl>
  </header>

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

  <section id="horizon">
    <h2>${escapeHtml(L('sectionHorizon'))}</h2>
    <p>${escapeHtml(L('moscaExplain'))}</p>
    <figure>${horizon}</figure>
    <p class="verdict ${mosca.breached ? 'breached' : 'clear'}">${escapeHtml(mosca.breached ? L('moscaBreached', { deficit: mosca.deficit }) : L('moscaClear', { slack: Math.abs(mosca.deficit) }))}</p>
    <figure>${composition}</figure>
  </section>

  <section id="inventory">
    <h2>${escapeHtml(L('sectionInventory'))}</h2>
    ${inventoryRows.length
      ? table([L('colAsset'), L('colPrimitive'), L('colClassical'), L('colQuantum'), L('colRisk'), L('colUses'), L('colTarget')], inventoryRows, ['', '', '', '', 'right', 'right', ''])
      : `<p class="empty">${escapeHtml(L('noFindings'))}</p>`}
  </section>

  <section id="findings">
    <h2>${escapeHtml(L('sectionFindings'))}</h2>
    ${findingRows.length
      ? table([L('colSeverity'), L('colFinding'), L('colLocation'), L('colAdvice')], findingRows)
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
    <p class="agility-score">${escapeHtml(L('agilityScore'))} <strong>${agility.score}</strong> / 100</p>
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
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: ${dir === 'rtl' ? "'Noto Naskh Arabic', 'Amiri', 'Traditional Arabic', Georgia, serif" : "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"};
  font-size: 17px;
  line-height: 1.65;
}
main { max-width: 1000px; margin: 0 auto; padding: 56px 28px 80px; }
.masthead { border-bottom: 3px double var(--rule); padding-bottom: 28px; margin-bottom: 32px; }
.kicker { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.06em; color: var(--brass); }
h1 { margin: 0 0 8px; font-size: clamp(30px, 5vw, 46px); line-height: 1.12; font-weight: 600; }
.lede { margin: 0 0 20px; color: var(--muted); font-size: 19px; max-width: 62ch; }
.meta { display: flex; flex-wrap: wrap; gap: 28px; margin: 0; }
.meta div { margin: 0; }
.meta dt { font-size: 12px; color: var(--muted); margin: 0 0 2px; }
.meta dd { margin: 0; font-size: 14px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; background: rgba(28,39,51,0.05); padding: 1px 5px; border-radius: 3px; }

.figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); margin-bottom: 48px; }
.figure { background: var(--paper); padding: 20px 18px; display: flex; flex-direction: column; gap: 4px; }
.figure-value { font-size: 34px; line-height: 1; font-variant-numeric: tabular-nums; }
.headline .figure-value { font-size: 54px; color: var(--brass); }
.figure-label { font-size: 12px; color: var(--muted); }

section { margin-bottom: 52px; }
h2 { font-size: 26px; margin: 0 0 14px; font-weight: 600; border-bottom: 1px solid var(--rule); padding-bottom: 8px; }
h3 { font-size: 19px; margin: 28px 0 10px; font-weight: 600; }
p { max-width: 72ch; }
figure { margin: 22px 0; border: 1px solid var(--rule); overflow-x: auto; }
figure svg { display: block; width: 100%; height: auto; }
.verdict { padding: 14px 18px; border-${start}: 4px solid var(--muted); background: rgba(28,39,51,0.03); max-width: none; }
.verdict.breached { border-${start}-color: var(--broken); }
.verdict.clear { border-${start}-color: var(--resistant); }

table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14.5px; }
th, td { text-align: ${start}; padding: 9px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { font-size: 12px; color: var(--muted); font-weight: 600; border-bottom: 2px solid var(--ink); }
td.num, th.num { text-align: ${dir === 'rtl' ? 'left' : 'right'}; font-variant-numeric: tabular-nums; }
tbody tr:hover { background: rgba(168,121,28,0.06); }
.note { display: block; font-size: 12.5px; color: var(--muted); margin-top: 2px; }

.chip { display: inline-block; padding: 2px 9px; border-radius: 2px; font-size: 12px; color: #fff; background: var(--chip); white-space: nowrap; }
.score { display: inline-block; width: 62px; padding: 2px 8px; text-align: ${dir === 'rtl' ? 'left' : 'right'}; font-variant-numeric: tabular-nums; background-color: rgba(168,52,31,0.06); }
.status { display: inline-block; padding: 2px 9px; border-radius: 2px; font-size: 12px; white-space: nowrap; }
.status-pass { background: rgba(47,107,94,0.16); color: var(--resistant); }
.status-fail { background: rgba(168,52,31,0.14); color: var(--broken); }
.status-partial { background: rgba(192,138,26,0.18); color: #8a610f; }
.status-manual { background: rgba(109,123,136,0.14); color: var(--muted); }

.actions { padding-${start}: 22px; max-width: 72ch; }
.actions li { margin-bottom: 10px; }
.wave { margin-top: 32px; padding-top: 4px; }
.wave h3 { display: flex; align-items: baseline; gap: 12px; }
.wave-mark { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid var(--brass); color: var(--brass); font-size: 15px; flex-shrink: 0; }
.wave-window { margin: 0 0 6px; font-size: 13px; color: var(--muted); }
.wave-goal { margin: 0 0 8px; }
.empty { color: var(--muted); font-style: italic; }
.agility-score { font-size: 18px; }
footer { border-top: 1px solid var(--rule); padding-top: 18px; color: var(--muted); font-size: 13px; }

@media (max-width: 640px) {
  main { padding: 32px 16px 56px; }
  table { font-size: 13px; }
  th, td { padding: 7px 8px; }
}
@media print {
  body { background: #fff; }
  tbody tr:hover { background: none; }
}
`;
}

export default toMarkdown;

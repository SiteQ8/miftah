// Visuals.
// Literal colours only, no CSS variables, so the same SVG renders identically
// in a browser, in a Markdown viewer and in anything that rasterises it.

// One font stack for every label. The Arabic faces come first for the RTL
// strip and fall through to the Latin serif everywhere else.
export const FONT = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
export const FONT_AR = "'Noto Naskh Arabic',Amiri,'Traditional Arabic','Iowan Old Style',Georgia,serif";

export const PALETTE = {
  ink: '#1c2733',
  muted: '#6d7b88',
  rule: '#d9d3c6',
  paper: '#faf8f3',
  brass: '#a8791c',
  resistant: '#2f6b5e',
  weakened: '#c08a1a',
  broken: '#a8341f',
  horizon: '#7a2f1c',
  shade: '#efe9dc'
};

function escapeText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The horizon strip. One year axis, the migration and the secrecy requirement
// laid end to end against the year a quantum computer is assumed to arrive.
// Where the secrecy bar crosses the horizon line, that is the exposure.
export function horizonStrip(mosca, options = {}) {
  const width = options.width || 900;
  const height = options.height || 260;
  const rtl = options.rtl === true;
  const FONT_USED = options.fontFamily || (rtl ? FONT_AR : FONT);
  // Browsers apply the bidi algorithm, but only once the direction is declared.
  const DIR = rtl ? ' direction="rtl" unicode-bidi="isolate"' : '';
  const labels = Object.assign(
    {
      migration: 'Migration',
      shelf: 'Data must stay secret',
      horizon: 'Quantum horizon',
      exposed: 'Exposed window',
      today: 'Today'
    },
    options.labels || {}
  );

  const startYear = options.startYear || new Date().getFullYear();
  const migration = Math.max(0, mosca.migrationYears);
  const shelf = Math.max(0, mosca.shelfLife);
  const horizonYears = Math.max(0.1, mosca.yearsToHorizon);
  const span = Math.max(migration + shelf, horizonYears) * 1.12 + 1;

  const left = 92;
  const right = width - 40;
  const usable = right - left;
  const x = (years) => (rtl ? right - (years / span) * usable : left + (years / span) * usable);

  const barY = 104;
  const barH = 38;

  // Everything is computed in years first and mapped to pixels once, so the
  // right to left layout is the same drawing read the other way rather than a
  // second set of arithmetic that can drift from the first.
  const span2px = (fromYear, toYear) => {
    const a = x(fromYear);
    const b = x(toYear);
    return { x: Math.min(a, b), width: Math.abs(b - a) };
  };

  const horizonYear = options.horizonYear || mosca.crqcYear || startYear + Math.round(horizonYears);
  const horizonX = x(horizonYears);
  const exposed = mosca.deficit > 0;
  const exposedFrom = Math.max(horizonYears, migration);
  const exposedTo = migration + shelf;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeText(labels.horizon)}">`);
  parts.push(`<rect width="${width}" height="${height}" fill="${PALETTE.paper}"/>`);

  // Year axis.
  const axisY = barY + barH + 46;
  parts.push(`<line x1="${left}" y1="${axisY}" x2="${right}" y2="${axisY}" stroke="${PALETTE.rule}" stroke-width="1"/>`);
  const step = span > 22 ? 5 : span > 11 ? 2 : 1;
  for (let year = 0; year <= span; year += step) {
    const tick = x(year);
    parts.push(`<line x1="${tick.toFixed(1)}" y1="${axisY}" x2="${tick.toFixed(1)}" y2="${axisY + 6}" stroke="${PALETTE.rule}" stroke-width="1"/>`);
    parts.push(`<text x="${tick.toFixed(1)}" y="${axisY + 22}" font-family="${FONT_USED}" font-size="12" fill="${PALETTE.muted}" text-anchor="middle">${startYear + year}</text>`);
  }

  // The exposed window, drawn first so the bars sit on top of it.
  if (exposed && exposedTo > exposedFrom) {
    const box = span2px(exposedFrom, exposedTo);
    parts.push(`<rect x="${box.x.toFixed(1)}" y="${barY - 22}" width="${box.width.toFixed(1)}" height="${barH + 44}" fill="${PALETTE.broken}" fill-opacity="0.10"/>`);
  }

  // Migration segment.
  const migBox = span2px(0, migration);
  parts.push(`<rect x="${migBox.x.toFixed(1)}" y="${barY}" width="${migBox.width.toFixed(1)}" height="${barH}" fill="${PALETTE.brass}" fill-opacity="0.85"/>`);

  // Secrecy segment.
  const shelfBox = span2px(migration, migration + shelf);
  parts.push(`<rect x="${shelfBox.x.toFixed(1)}" y="${barY}" width="${shelfBox.width.toFixed(1)}" height="${barH}" fill="${PALETTE.ink}" fill-opacity="0.82"/>`);

  // Horizon line.
  parts.push(`<line x1="${horizonX.toFixed(1)}" y1="${barY - 42}" x2="${horizonX.toFixed(1)}" y2="${axisY}" stroke="${PALETTE.horizon}" stroke-width="2" stroke-dasharray="6 4"/>`);
  parts.push(`<circle cx="${horizonX.toFixed(1)}" cy="${(barY - 42).toFixed(1)}" r="4" fill="${PALETTE.horizon}"/>`);

  const anchor = rtl ? 'end' : 'start';
  const horizonAnchor = horizonX > width - 160 ? 'end' : 'start';
  const horizonOffset = horizonAnchor === 'end' ? -8 : 8;

  parts.push(`<text x="${(horizonX + horizonOffset).toFixed(1)}" y="${barY - 50}" font-family="${FONT_USED}"${DIR} font-size="14" font-weight="bold" fill="${PALETTE.horizon}" text-anchor="${horizonAnchor}">${escapeText(labels.horizon)} ${horizonYear}</text>`);

  // Segment labels inside the bars where they fit.
  if (migBox.width > 90) {
    parts.push(`<text x="${(migBox.x + migBox.width / 2).toFixed(1)}" y="${barY + 24}" font-family="${FONT_USED}"${DIR} font-size="13" fill="#ffffff" text-anchor="middle">${escapeText(labels.migration)} ${migration}</text>`);
  }
  if (shelfBox.width > 130) {
    parts.push(`<text x="${(shelfBox.x + shelfBox.width / 2).toFixed(1)}" y="${barY + 24}" font-family="${FONT_USED}"${DIR} font-size="13" fill="#ffffff" text-anchor="middle">${escapeText(labels.shelf)} ${shelf}</text>`);
  }

  if (exposed && exposedTo > exposedFrom) {
    const box = span2px(exposedFrom, exposedTo);
    if (box.width > 60) {
      parts.push(`<text x="${(box.x + box.width / 2).toFixed(1)}" y="${barY + barH + 26}" font-family="${FONT_USED}"${DIR} font-size="13" font-weight="bold" fill="${PALETTE.broken}" text-anchor="middle">${escapeText(labels.exposed)} ${mosca.deficit} ${escapeText(options.yearWord || 'years')}</text>`);
    }
  }

  parts.push(`<text x="${rtl ? right : left}" y="${barY - 14}" font-family="${FONT_USED}"${DIR} font-size="12" fill="${PALETTE.muted}" text-anchor="${anchor}">${escapeText(labels.today)}</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}

// Estate composition. One bar, three shares, no legend chrome.
export function compositionBar(counts, options = {}) {
  const FONT_USED = options.fontFamily || (options.rtl ? FONT_AR : FONT);
  const width = options.width || 900;
  const height = options.height || 96;
  const labels = Object.assign(
    { broken: 'Quantum broken', weakened: 'Weakened', resistant: 'Resistant' },
    options.labels || {}
  );

  const total = Math.max(1, counts.quantumBroken + counts.quantumWeakened + counts.quantumResistant);
  const segments = [
    { value: counts.quantumBroken, colour: PALETTE.broken, label: labels.broken },
    { value: counts.quantumWeakened, colour: PALETTE.weakened, label: labels.weakened },
    { value: counts.quantumResistant, colour: PALETTE.resistant, label: labels.resistant }
  ];

  const left = 20;
  const usable = width - 40;
  const barY = 20;
  const barH = 30;

  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`];
  parts.push(`<rect width="${width}" height="${height}" fill="${PALETTE.paper}"/>`);

  let cursor = left;
  for (const segment of segments) {
    if (!segment.value) continue;
    const segmentWidth = (segment.value / total) * usable;
    parts.push(`<rect x="${cursor.toFixed(1)}" y="${barY}" width="${segmentWidth.toFixed(1)}" height="${barH}" fill="${segment.colour}"/>`);
    if (segmentWidth > 110) {
      parts.push(`<text x="${(cursor + segmentWidth / 2).toFixed(1)}" y="${barY + 20}" font-family="${FONT_USED}" font-size="12" fill="#ffffff" text-anchor="middle">${escapeText(segment.label)} ${segment.value}</text>`);
    }
    cursor += segmentWidth;
  }

  let legendX = left;
  for (const segment of segments) {
    parts.push(`<rect x="${legendX}" y="${barY + barH + 16}" width="10" height="10" fill="${segment.colour}"/>`);
    parts.push(`<text x="${legendX + 16}" y="${barY + barH + 25}" font-family="${FONT_USED}" font-size="12" fill="${PALETTE.muted}">${escapeText(segment.label)} ${segment.value}</text>`);
    legendX += 24 + String(segment.label).length * 7 + 22;
  }

  parts.push('</svg>');
  return parts.join('\n');
}

export default horizonStrip;

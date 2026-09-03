// Visuals.
//
// Literal colours only, no CSS variables, so the same SVG renders identically in
// a browser, in a Markdown viewer and in anything that rasterises it.
//
// The horizon strip is the hero. It draws one continuous timeline: the years the
// migration takes, then the years the data must stay secret, against the year a
// capable quantum computer is assumed to exist. The part of the secrecy
// requirement falling past that line is drawn in the alarm colour rather than
// shaded behind glass, because that segment is not "at risk" in the abstract, it
// is the specific span during which recorded traffic becomes readable.

import { THEME, SANS, SANS_AR } from './theme.js';

export const PALETTE = {
  ink: THEME.ink,
  muted: THEME.slate,
  rule: THEME.paperLine,
  paper: THEME.paper,
  brass: THEME.signal,
  resistant: THEME.live,
  weakened: THEME.signal,
  broken: THEME.alarm,
  horizon: THEME.signal,
  shade: THEME.paperLine
};

export const FONT = SANS;
export const FONT_AR = SANS_AR;

function escapeText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SURFACE = {
  dark: {
    axis: THEME.vaultLine,
    axisText: THEME.onVaultDim,
    migration: THEME.steel,
    migrationText: THEME.onVault,
    secrecy: '#2C5A70',
    secrecyText: THEME.onVault,
    exposed: THEME.signal,
    exposedText: '#0B1A24',
    horizon: THEME.signal,
    horizonText: THEME.signal,
    label: THEME.onVaultDim
  },
  light: {
    axis: THEME.paperLine,
    axisText: THEME.slate,
    migration: '#9DB2BD',
    migrationText: '#0B1A24',
    secrecy: THEME.steel,
    secrecyText: '#FFFFFF',
    exposed: THEME.alarm,
    exposedText: '#FFFFFF',
    horizon: THEME.alarmDeep,
    horizonText: THEME.alarmDeep,
    label: THEME.slate
  }
};

export function horizonStrip(mosca, options = {}) {
  const width = options.width || 960;
  const height = options.height || 210;
  const rtl = options.rtl === true;
  const surface = SURFACE[options.theme === 'dark' ? 'dark' : 'light'];
  const font = options.fontFamily || (rtl ? FONT_AR : FONT);
  const dirAttr = rtl ? ' direction="rtl" unicode-bidi="isolate"' : '';

  const labels = Object.assign(
    {
      migration: 'Migration',
      shelf: 'Must stay secret',
      horizon: 'Quantum horizon',
      exposed: 'Exposed',
      today: 'Today'
    },
    options.labels || {}
  );

  const startYear = options.startYear || new Date().getFullYear();
  const migration = Math.max(0, mosca.migrationYears);
  const shelf = Math.max(0, mosca.shelfLife);
  const horizonYears = Math.max(0.1, mosca.yearsToHorizon);
  const horizonYear = options.horizonYear || mosca.crqcYear || startYear + Math.round(horizonYears);
  const span = Math.max(migration + shelf, horizonYears) * 1.08 + 0.8;

  const left = 28;
  const right = width - 28;
  const usable = right - left;
  const x = (years) => (rtl ? right - (years / span) * usable : left + (years / span) * usable);

  const barY = 74;
  const barH = 56;
  const axisY = barY + barH + 34;

  const between = (fromYear, toYear) => {
    const a = x(fromYear);
    const b = x(toYear);
    return { x: Math.min(a, b), width: Math.abs(b - a) };
  };

  const exposed = mosca.deficit > 0;
  const secrecyEnd = migration + shelf;
  const splitAt = Math.min(Math.max(horizonYears, migration), secrecyEnd);

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeText(labels.horizon)} ${horizonYear}">`
  );

  const text = (value, tx, ty, size, fill, anchor, weight) =>
    `<text x="${Number(tx).toFixed(1)}" y="${ty}" font-family="${font}"${dirAttr} font-size="${size}"${weight ? ` font-weight="${weight}"` : ''} fill="${fill}" text-anchor="${anchor || 'start'}" style="font-variant-numeric:tabular-nums">${escapeText(value)}</text>`;

  parts.push(`<line x1="${left}" y1="${axisY}" x2="${right}" y2="${axisY}" stroke="${surface.axis}" stroke-width="1"/>`);
  const step = span > 18 ? 4 : span > 9 ? 2 : 1;
  for (let year = 0; year <= Math.floor(span); year += step) {
    const tick = x(year);
    parts.push(`<line x1="${tick.toFixed(1)}" y1="${axisY}" x2="${tick.toFixed(1)}" y2="${axisY + 5}" stroke="${surface.axis}" stroke-width="1"/>`);
    parts.push(text(startYear + year, tick, axisY + 22, 12, surface.axisText, 'middle'));
  }

  const migBox = between(0, migration);
  if (migBox.width > 0) {
    parts.push(`<rect x="${migBox.x.toFixed(1)}" y="${barY}" width="${migBox.width.toFixed(1)}" height="${barH}" fill="${surface.migration}"/>`);
    if (migBox.width > 96) {
      parts.push(text(`${labels.migration} ${migration}`, migBox.x + migBox.width / 2, barY + barH / 2 + 5, 14, surface.migrationText, 'middle', 500));
    }
  }

  const safeBox = between(migration, splitAt);
  let secrecyLabelled = false;
  if (safeBox.width > 0) {
    parts.push(`<rect x="${safeBox.x.toFixed(1)}" y="${barY}" width="${safeBox.width.toFixed(1)}" height="${barH}" fill="${surface.secrecy}"/>`);
    if (safeBox.width > 150) {
      parts.push(text(`${labels.shelf} ${shelf}`, safeBox.x + safeBox.width / 2, barY + barH / 2 + 5, 14, surface.secrecyText, 'middle', 500));
      secrecyLabelled = true;
    }
  }

  if (exposed && secrecyEnd > splitAt) {
    const hot = between(splitAt, secrecyEnd);
    parts.push(`<rect x="${hot.x.toFixed(1)}" y="${barY}" width="${hot.width.toFixed(1)}" height="${barH}" fill="${surface.exposed}"/>`);
    const caption = `${labels.exposed} ${mosca.deficit} ${options.yearWord || 'years'}`;
    if (hot.width > 140) {
      parts.push(text(caption, hot.x + hot.width / 2, barY + barH / 2 + 5, 14, surface.exposedText, 'middle', 600));
      // The safe sliver was too narrow to name, so name the whole secrecy span
      // underneath instead. An unlabelled block is worse than a long label.
      if (!secrecyLabelled) {
        const whole = between(migration, secrecyEnd);
        parts.push(text(`${labels.shelf} ${shelf}`, whole.x + whole.width / 2, barY + barH + 24, 13, surface.label, 'middle'));
        secrecyLabelled = true;
      }
    } else {
      parts.push(text(caption, hot.x + hot.width / 2, barY + barH + 24, 13, surface.exposed, 'middle', 600));
    }
  }

  if (!secrecyLabelled && shelf > 0) {
    const whole = between(migration, secrecyEnd);
    parts.push(text(`${labels.shelf} ${shelf}`, whole.x + whole.width / 2, barY + barH + 24, 13, surface.label, 'middle'));
  }

  const horizonX = x(horizonYears);
  parts.push(`<line x1="${horizonX.toFixed(1)}" y1="${barY - 30}" x2="${horizonX.toFixed(1)}" y2="${axisY}" stroke="${surface.horizon}" stroke-width="2"/>`);
  parts.push(`<circle cx="${horizonX.toFixed(1)}" cy="${barY - 30}" r="4" fill="${surface.horizon}"/>`);

  const nearEnd = rtl ? horizonX < 210 : horizonX > width - 210;
  parts.push(
    text(`${labels.horizon} ${horizonYear}`, horizonX + (nearEnd ? -10 : 10), barY - 26, 14, surface.horizonText, nearEnd ? 'end' : 'start', 600)
  );

  parts.push(text(labels.today, rtl ? right : left, barY - 14, 12, surface.label, rtl ? 'end' : 'start'));
  parts.push('</svg>');
  return parts.join('\n');
}

// Estate composition. One bar, three shares, worst first.
export function compositionBar(counts, options = {}) {
  const width = options.width || 860;
  const height = options.height || 76;
  const rtl = options.rtl === true;
  const font = options.fontFamily || (rtl ? FONT_AR : FONT);
  const onDark = options.theme === 'dark';
  const labels = options.labels || {};

  const segments = [
    { label: labels.broken || 'broken', value: counts.quantumBroken || 0, fill: THEME.alarm, text: '#FFFFFF' },
    { label: labels.weakened || 'weakened', value: counts.quantumWeakened || 0, fill: THEME.signal, text: '#0B1A24' },
    { label: labels.resistant || 'resistant', value: counts.quantumResistant || 0, fill: THEME.live, text: '#0B1A24' }
  ].filter((segment) => segment.value > 0);

  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const barH = 34;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="estate composition">`
  ];

  let cursor = 0;
  for (const segment of segments) {
    const segmentWidth = (segment.value / total) * width;
    parts.push(`<rect x="${cursor.toFixed(1)}" y="0" width="${segmentWidth.toFixed(1)}" height="${barH}" fill="${segment.fill}"/>`);
    if (segmentWidth > 42) {
      parts.push(
        `<text x="${(cursor + segmentWidth / 2).toFixed(1)}" y="${barH / 2 + 5}" font-family="${font}" font-size="13" font-weight="600" fill="${segment.text}" text-anchor="middle" style="font-variant-numeric:tabular-nums">${segment.value}</text>`
      );
    }
    cursor += segmentWidth;
  }

  cursor = 0;
  for (const segment of segments) {
    const segmentWidth = (segment.value / total) * width;
    parts.push(
      `<text x="${cursor.toFixed(1)}" y="${barH + 26}" font-family="${font}" font-size="13" fill="${onDark ? THEME.onVaultDim : THEME.slate}">${escapeText(segment.label)}</text>`
    );
    cursor += segmentWidth;
  }

  parts.push('</svg>');
  return parts.join('\n');
}

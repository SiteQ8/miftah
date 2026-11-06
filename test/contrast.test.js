import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { THEME, contrast, luminance, readableOn, severityColour, quantumColour } from '../src/theme.js';
import { toHtml, assemble } from '../src/report.js';
import { buildConsole } from '../src/console.js';
import { SURFACE } from '../src/timeline.js';
import { scanTree } from '../src/scan.js';

const scan = scanTree(path.join(import.meta.dirname, '..', 'examples', 'sample-estate'));

// WCAG 2.1 thresholds. Small text needs 4.5, large text and graphical objects
// need 3.
const SMALL = 4.5;
const LARGE = 3;

test('the contrast function agrees with the published figures', () => {
  // Black on white is the fixed point of the formula, so an error in the
  // luminance maths shows up here rather than in a judgement call.
  assert.equal(Number(contrast('#000000', '#FFFFFF').toFixed(2)), 21);
  assert.equal(Number(contrast('#FFFFFF', '#FFFFFF').toFixed(2)), 1);
  assert.ok(Math.abs(luminance('#FFFFFF') - 1) < 0.001);
  assert.ok(Math.abs(luminance('#000000')) < 0.001);
  assert.equal(contrast('#777777', '#FFFFFF').toFixed(2), contrast('#FFFFFF', '#777777').toFixed(2));
});

test('body text clears the small text threshold on both surfaces', () => {
  const cases = [
    ['ink on paper', THEME.ink, THEME.paper],
    ['slate on paper', THEME.slate, THEME.paper],
    ['slate on a white row', THEME.slate, THEME.paperRaised],
    ['onVault on vault', THEME.onVault, THEME.vault],
    ['onVaultDim on vault', THEME.onVaultDim, THEME.vault]
  ];
  for (const [name, fg, bg] of cases) {
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= SMALL, `${name} is ${ratio.toFixed(2)}:1, below ${SMALL}`);
  }
});

test('the figures on the dark band clear the threshold', () => {
  for (const [name, fg] of [['amber', THEME.signal], ['green', THEME.live]]) {
    const ratio = contrast(fg, THEME.vault);
    assert.ok(ratio >= SMALL, `${name} on the vault is ${ratio.toFixed(2)}:1`);
  }
});

test('the readiness headline is readable on the light surface', () => {
  // It used to be the bright alarm red at 2.81:1, which fails even the three
  // to one allowance that large text gets.
  const ratio = contrast(THEME.alarmDeep, THEME.paper);
  assert.ok(ratio >= LARGE, `the headline figure is ${ratio.toFixed(2)}:1`);
  assert.ok(contrast(THEME.alarm, THEME.paper) < LARGE, 'the bright alarm should still be fill only');
});

test('every severity chip has a readable label', () => {
  // White on the critical red was 3.10:1 for twelve point bold text.
  for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
    const background = severityColour(severity);
    const ratio = contrast(readableOn(background), background);
    assert.ok(ratio >= SMALL, `the ${severity} chip is ${ratio.toFixed(2)}:1`);
  }
});

test('every quantum verdict dot is distinguishable from the surface', () => {
  // The dot is a graphical object carrying meaning, so three to one applies.
  // Two of the four fills sit under that on the light surface, the amber at
  // 1.66 and the green at 2.12, and no fill that still reads as amber or green
  // will clear it. A visible boundary is allowed to carry the requirement
  // instead, so the ring is what has to be measured.
  const ring = '#5A6D77'; // the ink at 55 percent over the light surface
  assert.ok(contrast(ring, THEME.paper) >= LARGE, `the ring is ${contrast(ring, THEME.paper).toFixed(2)}:1 and cannot bound the dot`);

  for (const html of [buildConsole(scan), toHtml(assemble(scan, {}))]) {
    assert.match(html, /\.chip::before[^}]*box-shadow/, 'the verdict dot has no ring to carry its shape');
  }
});

// Vienot, Brettel and Mollon 1999, applied in linear RGB. Each matrix projects
// the gamut onto the plane a dichromat can still see.
const PLANES = {
  protanopia: [[0.1121, 0.8853, -0.0005], [0.1127, 0.8897, -0.0001], [0.0045, 0.0000, 1.0019]],
  deuteranopia: [[0.2920, 0.7054, -0.0003], [0.2934, 0.7089, 0.0000], [-0.0209, 0.0258, 0.9912]],
  tritanopia: [[1.0000, 0.1440, -0.1278], [0.0000, 0.8598, 0.1401], [0.0000, 0.2304, 0.7694]]
};
const toLinear = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
const toByte = (c) => 255 * (Math.min(1, Math.max(0, c)) <= 0.0031308
  ? Math.min(1, Math.max(0, c)) * 12.92
  : 1.055 * Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.4) - 0.055);
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function seenAs(hex, plane) {
  if (plane === 'normal') return channels(hex);
  const [r, g, b] = channels(hex).map(toLinear);
  return PLANES[plane].map((row) => toByte(row[0] * r + row[1] * g + row[2] * b));
}

function toLab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLinear);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const difference = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));

test('the colour vision simulation reproduces a known collapse', () => {
  // A simulation that separates everything would pass any palette put to it.
  // A red and a green matched in luminance is the case with nothing but hue
  // left to tell them apart, so the red green deficiencies have to lose it and
  // the blue yellow one has to keep it.
  const red = '#FF1E1E';
  const green = '#1E9E3C';
  assert.ok(Math.abs(luminance(red) - luminance(green)) < 0.04, 'the probe pair is no longer luminance matched');

  const normal = difference(seenAs(red, 'normal'), seenAs(green, 'normal'));
  assert.ok(normal > 100, `the probe pair is only ${normal.toFixed(0)} apart to begin with`);

  for (const plane of ['protanopia', 'deuteranopia']) {
    const seen = difference(seenAs(red, plane), seenAs(green, plane));
    assert.ok(seen * 4 < normal, `${plane} keeps the pair ${seen.toFixed(0)} apart, so the simulation is not projecting`);
  }
  const tritan = difference(seenAs(red, 'tritanopia'), seenAs(green, 'tritanopia'));
  assert.ok(tritan > normal * 0.8, `tritanopia lost the red green pair, which it should not affect`);
});

test('no two verdicts collapse into one colour for a dichromat', () => {
  // The lightness gap between two fills was the wrong instrument. It rejected
  // this palette over the amber and the green, which sit close in lightness but
  // stay 70 apart to every deficiency measured, and it would have passed a pair
  // that differed in lightness while being the same colour to a dichromat.
  const verdicts = ['broken', 'weakened', 'resistant', 'unknown'];
  const floor = 20;

  for (const plane of ['normal', ...Object.keys(PLANES)]) {
    for (let i = 0; i < verdicts.length; i += 1) {
      for (let j = i + 1; j < verdicts.length; j += 1) {
        const gap = difference(seenAs(quantumColour(verdicts[i]), plane), seenAs(quantumColour(verdicts[j]), plane));
        assert.ok(gap >= floor, `to ${plane}, ${verdicts[i]} and ${verdicts[j]} are ${gap.toFixed(0)} apart, under ${floor}`);
      }
    }
  }
});

test('no two severities collapse into one colour for a dichromat', () => {
  // The chips carry the same risk as the dots, and the critical and high reds
  // are the pair most likely to merge.
  const severities = ['critical', 'high', 'medium', 'low', 'info'];
  for (const plane of ['normal', ...Object.keys(PLANES)]) {
    for (let i = 0; i < severities.length; i += 1) {
      for (let j = i + 1; j < severities.length; j += 1) {
        const gap = difference(seenAs(severityColour(severities[i]), plane), seenAs(severityColour(severities[j]), plane));
        assert.ok(gap >= 10, `to ${plane}, ${severities[i]} and ${severities[j]} are ${gap.toFixed(0)} apart`);
      }
    }
  }
});

test('the text colour is measured rather than listed', () => {
  // The old rule named two backgrounds that get dark text. A palette change
  // would have left a label unreadable with nothing to catch it.
  assert.equal(readableOn('#FFFFFF'), THEME.vault);
  assert.equal(readableOn('#000000'), '#FFFFFF');
  assert.equal(readableOn(THEME.signal), THEME.vault, 'amber needs dark text');
  assert.equal(readableOn(THEME.alarmDeep), '#FFFFFF', 'deep red needs light text');
});

test('no verdict is carried by colour alone', () => {
  // A dot with no word beside it would leave the column unreadable to anyone
  // who cannot separate the hues.
  const html = buildConsole(scan);
  assert.match(html, /\.chip::before/, 'the dot exists');
  for (const word of ['broken', 'weakened', 'resistant', 'unknown']) {
    assert.ok(html.includes(word), `the ${word} verdict has no text beside its dot`);
  }
});

test('every colour pairing in the shipped pages is measured, not asserted here', () => {
  // The cases above name their pairs, so a pairing added later is not covered
  // by any of them. These two read the pairings out of the output itself, which
  // is the only way a new one arrives already checked.
  const html = toHtml(assemble(scan, {}));
  const inline = /background:\s*(#[0-9a-fA-F]{6})\s*;\s*color:\s*(#[0-9a-fA-F]{6})/g;
  let found = 0;
  let match = inline.exec(html);
  while (match) {
    const ratio = contrast(match[2], match[1]);
    assert.ok(ratio >= SMALL, `the report pairs ${match[2]} on ${match[1]} at ${ratio.toFixed(2)}:1`);
    found += 1;
    match = inline.exec(html);
  }
  assert.ok(found >= 4, `only ${found} inline pairings were found, so the pattern has stopped matching`);

  // The console builds its chips in the browser, so its pairings live in two
  // generated maps rather than in the markup.
  const consoleHtml = buildConsole(scan);
  const read = (name) => {
    const found2 = consoleHtml.match(new RegExp('var ' + name + ' = (\\{.*?\\});'));
    assert.ok(found2, `the console no longer declares ${name}`);
    return JSON.parse(found2[1]);
  };
  const fills = read('SEVERITY_COLOUR');
  const labels = read('SEVERITY_TEXT');
  const fallback = read('SEVERITY_FALLBACK');

  assert.deepEqual(Object.keys(fills), Object.keys(labels), 'a severity has a fill with no label, or the reverse');
  for (const [severity, fill] of Object.entries(fills)) {
    const ratio = contrast(labels[severity], fill);
    assert.ok(ratio >= SMALL, `the console ${severity} chip is ${ratio.toFixed(2)}:1`);
  }
  // An unrecognised severity used to fall back to a fill and a label chosen
  // independently, which produced the one pairing readableOn rejects.
  assert.equal(labels.info !== undefined, true);
  assert.ok(contrast(fallback.fg, fallback.bg) >= SMALL, `the fallback chip is ${contrast(fallback.fg, fallback.bg).toFixed(2)}:1`);
  assert.equal(fallback.fg, readableOn(fallback.bg), 'the fallback label is no longer derived from its fill');
});

test('the rendered pages carry no colour the palette does not define', () => {
  // A one off hex in a stylesheet is how a surface drifts out of the system
  // and past the measurements above.
  const known = new Set([
    ...Object.values(THEME).map((v) => String(v).toUpperCase()),
    '#FFFFFF', '#FFF', '#C2CDD4'
  ]);

  for (const [name, html] of [['console', buildConsole(scan)], ['report', toHtml(assemble(scan, {}))]]) {
    const used = new Set((html.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toUpperCase()));
    const stray = [...used].filter((h) => !known.has(h));
    assert.deepEqual(stray, [], `${name} uses colours outside the palette: ${stray.join(', ')}`);
  }
});

test('every chart band carries a readable label', () => {
  // The dark migration band sat at 3.99 because the label colour was chosen for
  // softness rather than measured. These three are fills with the label inside
  // them. The axis and the horizon are lines whose labels sit on the page
  // behind, so they are measured against that instead.
  const inside = ['migration', 'secrecy', 'exposed'];
  const behind = { dark: THEME.vault, light: THEME.paper };

  for (const [surface, bands] of Object.entries(SURFACE)) {
    for (const key of inside) {
      const ratio = contrast(bands[`${key}Text`], bands[key]);
      assert.ok(ratio >= SMALL, `the ${surface} ${key} band is ${ratio.toFixed(2)}:1`);
    }
    for (const key of ['axisText', 'label']) {
      const ratio = contrast(bands[key], behind[surface]);
      assert.ok(ratio >= SMALL, `the ${surface} ${key} is ${ratio.toFixed(2)}:1 on the page behind it`);
    }
    // The horizon marks the year everything turns on, so it is the one label
    // allowed to be loud rather than quiet.
    assert.ok(contrast(bands.horizonText, behind[surface]) >= LARGE, `the ${surface} horizon label is too quiet`);
  }
});

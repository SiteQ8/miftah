// Design tokens.
//
// The subject is an instrument reading a deadline nobody can see, so the number
// is the interface and everything else gets out of its way.
//
// Dark is the archive that already holds your recorded traffic. Light is your
// working surface. The split is structural rather than decorative, which is why
// the hero band and the data tables do not share a background.
//
// Literal hex only. These values are read by SVG generators as well as CSS, and
// a rasteriser cannot resolve a custom property.

export const THEME = {
  // The archive. A true petrol blue rather than a tinted near black, because
  // near black with one bright accent is the look every generated page reaches
  // for and this needs its own.
  vault: '#0B1A24',
  vaultRaised: '#132C3A',
  vaultLine: '#1F4256',

  // Your working surface. Cool grey, deliberately not warm cream.
  paper: '#F2F4F5',
  paperRaised: '#FFFFFF',
  paperLine: '#D5DCE0',

  ink: '#0B1A24',
  slate: '#5A727F',
  slateDim: '#8FA3AD',
  onVault: '#E8EFF2',
  onVaultDim: '#8FA9B6',

  // Two signal colours used as a system. Amber is time running out, green is
  // what survives the machine, red is what is already broken today.
  signal: '#FFB020',
  signalDim: '#7A5410',
  live: '#2FBF8F',
  alarm: '#FF5A3C',
  alarmDeep: '#B3341F',
  steel: '#4E7A92'
};

// One family everywhere. Webfonts are not an option because the console has to
// work offline as a single file, so the deliberate choice lives in the
// treatment: tabular figures, a wide weight range and extreme scale contrast.
export const SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif";
export const SANS_AR =
  "'Noto Sans Arabic', 'Segoe UI', ui-sans-serif, system-ui, -apple-system, Arial, sans-serif";
export const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace";

// Severity and verdict colours, resolved once so no surface invents its own.
export function severityColour(severity) {
  return {
    critical: THEME.alarm,
    high: THEME.alarmDeep,
    medium: THEME.signal,
    low: THEME.steel,
    info: THEME.slate
  }[severity] || THEME.slate;
}

export function quantumColour(verdict) {
  return {
    broken: THEME.alarm,
    weakened: THEME.signal,
    resistant: THEME.live,
    unknown: THEME.slate
  }[verdict] || THEME.slate;
}

export function fontFor(locale) {
  return locale === 'ar' ? SANS_AR : SANS;
}

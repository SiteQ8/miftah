// Public API. Everything the CLI does is reachable from here.

export { CATALOG, CURVES, MODES, CLASSICAL, QUANTUM, PRIMITIVE, lookup, gradeModulus } from './catalog.js';
export { RULES, SEVERITY, SEVERITY_WEIGHT, SCANNABLE, SKIP_DIRS } from './rules.js';
export { scanTree, scanText, walk, inventory, countBySeverity, isScannable } from './scan.js';
export { readCertificates, describeCertificate, inspectPath, gradeSignature, gradePublicKey } from './certs.js';
export { probe as probeTls, parseEndpoint, classifySuite, classifyGroup } from './tls.js';
export { probeSsh, parseKexInit, evaluate as evaluateSsh } from './ssh.js';
export { buildCbom, validateCbom, certificateComponent, SPEC_VERSION } from './cbom.js';
export { scoreEstate, scoreAsset, moscaDeficit, normaliseProfile, band, DEFAULT_PROFILE } from './risk.js';
export { buildRoadmap, WAVES } from './roadmap.js';
export { runChecklist, CHECKS, STATUS } from './agility.js';
export { assemble, toMarkdown, toHtml } from './report.js';
export { horizonStrip, compositionBar, PALETTE } from './timeline.js';
export { buildConsole } from './console.js';
export { t, STRINGS, LOCALES } from './i18n.js';

export { VERSION } from './version.js';

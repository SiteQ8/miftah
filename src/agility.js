// Crypto agility checklist.
// Migrating once is a project. Being able to migrate again is a property. Each
// item below is answered from scan evidence where the evidence exists, and left
// open where only a human can answer it.

import { QUANTUM } from './catalog.js';

export const STATUS = { PASS: 'pass', FAIL: 'fail', PARTIAL: 'partial', MANUAL: 'manual' };

export const CHECKS = [
  {
    id: 'AGL-01',
    title: 'A cryptographic inventory exists and is current',
    why: 'You cannot migrate what you cannot name. This is the item every other item rests on.',
    evaluate: (scan) => (scan.assets && scan.assets.length
      ? { status: STATUS.PASS, detail: `${scan.assets.length} cryptographic assets identified` }
      : { status: STATUS.FAIL, detail: 'No inventory produced' })
  },
  {
    id: 'AGL-02',
    title: 'The inventory is machine readable and regenerated automatically',
    why: 'A CBOM in a spreadsheet is a snapshot. A CBOM in CI is a control.',
    evaluate: () => ({ status: STATUS.MANUAL, detail: 'Confirm miftah runs in the pipeline, not only by hand' })
  },
  {
    id: 'AGL-03',
    title: 'No broken primitive remains in the estate',
    why: 'MD5, SHA-1, DES, RC4 and ECB are failures today, independent of any quantum timeline.',
    evaluate: (scan) => {
      const broken = (scan.findings || []).filter((f) => ['MFT-H001', 'MFT-H002', 'MFT-H003', 'MFT-C001', 'MFT-C002', 'MFT-C003', 'MFT-C004', 'MFT-C006'].includes(f.rule));
      return broken.length
        ? { status: STATUS.FAIL, detail: `${broken.length} occurrences of broken primitives` }
        : { status: STATUS.PASS, detail: 'None found' };
    }
  },
  {
    id: 'AGL-04',
    title: 'No key material is held in source or configuration',
    why: 'Agility means rotating a key without shipping code. A literal key makes rotation a release.',
    evaluate: (scan) => {
      const keys = (scan.findings || []).filter((f) => f.rule === 'MFT-K001' || f.rule === 'MFT-K002');
      return keys.length
        ? { status: STATUS.FAIL, detail: `${keys.length} occurrences of embedded key material` }
        : { status: STATUS.PASS, detail: 'None found' };
    }
  },
  {
    id: 'AGL-05',
    title: 'Algorithm choices are configuration, not literals',
    why: 'If the cipher name is compiled in, the next migration costs a rebuild of every component.',
    evaluate: (scan) => {
      const literals = (scan.findings || []).filter((f) => f.algorithm && !/\.(ya?ml|json|toml|ini|conf|cnf|properties)$/i.test(f.file));
      const config = (scan.findings || []).filter((f) => f.algorithm && /\.(ya?ml|json|toml|ini|conf|cnf|properties)$/i.test(f.file));
      if (!literals.length && !config.length) return { status: STATUS.MANUAL, detail: 'No algorithm references found to judge' };
      const share = Math.round((config.length / (config.length + literals.length)) * 100);
      if (share >= 60) return { status: STATUS.PASS, detail: `${share} percent of algorithm references sit in configuration` };
      if (share >= 25) return { status: STATUS.PARTIAL, detail: `Only ${share} percent of algorithm references sit in configuration` };
      return { status: STATUS.FAIL, detail: `${share} percent of algorithm references sit in configuration, the rest are hard coded` };
    }
  },
  {
    id: 'AGL-06',
    title: 'Symmetric keys are 256 bits where the data outlives 2035',
    why: 'Grover halves the key. Doubling it is the entire mitigation and it is cheap.',
    evaluate: (scan) => {
      const weak = (scan.assets || []).filter((a) => a.quantum === QUANTUM.WEAKENED);
      return weak.length
        ? { status: STATUS.PARTIAL, detail: `${weak.map((a) => a.name).join(', ')} leave reduced margin` }
        : { status: STATUS.PASS, detail: 'No Grover weakened symmetric assets found' };
    }
  },
  {
    id: 'AGL-07',
    title: 'Key establishment uses a hybrid post quantum group',
    why: 'This is the only control that addresses traffic recorded today and decrypted later.',
    evaluate: (scan) => {
      const hybrid = (scan.assets || []).some((a) => /MLKEM|KYBER|SNTRUP/i.test(a.name || ''));
      const classical = (scan.assets || []).some((a) => a.primitive === 'key-agree' && a.quantum === QUANTUM.BROKEN);
      if (hybrid && !classical) return { status: STATUS.PASS, detail: 'Hybrid key establishment in place' };
      if (hybrid && classical) return { status: STATUS.PARTIAL, detail: 'Hybrid present alongside classical only paths' };
      return { status: STATUS.FAIL, detail: 'No post quantum key establishment found' };
    }
  },
  {
    id: 'AGL-08',
    title: 'Certificates carry SHA-256 or stronger and expire inside 398 days',
    why: 'Short lifetimes are what make an algorithm change tractable at all.',
    evaluate: (scan) => {
      const certs = scan.certificates || [];
      if (!certs.length) return { status: STATUS.MANUAL, detail: 'No certificates inspected in this run' };
      const bad = certs.filter((c) => c.severity === 'critical' || c.severity === 'high');
      return bad.length
        ? { status: STATUS.FAIL, detail: `${bad.length} of ${certs.length} certificates are weak or near expiry` }
        : { status: STATUS.PASS, detail: `${certs.length} certificates checked` };
    }
  },
  {
    id: 'AGL-09',
    title: 'Randomness comes from a cryptographic source everywhere',
    why: 'A predictable nonce defeats a perfect cipher.',
    evaluate: (scan) => {
      const weak = (scan.findings || []).filter((f) => f.rule === 'MFT-K004' || f.rule === 'MFT-K003');
      return weak.length
        ? { status: STATUS.FAIL, detail: `${weak.length} occurrences of weak randomness or static IVs` }
        : { status: STATUS.PASS, detail: 'None found' };
    }
  },
  {
    id: 'AGL-10',
    title: 'Transport refuses anything below TLS 1.2',
    why: 'Old versions carry the suites that no amount of key length can rescue.',
    evaluate: (scan) => {
      const old = (scan.findings || []).filter((f) => f.rule === 'MFT-T001' || (f.rule === 'MFT-T010' && /TLSv1(\.1)?$/.test(f.title)));
      return old.length
        ? { status: STATUS.FAIL, detail: `${old.length} occurrences permitting TLS 1.1 or below` }
        : { status: STATUS.PASS, detail: 'No deprecated versions found' };
    }
  },
  {
    id: 'AGL-11',
    title: 'A named owner is accountable for the migration',
    why: 'Every cryptographic migration that succeeded had one. Every one that stalled did not.',
    evaluate: () => ({ status: STATUS.MANUAL, detail: 'Name the owner and the review cadence' })
  },
  {
    id: 'AGL-12',
    title: 'Suppliers have been asked for their post quantum timeline',
    why: 'Most of the estate is bought, not built. Their schedule becomes yours.',
    evaluate: (scan) => (scan.vendors && scan.vendors.length
      ? { status: STATUS.PARTIAL, detail: `${scan.vendors.length} suppliers listed, confirm each has a published date` }
      : { status: STATUS.MANUAL, detail: 'Supply a vendor list with --vendors to track this' })
  },
  {
    id: 'AGL-13',
    title: 'A rollback path exists for every algorithm change',
    why: 'Hybrid modes exist precisely so a failed migration is survivable.',
    evaluate: () => ({ status: STATUS.MANUAL, detail: 'Confirm each change can be reversed without a release' })
  },
  {
    id: 'AGL-14',
    title: 'Protocol changes have been tested against signature and key size growth',
    why: 'ML-DSA signatures and ML-KEM keys are larger. Buffers, MTUs and hardware limits are where migrations break.',
    evaluate: () => ({ status: STATUS.MANUAL, detail: 'Test with ML-DSA-65 sized artefacts before committing' })
  }
];

export function runChecklist(scan) {
  const results = CHECKS.map((check) => {
    const outcome = check.evaluate(scan) || { status: STATUS.MANUAL, detail: '' };
    return {
      id: check.id,
      title: check.title,
      why: check.why,
      status: outcome.status,
      detail: outcome.detail
    };
  });

  const counts = { pass: 0, fail: 0, partial: 0, manual: 0 };
  for (const result of results) counts[result.status] += 1;

  const scored = counts.pass + counts.partial * 0.5;
  const scorable = results.length - counts.manual;
  const score = scorable ? Math.round((scored / scorable) * 100) : 0;

  return { results, counts, score, scorable };
}

export default runChecklist;

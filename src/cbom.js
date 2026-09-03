// CBOM writer.
// Emits CycloneDX 1.6 with cryptographic-asset components, so the output drops
// into whatever already consumes SBOMs rather than becoming another silo.

import crypto from 'node:crypto';
import { lookup } from './catalog.js';

export const SPEC_VERSION = '1.6';

const FUNCTION_ENUM = new Set([
  'generate', 'keygen', 'encrypt', 'decrypt', 'digest', 'tag', 'keyderive',
  'sign', 'verify', 'encapsulate', 'decapsulate', 'other', 'unknown'
]);

const PRIMITIVE_ENUM = new Set([
  'drbg', 'mac', 'block-cipher', 'stream-cipher', 'signature', 'hash', 'pke',
  'xof', 'kdf', 'key-agree', 'kem', 'ae', 'combiner', 'other', 'unknown'
]);

const MATERIAL_ENUM = new Set([
  'private-key', 'public-key', 'secret-key', 'key', 'ciphertext', 'signature',
  'digest', 'initialization-vector', 'nonce', 'seed', 'salt', 'shared-secret',
  'tag', 'additional-data', 'password', 'credential', 'token', 'other', 'unknown'
]);

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed';
}

function bomRef(kind, name) {
  return `crypto/${kind}/${slug(name)}`;
}

function occurrences(asset) {
  return (asset.occurrences || []).slice(0, 200).map((item) => {
    const entry = { location: item.file };
    if (item.line) entry.line = item.line;
    if (item.detail) entry.additionalContext = item.detail;
    return entry;
  });
}

function algorithmComponent(asset) {
  const meta = lookup(asset.algorithm) || {};
  const primitive = PRIMITIVE_ENUM.has(asset.primitive) ? asset.primitive : 'unknown';
  const functions = (asset.functions || meta.functions || []).filter((f) => FUNCTION_ENUM.has(f));

  const algorithmProperties = {
    primitive,
    executionEnvironment: 'software-plain-ram',
    implementationPlatform: 'generic',
    certificationLevel: ['none'],
    cryptoFunctions: functions.length ? functions : ['unknown'],
    nistQuantumSecurityLevel: asset.nistLevel || 0
  };

  if (asset.bits) algorithmProperties.parameterSetIdentifier = String(asset.bits);
  if (asset.mode) algorithmProperties.mode = String(asset.mode).toLowerCase();

  const component = {
    type: 'cryptographic-asset',
    'bom-ref': bomRef('algorithm', asset.id),
    name: asset.name,
    description: asset.note || undefined,
    cryptoProperties: {
      assetType: 'algorithm',
      algorithmProperties
    }
  };

  if (asset.oid) component.cryptoProperties.oid = asset.oid;

  const evidence = occurrences(asset);
  if (evidence.length) component.evidence = { occurrences: evidence };

  component.properties = [
    { name: 'miftah:classical', value: String(asset.classical) },
    { name: 'miftah:quantum', value: String(asset.quantum) },
    { name: 'miftah:severity', value: String(asset.severity) },
    { name: 'miftah:occurrences', value: String((asset.occurrences || []).length) }
  ];
  if (asset.replacement) {
    component.properties.push({ name: 'miftah:replacement', value: asset.replacement });
  }

  return component;
}

function materialComponent(asset) {
  const type = MATERIAL_ENUM.has(asset.materialType) ? asset.materialType : 'other';
  const component = {
    type: 'cryptographic-asset',
    'bom-ref': bomRef('material', asset.id),
    name: asset.name,
    cryptoProperties: {
      assetType: 'related-crypto-material',
      relatedCryptoMaterialProperties: {
        type,
        state: 'active'
      }
    },
    properties: [
      { name: 'miftah:severity', value: String(asset.severity) },
      { name: 'miftah:occurrences', value: String((asset.occurrences || []).length) }
    ]
  };
  const evidence = occurrences(asset);
  if (evidence.length) component.evidence = { occurrences: evidence };
  return component;
}

function protocolComponent(asset) {
  return {
    type: 'cryptographic-asset',
    'bom-ref': bomRef('protocol', asset.id),
    name: asset.name,
    cryptoProperties: {
      assetType: 'protocol',
      protocolProperties: {
        type: asset.protocol === 'ssh' ? 'ssh' : 'tls',
        version: asset.version || undefined
      }
    },
    evidence: occurrences(asset).length ? { occurrences: occurrences(asset) } : undefined,
    properties: [
      { name: 'miftah:severity', value: String(asset.severity) },
      { name: 'miftah:quantum', value: String(asset.quantum) }
    ]
  };
}

export function certificateComponent(cert, index = 0) {
  const name = cert.subject ? cert.subject.split('\n')[0] : `certificate ${index}`;
  const properties = {
    assetType: 'certificate',
    certificateProperties: {
      subjectName: cert.subject ? cert.subject.replace(/\n/g, ', ') : undefined,
      issuerName: cert.issuer ? cert.issuer.replace(/\n/g, ', ') : undefined,
      notValidBefore: cert.validFrom,
      notValidAfter: cert.validTo,
      certificateFormat: 'X.509',
      certificateExtension: 'crt'
    }
  };

  if (cert.signature && cert.signatureAlgorithm) {
    properties.certificateProperties.signatureAlgorithmRef = bomRef('algorithm', cert.signatureAlgorithm);
  }
  if (cert.publicKey && cert.publicKey.name) {
    properties.certificateProperties.subjectPublicKeyRef = bomRef('algorithm', cert.publicKey.name);
  }

  return {
    type: 'cryptographic-asset',
    'bom-ref': bomRef('certificate', cert.fingerprint256 || `${name}-${index}`),
    name,
    cryptoProperties: properties,
    properties: [
      { name: 'miftah:severity', value: String(cert.severity || 'info') },
      { name: 'miftah:quantum', value: String(cert.quantum || 'unknown') },
      { name: 'miftah:daysLeft', value: String(cert.daysLeft ?? '') },
      { name: 'miftah:signatureAlgorithm', value: String(cert.signatureAlgorithm || 'unknown') }
    ]
  };
}

export function buildCbom(scan, options = {}) {
  const now = options.now || new Date();
  const serial = options.serialNumber || `urn:uuid:${crypto.randomUUID()}`;
  const assets = scan.assets || [];
  const components = [];

  for (const asset of assets) {
    if (asset.materialType) components.push(materialComponent(asset));
    else if (asset.protocol && !asset.algorithm) components.push(protocolComponent(asset));
    else components.push(algorithmComponent(asset));
  }

  for (const [index, cert] of (scan.certificates || []).entries()) {
    if (cert && !cert.error) components.push(certificateComponent(cert, index));
  }

  const dependencies = components.map((component) => ({
    ref: component['bom-ref'],
    dependsOn: []
  }));

  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: SPEC_VERSION,
    serialNumber: serial,
    version: 1,
    metadata: {
      timestamp: now.toISOString(),
      tools: {
        components: [
          {
            type: 'application',
            name: 'miftah',
            version: options.version || '0.1.0',
            author: 'SiteQ8',
            description: 'Cryptographic inventory and post-quantum readiness'
          }
        ]
      },
      component: {
        type: 'application',
        'bom-ref': `target/${slug(options.name || scan.target || 'target')}`,
        name: options.name || basename(scan.target || 'target'),
        version: options.targetVersion || 'unversioned'
      }
    },
    components,
    dependencies
  };

  if (scan.assets) {
    bom.metadata.properties = [
      { name: 'miftah:filesScanned', value: String(scan.filesScanned ?? '') },
      { name: 'miftah:findings', value: String((scan.findings || []).length) },
      { name: 'miftah:assets', value: String(assets.length) }
    ];
  }

  return bom;
}

function basename(target) {
  const parts = String(target).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || 'target';
}

// A cheap structural check so a malformed CBOM never leaves the tool.
export function validateCbom(bom) {
  const errors = [];
  if (bom.bomFormat !== 'CycloneDX') errors.push('bomFormat must be CycloneDX');
  if (bom.specVersion !== SPEC_VERSION) errors.push(`specVersion must be ${SPEC_VERSION}`);
  if (!/^urn:uuid:[0-9a-f-]{36}$/.test(bom.serialNumber || '')) errors.push('serialNumber must be a urn uuid');
  if (!Array.isArray(bom.components)) errors.push('components must be an array');

  for (const component of bom.components || []) {
    if (component.type !== 'cryptographic-asset') {
      errors.push(`component ${component.name} must be a cryptographic-asset`);
    }
    const props = component.cryptoProperties;
    if (!props) {
      errors.push(`component ${component.name} has no cryptoProperties`);
      continue;
    }
    if (!['algorithm', 'certificate', 'protocol', 'related-crypto-material'].includes(props.assetType)) {
      errors.push(`component ${component.name} has an unknown assetType ${props.assetType}`);
    }
    if (props.assetType === 'algorithm') {
      const algorithm = props.algorithmProperties || {};
      if (!PRIMITIVE_ENUM.has(algorithm.primitive)) {
        errors.push(`component ${component.name} has an invalid primitive ${algorithm.primitive}`);
      }
      for (const fn of algorithm.cryptoFunctions || []) {
        if (!FUNCTION_ENUM.has(fn)) errors.push(`component ${component.name} has an invalid cryptoFunction ${fn}`);
      }
      const level = algorithm.nistQuantumSecurityLevel;
      if (typeof level !== 'number' || level < 0 || level > 6) {
        errors.push(`component ${component.name} has an invalid nistQuantumSecurityLevel`);
      }
    }
    if (props.assetType === 'related-crypto-material') {
      const material = props.relatedCryptoMaterialProperties || {};
      if (!MATERIAL_ENUM.has(material.type)) {
        errors.push(`component ${component.name} has an invalid material type ${material.type}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export default buildCbom;

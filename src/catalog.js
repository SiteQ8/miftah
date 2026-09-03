// Algorithm catalogue.
// Every algorithm Miftah can name carries a classical verdict, a quantum verdict,
// a CycloneDX primitive, an OID where one is registered, and the NIST post quantum
// security level (0 means no quantum security at all).

export const CLASSICAL = {
  BROKEN: 'broken',
  WEAK: 'weak',
  LEGACY: 'legacy',
  ACCEPTABLE: 'acceptable',
  STRONG: 'strong'
};

export const QUANTUM = {
  // Shor breaks it outright. Everything asymmetric that rests on factoring or
  // discrete logarithms lands here.
  BROKEN: 'broken',
  // Grover halves the effective strength. Survivable by doubling the key.
  WEAKENED: 'weakened',
  // Believed to resist a cryptographically relevant quantum computer.
  RESISTANT: 'resistant',
  UNKNOWN: 'unknown'
};

// CycloneDX 1.6 cryptoProperties.algorithmProperties.primitive enumeration.
export const PRIMITIVE = {
  AE: 'ae',
  BLOCK_CIPHER: 'block-cipher',
  COMBINER: 'combiner',
  DRBG: 'drbg',
  HASH: 'hash',
  KDF: 'kdf',
  KEM: 'kem',
  KEY_AGREE: 'key-agree',
  MAC: 'mac',
  OTHER: 'other',
  PKE: 'pke',
  SIGNATURE: 'signature',
  STREAM_CIPHER: 'stream-cipher',
  UNKNOWN: 'unknown',
  XOF: 'xof'
};

function entry(name, spec) {
  return Object.assign(
    {
      name,
      primitive: PRIMITIVE.UNKNOWN,
      classical: CLASSICAL.ACCEPTABLE,
      quantum: QUANTUM.UNKNOWN,
      nistLevel: 0,
      functions: [],
      oid: null,
      replacement: null,
      note: ''
    },
    spec
  );
}

// Asymmetric. All of it falls to Shor.
const ASYMMETRIC = {
  RSA: entry('RSA', {
    primitive: PRIMITIVE.PKE,
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.BROKEN,
    functions: ['encrypt', 'decrypt', 'sign', 'verify'],
    oid: '1.2.840.113549.1.1.1',
    replacement: 'ML-KEM-768 for key establishment, ML-DSA-65 for signatures',
    note: 'Factoring. A cryptographically relevant quantum computer recovers the private key.'
  }),
  DSA: entry('DSA', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.LEGACY,
    quantum: QUANTUM.BROKEN,
    functions: ['sign', 'verify'],
    oid: '1.2.840.10040.4.1',
    replacement: 'ML-DSA-65',
    note: 'Finite field discrete log. Withdrawn for new signatures by NIST SP 800 186.'
  }),
  DH: entry('DH', {
    primitive: PRIMITIVE.KEY_AGREE,
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.BROKEN,
    functions: ['keyderive'],
    oid: '1.2.840.113549.1.3.1',
    replacement: 'X25519MLKEM768 hybrid key exchange',
    note: 'Finite field discrete log.'
  }),
  ECDH: entry('ECDH', {
    primitive: PRIMITIVE.KEY_AGREE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    functions: ['keyderive'],
    oid: '1.3.132.1.12',
    replacement: 'X25519MLKEM768 hybrid key exchange',
    note: 'Elliptic curve discrete log. Breaks faster than RSA on the same machine.'
  }),
  ECDSA: entry('ECDSA', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    functions: ['sign', 'verify'],
    oid: '1.2.840.10045.4.3.2',
    replacement: 'ML-DSA-65, or SLH-DSA where a conservative hash based signature is wanted',
    note: 'Elliptic curve discrete log.'
  }),
  ED25519: entry('Ed25519', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    functions: ['sign', 'verify'],
    oid: '1.3.101.112',
    replacement: 'ML-DSA-65',
    note: 'Edwards curve discrete log.'
  }),
  ED448: entry('Ed448', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    functions: ['sign', 'verify'],
    oid: '1.3.101.113',
    replacement: 'ML-DSA-87',
    note: 'Edwards curve discrete log.'
  }),
  X25519: entry('X25519', {
    primitive: PRIMITIVE.KEY_AGREE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    functions: ['keyderive'],
    oid: '1.3.101.110',
    replacement: 'X25519MLKEM768 hybrid key exchange',
    note: 'Montgomery curve discrete log. Keep it as the classical half of a hybrid.'
  }),
  X448: entry('X448', {
    primitive: PRIMITIVE.KEY_AGREE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    functions: ['keyderive'],
    oid: '1.3.101.111',
    replacement: 'X25519MLKEM768 hybrid key exchange'
  }),
  ELGAMAL: entry('ElGamal', {
    primitive: PRIMITIVE.PKE,
    classical: CLASSICAL.LEGACY,
    quantum: QUANTUM.BROKEN,
    functions: ['encrypt', 'decrypt'],
    replacement: 'ML-KEM-768'
  })
};

// Post quantum. The destination.
const POST_QUANTUM = {
  'ML-KEM-512': entry('ML-KEM-512', {
    primitive: PRIMITIVE.KEM,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 1,
    functions: ['encapsulate', 'decapsulate', 'keygen'],
    oid: '2.16.840.1.101.3.4.4.1',
    note: 'FIPS 203. Module lattice key encapsulation.'
  }),
  'ML-KEM-768': entry('ML-KEM-768', {
    primitive: PRIMITIVE.KEM,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 3,
    functions: ['encapsulate', 'decapsulate', 'keygen'],
    oid: '2.16.840.1.101.3.4.4.2',
    note: 'FIPS 203. The default choice for transport key establishment.'
  }),
  'ML-KEM-1024': entry('ML-KEM-1024', {
    primitive: PRIMITIVE.KEM,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['encapsulate', 'decapsulate', 'keygen'],
    oid: '2.16.840.1.101.3.4.4.3',
    note: 'FIPS 203. For data with a very long secrecy horizon.'
  }),
  'ML-DSA-44': entry('ML-DSA-44', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 2,
    functions: ['sign', 'verify', 'keygen'],
    oid: '2.16.840.1.101.3.4.3.17',
    note: 'FIPS 204.'
  }),
  'ML-DSA-65': entry('ML-DSA-65', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 3,
    functions: ['sign', 'verify', 'keygen'],
    oid: '2.16.840.1.101.3.4.3.18',
    note: 'FIPS 204. The default choice for certificates and code signing.'
  }),
  'ML-DSA-87': entry('ML-DSA-87', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['sign', 'verify', 'keygen'],
    oid: '2.16.840.1.101.3.4.3.19',
    note: 'FIPS 204.'
  }),
  'SLH-DSA': entry('SLH-DSA', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 3,
    functions: ['sign', 'verify', 'keygen'],
    oid: '2.16.840.1.101.3.4.3.20',
    note: 'FIPS 205. Hash based, so it rests on the smallest set of assumptions. Large signatures.'
  }),
  'FN-DSA': entry('FN-DSA', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 1,
    functions: ['sign', 'verify', 'keygen'],
    note: 'Falcon. Draft FIPS 206. Compact signatures, delicate floating point implementation.'
  }),
  XMSS: entry('XMSS', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['sign', 'verify'],
    note: 'SP 800 208. Stateful. Suitable for firmware signing where state can be held.'
  }),
  LMS: entry('LMS', {
    primitive: PRIMITIVE.SIGNATURE,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['sign', 'verify'],
    note: 'SP 800 208. Stateful hash based signature.'
  }),
  HQC: entry('HQC', {
    primitive: PRIMITIVE.KEM,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 3,
    functions: ['encapsulate', 'decapsulate'],
    note: 'Code based backup KEM selected by NIST in 2025.'
  }),
  'CLASSIC-MCELIECE': entry('Classic McEliece', {
    primitive: PRIMITIVE.KEM,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['encapsulate', 'decapsulate'],
    note: 'Code based. Very large public keys, very small ciphertexts.'
  }),
  X25519MLKEM768: entry('X25519MLKEM768', {
    primitive: PRIMITIVE.COMBINER,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 3,
    functions: ['keyderive', 'encapsulate'],
    note: 'Hybrid group. Safe against a break in either half, so it is the right thing to deploy first.'
  })
};

// Symmetric ciphers. Grover costs at most half the key.
const SYMMETRIC = {
  'AES-128': entry('AES-128', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 1,
    functions: ['encrypt', 'decrypt'],
    oid: '2.16.840.1.101.3.4.1.2',
    replacement: 'AES-256',
    note: 'Grover leaves about 64 bits of effective strength. Fine today, thin for a long secrecy horizon.'
  }),
  'AES-192': entry('AES-192', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 3,
    functions: ['encrypt', 'decrypt'],
    oid: '2.16.840.1.101.3.4.1.22'
  }),
  'AES-256': entry('AES-256', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['encrypt', 'decrypt'],
    oid: '2.16.840.1.101.3.4.1.42',
    note: 'Holds up against Grover. No migration needed.'
  }),
  CHACHA20: entry('ChaCha20', {
    primitive: PRIMITIVE.STREAM_CIPHER,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['encrypt', 'decrypt'],
    note: '256 bit key, so Grover leaves 128 bits.'
  }),
  '3DES': entry('3DES', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['encrypt', 'decrypt'],
    oid: '1.2.840.113549.3.7',
    replacement: 'AES-256-GCM',
    note: 'Sweet32 birthday attack on the 64 bit block. Disallowed by NIST SP 800 131A after 2023.'
  }),
  DES: entry('DES', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['encrypt', 'decrypt'],
    oid: '1.3.14.3.2.7',
    replacement: 'AES-256-GCM',
    note: '56 bit key. Brute forced in hours on commodity hardware.'
  }),
  RC4: entry('RC4', {
    primitive: PRIMITIVE.STREAM_CIPHER,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['encrypt', 'decrypt'],
    replacement: 'ChaCha20-Poly1305 or AES-256-GCM',
    note: 'Biased keystream. Prohibited in TLS by RFC 7465.'
  }),
  RC2: entry('RC2', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['encrypt', 'decrypt'],
    replacement: 'AES-256-GCM'
  }),
  BLOWFISH: entry('Blowfish', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.WEAK,
    quantum: QUANTUM.BROKEN,
    functions: ['encrypt', 'decrypt'],
    replacement: 'AES-256-GCM',
    note: '64 bit block, so it is exposed to Sweet32.'
  }),
  IDEA: entry('IDEA', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.LEGACY,
    quantum: QUANTUM.BROKEN,
    functions: ['encrypt', 'decrypt'],
    replacement: 'AES-256-GCM'
  }),
  CAMELLIA: entry('Camellia', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 1,
    functions: ['encrypt', 'decrypt']
  }),
  SM4: entry('SM4', {
    primitive: PRIMITIVE.BLOCK_CIPHER,
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 1,
    functions: ['encrypt', 'decrypt'],
    note: '128 bit key. Chinese national standard.'
  })
};

// Hashes. Grover and the birthday bound both bite here.
const HASH = {
  MD2: entry('MD2', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['digest'],
    replacement: 'SHA-384'
  }),
  MD4: entry('MD4', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['digest'],
    replacement: 'SHA-384'
  }),
  MD5: entry('MD5', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['digest'],
    oid: '1.2.840.113549.2.5',
    replacement: 'SHA-256 for integrity, Argon2id or scrypt for passwords',
    note: 'Chosen prefix collisions cost seconds. Never acceptable for signatures or certificates.'
  }),
  'SHA-1': entry('SHA-1', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['digest'],
    oid: '1.3.14.3.2.26',
    replacement: 'SHA-256 or SHA-384',
    note: 'SHAttered and Shambles produced practical collisions. NIST is retiring it entirely by 2030.'
  }),
  'SHA-224': entry('SHA-224', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 1,
    functions: ['digest'],
    replacement: 'SHA-384'
  }),
  'SHA-256': entry('SHA-256', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 2,
    functions: ['digest'],
    oid: '2.16.840.1.101.3.4.2.1',
    note: 'Sound today. Prefer SHA-384 where the artefact must stay trustworthy past 2035.'
  }),
  'SHA-384': entry('SHA-384', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 4,
    functions: ['digest'],
    oid: '2.16.840.1.101.3.4.2.2'
  }),
  'SHA-512': entry('SHA-512', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['digest'],
    oid: '2.16.840.1.101.3.4.2.3'
  }),
  'SHA3-256': entry('SHA3-256', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 2,
    functions: ['digest'],
    oid: '2.16.840.1.101.3.4.2.8'
  }),
  'SHA3-512': entry('SHA3-512', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['digest'],
    oid: '2.16.840.1.101.3.4.2.10'
  }),
  SHAKE256: entry('SHAKE256', {
    primitive: PRIMITIVE.XOF,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['digest'],
    oid: '2.16.840.1.101.3.4.2.12'
  }),
  'RIPEMD-160': entry('RIPEMD-160', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.LEGACY,
    quantum: QUANTUM.BROKEN,
    functions: ['digest'],
    replacement: 'SHA-256'
  }),
  BLAKE2: entry('BLAKE2', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 2,
    functions: ['digest']
  }),
  BLAKE3: entry('BLAKE3', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 2,
    functions: ['digest']
  }),
  SM3: entry('SM3', {
    primitive: PRIMITIVE.HASH,
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.WEAKENED,
    nistLevel: 2,
    functions: ['digest']
  })
};

// Message authentication and key derivation.
const MAC_KDF = {
  'HMAC-MD5': entry('HMAC-MD5', {
    primitive: PRIMITIVE.MAC,
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    functions: ['tag'],
    replacement: 'HMAC-SHA-256'
  }),
  'HMAC-SHA1': entry('HMAC-SHA1', {
    primitive: PRIMITIVE.MAC,
    classical: CLASSICAL.LEGACY,
    quantum: QUANTUM.WEAKENED,
    functions: ['tag'],
    replacement: 'HMAC-SHA-256',
    note: 'Not yet broken as a MAC, but it keeps SHA-1 alive in the estate.'
  }),
  'HMAC-SHA256': entry('HMAC-SHA256', {
    primitive: PRIMITIVE.MAC,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['tag']
  }),
  POLY1305: entry('Poly1305', {
    primitive: PRIMITIVE.MAC,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    nistLevel: 5,
    functions: ['tag']
  }),
  GMAC: entry('GMAC', {
    primitive: PRIMITIVE.MAC,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    functions: ['tag']
  }),
  PBKDF2: entry('PBKDF2', {
    primitive: PRIMITIVE.KDF,
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.WEAKENED,
    functions: ['keyderive'],
    note: 'Strength rests entirely on the iteration count. Under 600000 with SHA-256 is below OWASP guidance.'
  }),
  ARGON2ID: entry('Argon2id', {
    primitive: PRIMITIVE.KDF,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    functions: ['keyderive'],
    note: 'Memory hard. The preferred password KDF.'
  }),
  SCRYPT: entry('scrypt', {
    primitive: PRIMITIVE.KDF,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    functions: ['keyderive']
  }),
  BCRYPT: entry('bcrypt', {
    primitive: PRIMITIVE.KDF,
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.WEAKENED,
    functions: ['keyderive'],
    note: 'Caps the password at 72 bytes. Acceptable at cost 12 and above.'
  }),
  HKDF: entry('HKDF', {
    primitive: PRIMITIVE.KDF,
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    functions: ['keyderive']
  })
};

export const CATALOG = Object.assign(
  Object.create(null),
  ASYMMETRIC,
  POST_QUANTUM,
  SYMMETRIC,
  HASH,
  MAC_KDF
);

// Named curves, split by what actually protects them.
export const CURVES = {
  secp192r1: { bits: 192, classical: CLASSICAL.WEAK, quantum: QUANTUM.BROKEN },
  secp224r1: { bits: 224, classical: CLASSICAL.LEGACY, quantum: QUANTUM.BROKEN },
  secp256r1: { bits: 256, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN },
  prime256v1: { bits: 256, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN, alias: 'secp256r1' },
  'P-256': { bits: 256, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN, alias: 'secp256r1' },
  secp256k1: { bits: 256, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN },
  secp384r1: { bits: 384, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN },
  'P-384': { bits: 384, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN, alias: 'secp384r1' },
  secp521r1: { bits: 521, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN },
  'P-521': { bits: 521, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN, alias: 'secp521r1' },
  curve25519: { bits: 255, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN },
  curve448: { bits: 448, classical: CLASSICAL.STRONG, quantum: QUANTUM.BROKEN }
};

// Block cipher modes. A strong cipher in a bad mode is a bad cipher.
export const MODES = {
  ECB: { classical: CLASSICAL.BROKEN, note: 'Deterministic. Identical plaintext blocks produce identical ciphertext.' },
  CBC: { classical: CLASSICAL.ACCEPTABLE, note: 'Needs a random IV and a separate MAC. Padding oracles live here.' },
  CFB: { classical: CLASSICAL.ACCEPTABLE, note: 'Unauthenticated.' },
  OFB: { classical: CLASSICAL.ACCEPTABLE, note: 'Unauthenticated.' },
  CTR: { classical: CLASSICAL.ACCEPTABLE, note: 'Unauthenticated. Catastrophic on nonce reuse.' },
  GCM: { classical: CLASSICAL.STRONG, note: 'Authenticated. Never repeat a nonce under one key.' },
  CCM: { classical: CLASSICAL.STRONG, note: 'Authenticated.' },
  SIV: { classical: CLASSICAL.STRONG, note: 'Authenticated and nonce misuse resistant.' },
  OCB: { classical: CLASSICAL.STRONG, note: 'Authenticated.' },
  XTS: { classical: CLASSICAL.STRONG, note: 'Disk encryption only.' }
};

export function lookup(name) {
  if (!name) return null;
  const direct = CATALOG[name] || CATALOG[name.toUpperCase()];
  if (direct) return direct;
  const normal = String(name).toUpperCase().replace(/[\s_]+/g, '-');
  return CATALOG[normal] || null;
}

// RSA and finite field DH strength depends on the modulus, so it is graded here
// rather than in the flat catalogue.
export function gradeModulus(bits) {
  if (bits < 1024) return { classical: CLASSICAL.BROKEN, severity: 'critical' };
  if (bits < 2048) return { classical: CLASSICAL.BROKEN, severity: 'high' };
  if (bits < 3072) return { classical: CLASSICAL.ACCEPTABLE, severity: 'medium' };
  return { classical: CLASSICAL.STRONG, severity: 'low' };
}

export default CATALOG;

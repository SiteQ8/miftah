// Detection rules.
// Each rule turns a line of source or config into a finding. A rule names the
// algorithm it saw where it can, so the CBOM writer has something concrete to
// emit, and carries its own severity so the risk model can weight it.

import { CLASSICAL, QUANTUM } from './catalog.js';

export const SEVERITY = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_WEIGHT = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 15,
  info: 5
};

// A token surrounded by anything that is not an identifier character. Written
// out rather than using \b so that names containing digits and dashes behave.
function tok(source, flags = 'i') {
  return new RegExp(`(?<![A-Za-z0-9_])(?:${source})(?![A-Za-z0-9_])`, flags);
}

// A name distinctive enough to need no boundary at all. No ordinary identifier
// contains "tripledes" or "md5" by accident, and demanding a trailing boundary
// is exactly what made MD5CryptoServiceProvider and MCRYPT_3DES invisible.
function anywhere(source, flags = 'i') {
  return new RegExp(`(?:${source})`, flags);
}

// A short name that could sit inside an unrelated word, so the left edge is
// guarded and the right is not. Catches SHA1Managed without reading src4 as rc4.
function prefix(source, flags = 'i') {
  return new RegExp(`(?<![A-Za-z0-9])(?:${source})`, flags);
}

const SECRET_REJECT = /(process\.env|os\.environ|getenv|System\.getenv|ENV\[|\$\{|\{\{|<[a-z_]+>|xxxx|changeme|placeholder|example|your[-_ ]?(?:app[-_ ]?)?(?:key|password|secret|token|api)|<your|replace[-_ ]?me|test[-_]?(?:key|token)|not[-_ ]?a[-_ ]?real|dummy|sample|redacted|FIXME|TODO|https?:\/\/|BEGIN [A-Z ]*PRIVATE KEY)/i;

const PLACEHOLDER = /(process\.env|os\.environ|getenv|System\.getenv|ENV\[|\$\{|\{\{|<[a-z_]+>|xxxx|changeme|placeholder|example|your[-_]?key|dummy|sample|redacted|FIXME|TODO)/i;

export const RULES = [
  // ----- broken hashes -------------------------------------------------
  {
    id: 'MFT-H001',
    title: 'MD5 in use',
    algorithm: 'MD5',
    pattern: prefix('md5'),
    severity: 'high',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    advice: 'Replace with SHA-256. For passwords move to Argon2id.'
  },
  {
    id: 'MFT-H002',
    title: 'SHA-1 in use',
    algorithm: 'SHA-1',
    pattern: prefix('sha-?1(?![0-9])'),
    severity: 'high',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    advice: 'Replace with SHA-256, or SHA-384 where the artefact must outlive 2035.'
  },
  {
    id: 'MFT-H003',
    title: 'MD4 or MD2 in use',
    algorithm: 'MD4',
    pattern: tok('md4|md2'),
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    advice: 'Remove. There is no setting in which these are acceptable.'
  },
  {
    id: 'MFT-H004',
    title: 'SHA-256 recorded',
    algorithm: 'SHA-256',
    pattern: tok('sha-?256|sha256sum|SHA256WithRSA'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    advice: 'Sound today. Move long lived artefacts to SHA-384.'
  },
  {
    id: 'MFT-H005',
    title: 'SHA-384 or SHA-512 recorded',
    algorithm: 'SHA-384',
    pattern: tok('sha-?384|sha-?512'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    advice: 'No action. Both digests keep a comfortable margin against Grover.'
  },

  // ----- broken and weak ciphers ---------------------------------------
  {
    id: 'MFT-C001',
    title: 'Triple DES in use',
    algorithm: '3DES',
    pattern: anywhere('3des(?!ign)|triple-?des(?!ign)|des-?ede3?|des-cbc3|tdea|NewTripleDESCipher'),
    severity: 'high',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    advice: 'Replace with AES-256-GCM. Disallowed by NIST SP 800 131A.'
  },
  {
    id: 'MFT-C002',
    title: 'Single DES in use',
    algorithm: 'DES',
    pattern: /(?:des-cbc|des-ecb|DES\/(?:CBC|ECB)|crypto\/des|\bdes\.New(?!TripleDES)|DESKeySpec|(?<!Triple)DESCryptoServiceProvider|kCCAlgorithmDES(?!3)|MCRYPT_DES(?!EDE)|["']DES["'])/i,
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    advice: 'Replace with AES-256-GCM. A 56 bit key falls in hours.'
  },
  {
    id: 'MFT-C003',
    title: 'RC4 in use',
    algorithm: 'RC4',
    pattern: prefix('rc4|arcfour'),
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    advice: 'Remove. Prohibited in TLS by RFC 7465.'
  },
  {
    id: 'MFT-C004',
    title: 'RC2 in use',
    algorithm: 'RC2',
    pattern: tok('rc2'),
    severity: 'high',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.BROKEN,
    advice: 'Replace with AES-256-GCM.'
  },
  {
    id: 'MFT-C005',
    title: 'Blowfish in use',
    algorithm: 'BLOWFISH',
    pattern: tok('blowfish|bf-cbc|bf-ecb'),
    severity: 'medium',
    classical: CLASSICAL.WEAK,
    quantum: QUANTUM.BROKEN,
    advice: 'Replace with AES-256-GCM. The 64 bit block is exposed to Sweet32.'
  },
  {
    id: 'MFT-C006',
    title: 'ECB mode',
    algorithm: null,
    mode: 'ECB',
    assetLabel: 'ECB mode',
    assetPrimitive: 'block-cipher',
    pattern: /(?:(?<![A-Za-z0-9])ECB(?![A-Za-z0-9])|MODE_ECB|aes-\d{3}-ecb|AES\/ECB|kCCOptionECBMode)/,
    severity: 'high',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    advice: 'Move to GCM. ECB leaks plaintext structure whatever the cipher.'
  },
  {
    id: 'MFT-C007',
    title: 'AES-128 recorded',
    algorithm: 'AES-128',
    pattern: tok('aes-?128|AES_128|aes128'),
    severity: 'low',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.WEAKENED,
    advice: 'Move to AES-256 for anything with a secrecy horizon past 2035.'
  },
  {
    id: 'MFT-C008',
    title: 'AES-256 recorded',
    algorithm: 'AES-256',
    pattern: tok('aes-?256|AES_256|aes256'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    advice: 'No action. AES-256 survives Grover.'
  },
  {
    id: 'MFT-C009',
    title: 'ChaCha20 recorded',
    algorithm: 'CHACHA20',
    pattern: tok('chacha20|chacha20-poly1305|xchacha20'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    advice: 'No action. The 256 bit key leaves 128 bits against Grover.'
  },

  // ----- asymmetric, all of it quantum exposed --------------------------
  {
    id: 'MFT-A001',
    title: 'RSA in use',
    algorithm: 'RSA',
    pattern: /(?<![A-Za-z0-9_])(?:rsa(?![A-Za-z0-9])|RSAPrivateKey|RSAPublicKey|rsassa)/i,
    severity: 'medium',
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.BROKEN,
    sizeAware: true,
    advice: 'Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures.'
  },
  {
    id: 'MFT-A002',
    title: 'ECDSA in use',
    algorithm: 'ECDSA',
    pattern: tok('ecdsa|EC_KEY|SHA256withECDSA|es256|es384'),
    severity: 'medium',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    advice: 'Plan a move to ML-DSA-65.'
  },
  {
    id: 'MFT-A003',
    title: 'ECDH or ECDHE key agreement',
    algorithm: 'ECDH',
    pattern: tok('ecdhe?|ECDH_KEY|ecdh_key_agreement'),
    severity: 'high',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    advice: 'Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target.'
  },
  {
    id: 'MFT-A004',
    title: 'Finite field Diffie Hellman',
    algorithm: 'DH',
    pattern: tok('dhe?-rsa|diffie-?hellman|DHParameter|dhparam'),
    severity: 'high',
    classical: CLASSICAL.ACCEPTABLE,
    quantum: QUANTUM.BROKEN,
    advice: 'Move to the X25519MLKEM768 hybrid group.'
  },
  {
    id: 'MFT-A005',
    title: 'DSA in use',
    algorithm: 'DSA',
    pattern: /(?<![A-Za-z0-9_-])(?:dsa|DSAPrivateKey|SHA1withDSA|ssh-dss)(?![A-Za-z0-9_-])/i,
    severity: 'high',
    classical: CLASSICAL.LEGACY,
    quantum: QUANTUM.BROKEN,
    advice: 'Replace with ML-DSA-65. NIST withdrew DSA for new signatures.'
  },
  {
    id: 'MFT-A006',
    title: 'Ed25519 or X25519 in use',
    algorithm: 'ED25519',
    assetLabel: 'Curve25519 family',
    pattern: tok('ed25519|x25519|curve25519'),
    severity: 'medium',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.BROKEN,
    advice: 'Keep it as the classical half of a hybrid, then add ML-KEM-768 or ML-DSA-65 alongside.'
  },
  {
    id: 'MFT-A007',
    title: 'Weak elliptic curve',
    algorithm: 'ECDSA',
    pattern: tok('secp192r1|secp224r1|prime192v1|P-192|P-224'),
    severity: 'high',
    classical: CLASSICAL.WEAK,
    quantum: QUANTUM.BROKEN,
    advice: 'Move to secp384r1 now and to ML-DSA-65 on the migration path.'
  },
  {
    id: 'MFT-A008',
    title: 'RSA PKCS number 1 v1.5 encryption padding',
    algorithm: 'RSA',
    pattern: /(?:PKCS1v15|PKCS1Padding|RSA_PKCS1_PADDING|RSA\/ECB\/PKCS1Padding|rsa_pkcs1_padding)/i,
    severity: 'high',
    classical: CLASSICAL.WEAK,
    quantum: QUANTUM.BROKEN,
    advice: 'Use OAEP for encryption and PSS for signatures. Bleichenbacher oracles keep resurfacing.'
  },

  // ----- post quantum, the good news ------------------------------------
  {
    id: 'MFT-P001',
    title: 'ML-KEM in use',
    algorithm: 'ML-KEM-768',
    pattern: tok('ml-?kem(-?\\d{3,4})?|kyber(512|768|1024)?'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    advice: 'Already on the destination. Confirm it is deployed as a hybrid.'
  },
  {
    id: 'MFT-P002',
    title: 'ML-DSA in use',
    algorithm: 'ML-DSA-65',
    pattern: tok('ml-?dsa(-?\\d{2})?|dilithium\\d?'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    advice: 'Already on the destination.'
  },
  {
    id: 'MFT-P003',
    title: 'SLH-DSA or hash based signature in use',
    algorithm: 'SLH-DSA',
    pattern: tok('slh-?dsa|sphincs\\+?|xmss(mt)?|\\blms\\b'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    advice: 'Already on the destination.'
  },
  {
    id: 'MFT-P004',
    title: 'Hybrid key exchange group in use',
    algorithm: 'X25519MLKEM768',
    pattern: tok('x25519mlkem768|x25519_kyber768|p256_mlkem768|secp256r1mlkem768'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    advice: 'This is the right shape. Widen it to the rest of the estate.'
  },

  // ----- key management and randomness ---------------------------------
  {
    id: 'MFT-K001',
    title: 'Hard coded secret',
    algorithm: null,
    // The keyword is matched anywhere inside the identifier, because the common
    // real spellings are API_SECRET, JWT_SECRET, db_password and stripeApiKey,
    // none of which begin with the keyword.
    pattern: /[A-Za-z0-9_]{0,40}(?:secret|api_?key|private_?key|passwd|password|passphrase|aes_?key|hmac_?key|signing_?key|encryption_?key|master_?key|auth_?token|access_?token)[A-Za-z0-9_]*\s*[:=]\s*["'`]([^\s"'`]{16,})["'`]/i,
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    materialType: 'secret-key',
    assetLabel: 'Embedded secret key material',
    reject: SECRET_REJECT,
    advice: 'Move to a KMS or an HSM and rotate the exposed value. A key in source is a key in every clone.'
  },
  {
    id: 'MFT-K002',
    title: 'Private key material in the tree',
    algorithm: null,
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    materialType: 'private-key',
    assetLabel: 'Embedded private key material',
    advice: 'Remove from the repository, rotate the key, and purge it from history.'
  },
  {
    id: 'MFT-K003',
    title: 'Static or all zero initialisation vector',
    algorithm: null,
    pattern: /(?:new\s+IvParameterSpec\s*\(\s*new\s+byte\s*\[\s*\d+\s*\]|iv\s*[:=]\s*(?:b?["'`](?:\\x00|0){8,}["'`]|new\s+Uint8Array\s*\(\s*\d+\s*\)|Buffer\.alloc\s*\(\s*\d+\s*\))|IV\s*=\s*["'`][^"'`]{8,}["'`])/i,
    severity: 'high',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    materialType: 'initialization-vector',
    assetLabel: 'Static initialisation vector',
    advice: 'Generate a fresh IV per message from a cryptographic random source.'
  },
  {
    id: 'MFT-K004',
    title: 'Non cryptographic randomness in a cryptographic context',
    algorithm: null,
    pattern: /(?:Math\.random\s*\(\)|random\.random\s*\(\)|random\.randint|mt_rand\s*\(|new\s+Random\s*\(|math\/rand|rand\.(?:Int|Intn|Float64|Read)\b|(?<![A-Za-z0-9_])rand\s*\(\s*\))/,
    require: /(key|token|iv|nonce|salt|secret|password|session|otp|csrf|uuid)/i,
    severity: 'high',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    advice: 'Use crypto.randomBytes, secrets.token_bytes, or the platform CSPRNG.'
  },
  {
    id: 'MFT-K005',
    title: 'PBKDF2 iteration count below guidance',
    algorithm: 'PBKDF2',
    pattern: /pbkdf2[A-Za-z0-9_]*\s*\(?[^;\n]{0,120}?(?<![A-Za-z0-9_])(\d{3,6})(?![A-Za-z0-9_])/i,
    severity: 'medium',
    classical: CLASSICAL.WEAK,
    quantum: QUANTUM.WEAKENED,
    iterationAware: true,
    advice: 'Raise to at least 600000 with SHA-256, or move to Argon2id.'
  },
  {
    id: 'MFT-K006',
    title: 'Argon2id or scrypt in use',
    algorithm: 'ARGON2ID',
    pattern: tok('argon2i?d?|scrypt'),
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.RESISTANT,
    advice: 'No action. Memory hard derivation is the right choice for passwords.'
  },

  // ----- library and platform level findings ----------------------------

  {
    id: 'MFT-L001',
    title: 'mcrypt in use',
    algorithm: null,
    assetLabel: 'mcrypt library',
    assetPrimitive: 'unknown',
    pattern: /\bmcrypt_(?:encrypt|decrypt|module_open|generic|create_iv|list_algorithms)\b/i,
    severity: 'high',
    classical: CLASSICAL.LEGACY,
    quantum: QUANTUM.UNKNOWN,
    advice: 'mcrypt was deprecated in PHP 7.1 and removed in 7.2. It defaults to zero padding and ECB. Move to openssl_encrypt or libsodium.'
  },
  {
    id: 'MFT-L002',
    title: 'Legacy .NET crypto service provider',
    algorithm: null,
    assetLabel: 'Legacy .NET provider',
    assetPrimitive: 'unknown',
    pattern: /\b(?:RijndaelManaged|RNGCryptoServiceProvider|SHA1Managed|MD5CryptoServiceProvider|SHA1CryptoServiceProvider)\b/,
    severity: 'medium',
    classical: CLASSICAL.LEGACY,
    quantum: QUANTUM.UNKNOWN,
    advice: 'These types are obsolete in modern .NET. Use Aes.Create, SHA256.Create and RandomNumberGenerator.'
  },
  {
    id: 'MFT-L003',
    title: 'Certificate validation callback always succeeds',
    algorithm: null,
    pattern: /(?:ServerCertificateValidationCallback\s*(?:\+?=)|ServerCertificateCustomValidationCallback\s*=)[^;\n]*(?:=>\s*true|return\s+true)/,
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    advice: 'A callback that returns true accepts every certificate, including one an attacker minted. Validate the chain or pin the expected certificate.'
  },
  {
    id: 'MFT-L004',
    title: 'Trust manager accepts every certificate',
    algorithm: null,
    pattern: /(?:TrustAll|NoopHostnameVerifier|ALLOW_ALL_HOSTNAME_VERIFIER|X509TrustManager\s*\(\s*\)\s*\{[^}]*checkServerTrusted[^}]*\{\s*\}|checkServerTrusted\s*\([^)]*\)\s*(?:throws[^{]*)?\{\s*\})/,
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    advice: 'An empty checkServerTrusted trusts anyone who answers. Remove it and let the default trust manager do its job.'
  },
  // ----- transport ------------------------------------------------------
  {
    id: 'MFT-T001',
    title: 'Deprecated TLS version permitted',
    algorithm: null,
    protocol: 'tls',
    assetLabel: 'TLS configuration',
    pattern: /(?:TLSv1(?:[._]?[01])?(?![._]?[23])|SSLv[23]|PROTOCOL_TLSv1(?:_1)?(?![._]?[23])|SecurityProtocolType\.(?:Ssl3|Tls|Tls11)(?![A-Za-z0-9_])|VersionTLS1[01](?![0-9])|VersionSSL30|ssl_protocols[^;\n]*TLSv1(?:\.1)?(?!\.[23]))/,
    severity: 'high',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    advice: 'Require TLS 1.2 as a floor and TLS 1.3 wherever the peer supports it.'
  },
  {
    id: 'MFT-T002',
    title: 'Certificate verification disabled',
    algorithm: null,
    pattern: /(?:verify\s*=\s*False|rejectUnauthorized\s*:\s*false|InsecureSkipVerify\s*:\s*true|CURLOPT_SSL_VERIFYPEER\s*,\s*(?:0|false)|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|check_hostname\s*=\s*False|--insecure|ssl\._create_unverified_context)/i,
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    advice: 'Verification off means any interception succeeds. Pin a trust store instead.'
  },
  {
    id: 'MFT-T003',
    title: 'Null, export or anonymous cipher suite permitted',
    algorithm: null,
    pattern: /(?:(?<![A-Za-z0-9_])(?:NULL|EXP(?:ORT)?\d{0,3}|aNULL|eNULL|ADH|AECDH)(?![A-Za-z0-9_])[^;\n]{0,40}(?:cipher|CIPHER|suite)|(?:cipher|CIPHER|suite)[^;\n]{0,40}(?<![A-Za-z0-9_])(?:NULL|EXPORT|aNULL|eNULL|ADH|AECDH)(?![A-Za-z0-9_]))/,
    severity: 'critical',
    classical: CLASSICAL.BROKEN,
    quantum: QUANTUM.UNKNOWN,
    advice: 'Remove. These suites offer no confidentiality or no authentication.'
  },
  {
    id: 'MFT-T004',
    title: 'TLS 1.3 required',
    algorithm: null,
    protocol: 'tls',
    assetLabel: 'TLS configuration',
    pattern: /(?:TLSv1\.3|PROTOCOL_TLS(?:_CLIENT)?[^;\n]{0,40}TLSv1_3|minVersion\s*:\s*['"]TLSv1\.3['"])/,
    severity: 'info',
    classical: CLASSICAL.STRONG,
    quantum: QUANTUM.UNKNOWN,
    advice: 'Good floor. Add a hybrid key exchange group next.'
  },

  // ----- SSH ------------------------------------------------------------
  {
    id: 'MFT-S001',
    title: 'Weak SSH algorithm permitted',
    algorithm: null,
    protocol: 'ssh',
    assetLabel: 'SSH configuration',
    pattern: /(?:ssh-rsa(?!-sha2)|ssh-dss|diffie-hellman-group1-sha1|diffie-hellman-group14-sha1|hmac-sha1(?!-etm)|hmac-md5|umac-64(?![-a-z])|arcfour)/,
    severity: 'high',
    classical: CLASSICAL.WEAK,
    quantum: QUANTUM.BROKEN,
    advice: 'Restrict to rsa-sha2-512, ssh-ed25519 and sntrup761x25519-sha512 in sshd_config.'
  }
];

// Files worth reading. Anything else is skipped before it is opened.
export const SCANNABLE = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rb',
  '.php', '.cs', '.c', '.cc', '.cpp', '.h', '.hpp', '.rs', '.swift', '.kt',
  '.kts', '.scala', '.sh', '.bash', '.zsh', '.ps1', '.pl', '.lua', '.dart',
  '.ex', '.exs', '.erl', '.groovy', '.gradle', '.sql', '.tf', '.tfvars',
  '.yaml', '.yml', '.json', '.toml', '.ini', '.conf', '.cnf', '.cfg',
  '.properties', '.xml', '.env', '.pem', '.crt', '.cer', '.key', '.pub',
  '.md', '.txt'
]);

export const SCANNABLE_NAMES = new Set([
  'Dockerfile', 'Makefile', 'nginx.conf', 'httpd.conf', 'openssl.cnf',
  'sshd_config', 'ssh_config', 'Jenkinsfile', 'Vagrantfile', '.env'
]);

export const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor',
  '__pycache__', '.venv', 'venv', '.next', '.nuxt', 'coverage', '.cache',
  '.terraform', 'bower_components', '.gradle', '.idea', '.vscode'
]);

export default RULES;

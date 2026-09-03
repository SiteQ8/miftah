# Cryptographic inventory and post quantum readiness

What cryptography do we run, and what breaks first.

Target: `/home/claude/miftah/examples/sample-estate`
Generated: 2026-09-03T10:30:08.812Z

## Summary

| | |
| --- | --- |
| Post quantum readiness | 21 / 100 |
| Highest asset risk | 77 (critical) |
| Cryptographic assets | 21 |
| Assets needing migration | 15 |
| Already quantum resistant | 3 |
| Findings | 47 |
| Files read | 7 |
| Agility score | 25 / 100 |

critical 5, high 21, medium 8, low 3, info 10.

## The horizon

Data that must stay secret for x years, in an estate that takes y years to migrate, is already exposed when x plus y exceeds z, the years remaining before a cryptographically relevant quantum computer exists.

The secrecy requirement outruns the horizon by 8.67 years, so traffic recorded today is readable before the data stops mattering.

| | years |
| --- | --- |
| Data shelf life | 10 |
| Migration time | 5 |
| Years to horizon | 6.33 |

## Inventory

| Asset | Primitive | Classical | Quantum | Risk | Uses | Target |
| --- | --- | --- | --- | ---: | ---: | --- |
| DES | block-cipher | broken | broken by Shor | 74 | 1 | AES-256-GCM |
| RC4 | stream-cipher | broken | broken by Shor | 74 | 1 | ChaCha20-Poly1305 or AES-256-GCM |
| Embedded secret key material | unknown | broken | unknown | 48 | 1 |  |
| RSA | pke | acceptable | broken by Shor | 49 | 4 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures |
| ECDH | key-agree | strong | broken by Shor | 42 | 4 | X25519MLKEM768 hybrid key exchange |
| SHA-1 | hash | broken | broken by Shor | 77 | 4 | SHA-256 or SHA-384 |
| SSH configuration | unknown | weak | broken by Shor | 65 | 3 |  |
| MD5 | hash | broken | broken by Shor | 75 | 2 | SHA-256 for integrity, Argon2id or scrypt for passwords |
| 3DES | block-cipher | broken | broken by Shor | 75 | 2 | AES-256-GCM |
| TLS configuration | unknown | broken | unknown | 48 | 1 |  |
| DH | key-agree | acceptable | broken by Shor | 46 | 1 | X25519MLKEM768 hybrid key exchange |
| RSA 1024 | pke | acceptable | broken by Shor | 46 | 1 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures |
| ECB mode | block-cipher | broken | unknown | 48 | 1 |  |
| Curve25519 family | signature | strong | broken by Shor | 42 | 4 | ML-DSA-65 |
| RSA 2048 | pke | acceptable | broken by Shor | 46 | 1 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures |
| AES-128 | block-cipher | strong | weakened by Grover | 21 | 3 | AES-256 |
| SHA-256 | hash | strong | weakened by Grover | 22 | 4 |  |
| AES-256 | block-cipher | strong | resistant | 5 | 3 |  |
| X25519MLKEM768 | combiner | strong | resistant | 2 | 1 |  |
| ML-DSA-65 | signature | strong | resistant | 2 | 1 |  |
| PBKDF2 | kdf | weak | weakened by Grover | 43 | 1 |  |

## Findings

| Severity | Finding | Location | Advice |
| --- | --- | --- | --- |
| high | Deprecated TLS version permitted | `config/app.yaml:4` | Require TLS 1.2 as a floor and TLS 1.3 wherever the peer supports it. |
| high | MD5 in use | `config/app.yaml:5` | Replace with SHA-256. For passwords move to Argon2id. |
| high | Triple DES in use | `config/app.yaml:5` | Replace with AES-256-GCM. Disallowed by NIST SP 800 131A. |
| critical | Single DES in use | `config/app.yaml:5` | Replace with AES-256-GCM. A 56 bit key falls in hours. |
| critical | RC4 in use | `config/app.yaml:5` | Remove. Prohibited in TLS by RFC 7465. |
| low | AES-128 recorded | `config/app.yaml:5` | Move to AES-256 for anything with a secrecy horizon past 2035. |
| medium | RSA in use | `config/app.yaml:5` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| high | ECDH or ECDHE key agreement | `config/app.yaml:5` | Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target. |
| critical | Hard coded secret | `config/app.yaml:16` | Move to a KMS or an HSM and rotate the exposed value. A key in source is a key in every clone. |
| high | SHA-1 in use | `config/sshd_config:3` | Replace with SHA-256, or SHA-384 where the artefact must outlive 2035. |
| high | Finite field Diffie Hellman | `config/sshd_config:3` | Move to the X25519MLKEM768 hybrid group. |
| medium | Ed25519 or X25519 in use | `config/sshd_config:3` | Keep it as the classical half of a hybrid, then add ML-KEM-768 or ML-DSA-65 alongside. |
| high | Weak SSH algorithm permitted | `config/sshd_config:3` | Restrict to rsa-sha2-512, ssh-ed25519 and sntrup761x25519-sha512 in sshd_config. |
| medium | RSA in use | `config/sshd_config:4` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| medium | Ed25519 or X25519 in use | `config/sshd_config:4` | Keep it as the classical half of a hybrid, then add ML-KEM-768 or ML-DSA-65 alongside. |
| high | Weak SSH algorithm permitted | `config/sshd_config:4` | Restrict to rsa-sha2-512, ssh-ed25519 and sntrup761x25519-sha512 in sshd_config. |
| low | AES-128 recorded | `config/sshd_config:5` | Move to AES-256 for anything with a secrecy horizon past 2035. |
| high | SHA-1 in use | `config/sshd_config:6` | Replace with SHA-256, or SHA-384 where the artefact must outlive 2035. |
| high | Weak SSH algorithm permitted | `config/sshd_config:6` | Restrict to rsa-sha2-512, ssh-ed25519 and sntrup761x25519-sha512 in sshd_config. |
| high | SHA-1 in use | `src/client.py:7` | Replace with SHA-256, or SHA-384 where the artefact must outlive 2035. |
| critical | Certificate verification disabled | `src/client.py:10` | Verification off means any interception succeeds. Pin a trust store instead. |
| critical | Certificate verification disabled | `src/client.py:14` | Verification off means any interception succeeds. Pin a trust store instead. |
| medium | RSA in use | `src/keys.js:5` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| high | RSA in use | `src/keys.js:9` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| high | ECDH or ECDHE key agreement | `src/keys.js:13` | Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target. |
| high | ECDH or ECDHE key agreement | `src/keys.js:14` | Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target. |
| high | ECDH or ECDHE key agreement | `src/keys.js:15` | Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target. |
| medium | RSA in use | `src/keys.js:19` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| high | RSA PKCS number 1 v1.5 encryption padding | `src/keys.js:19` | Use OAEP for encryption and PSS for signatures. Bleichenbacher oracles keep resurfacing. |
| medium | Ed25519 or X25519 in use | `src/keys.js:23` | Keep it as the classical half of a hybrid, then add ML-KEM-768 or ML-DSA-65 alongside. |
| high | MD5 in use | `src/legacy.js:5` | Replace with SHA-256. For passwords move to Argon2id. |
| high | SHA-1 in use | `src/legacy.js:9` | Replace with SHA-256, or SHA-384 where the artefact must outlive 2035. |
| high | Triple DES in use | `src/legacy.js:13` | Replace with AES-256-GCM. Disallowed by NIST SP 800 131A. |
| high | ECB mode | `src/legacy.js:18` | Move to GCM. ECB leaks plaintext structure whatever the cipher. |
| low | AES-128 recorded | `src/legacy.js:18` | Move to AES-256 for anything with a secrecy horizon past 2035. |
| high | Non cryptographic randomness in a cryptographic context | `src/legacy.js:23` | Use crypto.randomBytes, secrets.token_bytes, or the platform CSPRNG. |
| medium | Ed25519 or X25519 in use | `src/modern.js:4` | Keep it as the classical half of a hybrid, then add ML-KEM-768 or ML-DSA-65 alongside. |

## Migration roadmap

### Priority actions

1. **Remove 10 broken or weak primitives before anything else** SHA-1, MD5, 3DES, DES, RC4
2. **Rotate every key found in the tree and purge it from history** A key in a repository is a key in every clone, every fork and every backup.
3. **Turn certificate verification back on** Disabled verification defeats the transport layer entirely, quantum computers not required.
4. **Generate the CBOM in CI and fail the build on new quantum exposed dependencies** miftah scan . --cbom cbom.json --fail-on high
5. **Put every algorithm choice behind configuration rather than a literal** Crypto agility is what makes the next migration cheap. This one is already expensive.
6. **Enable X25519MLKEM768 on every internet facing TLS terminator** Hybrid, so a flaw in either half is survivable. Supported by OpenSSL 3.5, BoringSSL, Go 1.24 and current browsers.
7. **Add sntrup761x25519-sha512 or mlkem768x25519-sha256 to SSH** Administrative sessions carry the credentials that unlock everything else.
8. **Raise AES-128 to AES-256 for anything with a long secrecy horizon** Doubling the key is the whole answer to Grover, and it is cheap.
9. **Pilot ML-DSA-65 in an internal certificate authority before touching the public chain** Signature sizes change assumptions in protocols, embedded devices and hardware security modules.

### Wave 0. Stop the bleeding

Window: now

Remove cryptography that is already broken against a classical attacker. None of this needs a quantum computer to hurt you.

| Asset | Target | Risk | Uses | Effort |
| --- | --- | ---: | ---: | --- |
| SHA-1 | SHA-256 or SHA-384 | 77 | 4 | low |
| MD5 | SHA-256 for integrity, Argon2id or scrypt for passwords | 75 | 2 | low |
| 3DES | AES-256-GCM | 75 | 2 | low |
| DES | AES-256-GCM | 74 | 1 | low |
| RC4 | ChaCha20-Poly1305 or AES-256-GCM | 74 | 1 | low |
| SSH configuration | rsa-sha2-512 and ssh-ed25519 host keys with sntrup761x25519-sha512 key exchange | 65 | 3 | low |
| Embedded secret key material | a key management service, with the exposed value rotated | 48 | 1 | low |
| TLS configuration | TLS 1.3 with the X25519MLKEM768 group | 48 | 1 | low |
| ECB mode | AES-256-GCM | 48 | 1 | low |
| PBKDF2 | Argon2id for passwords, HKDF-SHA-384 for key separation | 43 | 1 | low |

### Wave 1. Know and govern

Window: months 0 to 6

Hold a complete inventory, put crypto agility in place, and make the CBOM a build artefact rather than a one off report.

| Asset | Target | Risk | Uses | Effort |
| --- | --- | ---: | ---: | --- |
| AES-256 | no change needed | 5 | 3 | low |
| X25519MLKEM768 | no change needed | 2 | 1 | low |
| ML-DSA-65 | no change needed | 2 | 1 | high |

### Wave 2. Protect traffic in flight

Window: months 3 to 12

Deploy hybrid key establishment everywhere a session key is negotiated. This is the only wave that stops harvest now decrypt later.

| Asset | Target | Risk | Uses | Effort |
| --- | --- | ---: | ---: | --- |
| RSA | ML-KEM-768 for key establishment, ML-DSA-65 for signatures | 49 | 4 | low |
| DH | X25519MLKEM768 hybrid key exchange | 46 | 1 | low |
| RSA 1024 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures | 46 | 1 | low |
| RSA 2048 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures | 46 | 1 | low |
| ECDH | X25519MLKEM768 hybrid key exchange | 42 | 4 | low |

### Wave 3. Protect data at rest

Window: months 9 to 24

Raise symmetric keys to 256 bits and re wrap long lived encrypted data under post quantum key establishment.

| Asset | Target | Risk | Uses | Effort |
| --- | --- | ---: | ---: | --- |
| SHA-256 | SHA-384 | 22 | 4 | low |
| AES-128 | AES-256 | 21 | 3 | low |

### Wave 4. Re root identity and signing

Window: months 18 to 36

Move certificates, code signing and firmware roots of trust to ML-DSA or a hash based signature. Slowest wave because trust anchors propagate slowly.

| Asset | Target | Risk | Uses | Effort |
| --- | --- | ---: | ---: | --- |
| Curve25519 family | ML-DSA-65 | 42 | 4 | high |

## Crypto agility

Agility score: 25 / 100

| Status | Check | Advice |
| --- | --- | --- |
| in place | A cryptographic inventory exists and is current | 21 cryptographic assets identified |
| needs a human | The inventory is machine readable and regenerated automatically | Confirm miftah runs in the pipeline, not only by hand |
| missing | No broken primitive remains in the estate | 11 occurrences of broken primitives |
| missing | No key material is held in source or configuration | 1 occurrences of embedded key material |
| missing | Algorithm choices are configuration, not literals | 24 percent of algorithm references sit in configuration, the rest are hard coded |
| partial | Symmetric keys are 256 bits where the data outlives 2035 | AES-128, SHA-256, PBKDF2 leave reduced margin |
| partial | Key establishment uses a hybrid post quantum group | Hybrid present alongside classical only paths |
| needs a human | Certificates carry SHA-256 or stronger and expire inside 398 days | No certificates inspected in this run |
| missing | Randomness comes from a cryptographic source everywhere | 1 occurrences of weak randomness or static IVs |
| missing | Transport refuses anything below TLS 1.2 | 1 occurrences permitting TLS 1.1 or below |
| needs a human | A named owner is accountable for the migration | Name the owner and the review cadence |
| needs a human | Suppliers have been asked for their post quantum timeline | Supply a vendor list with --vendors to track this |
| needs a human | A rollback path exists for every algorithm change | Confirm each change can be reversed without a release |
| needs a human | Protocol changes have been tested against signature and key size growth | Test with ML-DSA-65 sized artefacts before committing |

## Method

Miftah reads source, configuration and certificates, probes live TLS and SSH endpoints, and grades every algorithm it names against a classical verdict and a quantum verdict. The inventory is emitted as CycloneDX 1.6 so it joins the existing software bill of materials rather than sitting beside it. Risk is a function of the algorithm, how long the data must stay secret, and how much of the estate depends on it. Nothing is sent anywhere.

_Miftah is open source under the MIT licence._

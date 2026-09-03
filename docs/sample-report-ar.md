# جرد التشفير والجاهزية لما بعد الكم

ما التشفير الذي نشغله فعلا وما الذي ينكسر أولا.

الهدف: `/home/claude/miftah/examples/sample-estate`
تاريخ الإصدار: 2026-09-03T21:28:51.932Z

## الخلاصة

| | |
| --- | --- |
| الجاهزية لما بعد الكم | 21 / 100 |
| أعلى خطورة لأصل واحد | 77 (حرجة) |
| أصول التشفير | 21 |
| أصول تحتاج انتقالا | 15 |
| أصول مقاومة للكم | 3 |
| النتائج | 47 |
| الملفات المقروءة | 7 |
| درجة المرونة | 22 / 100 محسوبة على 9 بنود قابلة للتقييم من 14، أما البقية فتحتاج إلى حكم بشري |

حرجة 5, عالية 21, متوسطة 6, منخفضة 3, معلومة 12.

## الأفق الزمني

البيانات التي يجب أن تبقى سرية مدة س سنة، في بيئة يستغرق انتقالها ص سنة، تكون مكشوفة فعلا متى تجاوز مجموع س وص عدد السنوات المتبقية قبل ظهور حاسوب كمي قادر على كسر التشفير.

مدة السرية المطلوبة تتجاوز الأفق بمقدار 8.67 سنة، لذا فإن ما يسجل من حركة اليوم يصبح مقروءا قبل أن تفقد البيانات قيمتها.

| | سنة |
| --- | --- |
| مدة سرية البيانات | 10 |
| مدة الانتقال | 5 |
| السنوات حتى الأفق | 6.33 |

## الجرد

| الأصل | النوع | كلاسيكيا | كميا | الخطورة | الاستخدامات | الوجهة |
| --- | --- | --- | --- | ---: | ---: | --- |
| DES | block-cipher | مكسور | مكسور بخوارزمية شور | 74 | 1 | AES-256-GCM |
| RC4 | stream-cipher | مكسور | مكسور بخوارزمية شور | 74 | 1 | ChaCha20-Poly1305 or AES-256-GCM |
| Embedded secret key material | unknown | مكسور | غير محدد | 48 | 1 |  |
| RSA | pke | مقبول | مكسور بخوارزمية شور | 49 | 4 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures |
| ECDH | key-agree | قوي | مكسور بخوارزمية شور | 42 | 4 | X25519MLKEM768 hybrid key exchange |
| SHA-1 | hash | مكسور | مكسور بخوارزمية شور | 77 | 4 | SHA-256 or SHA-384 |
| SSH configuration | unknown | ضعيف | مكسور بخوارزمية شور | 65 | 3 |  |
| MD5 | hash | مكسور | مكسور بخوارزمية شور | 75 | 2 | SHA-256 for integrity, Argon2id or scrypt for passwords |
| 3DES | block-cipher | مكسور | مكسور بخوارزمية شور | 75 | 2 | AES-256-GCM |
| TLS configuration | unknown | مكسور | غير محدد | 48 | 1 |  |
| DH | key-agree | مقبول | مكسور بخوارزمية شور | 46 | 1 | X25519MLKEM768 hybrid key exchange |
| RSA 1024 | pke | مقبول | مكسور بخوارزمية شور | 46 | 1 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures |
| ECB mode | block-cipher | مكسور | غير محدد | 48 | 1 |  |
| Curve25519 family | signature | قوي | مكسور بخوارزمية شور | 42 | 4 | ML-DSA-65 |
| RSA 2048 | pke | مقبول | مكسور بخوارزمية شور | 46 | 1 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures |
| AES-128 | block-cipher | قوي | مضعف بخوارزمية غروفر | 21 | 3 | AES-256 |
| SHA-256 | hash | قوي | مضعف بخوارزمية غروفر | 22 | 4 |  |
| AES-256 | block-cipher | قوي | مقاوم | 5 | 3 |  |
| X25519MLKEM768 | combiner | قوي | مقاوم | 2 | 1 |  |
| ML-DSA-65 | signature | قوي | مقاوم | 2 | 1 |  |
| PBKDF2 | kdf | ضعيف | مضعف بخوارزمية غروفر | 43 | 1 |  |

## النتائج

| الدرجة | النتيجة | الموقع | التوصية |
| --- | --- | --- | --- |
| عالية | Deprecated TLS version permitted | `config/app.yaml:4` | Require TLS 1.2 as a floor and TLS 1.3 wherever the peer supports it. |
| عالية | MD5 in use | `config/app.yaml:5` | Replace with SHA-256. For passwords move to Argon2id. |
| عالية | Triple DES in use | `config/app.yaml:5` | Replace with AES-256-GCM. Disallowed by NIST SP 800 131A. |
| حرجة | Single DES in use | `config/app.yaml:5` | Replace with AES-256-GCM. A 56 bit key falls in hours. |
| حرجة | RC4 in use | `config/app.yaml:5` | Remove. Prohibited in TLS by RFC 7465. |
| منخفضة | AES-128 recorded | `config/app.yaml:5` | Move to AES-256 for anything with a secrecy horizon past 2035. |
| متوسطة | RSA in use | `config/app.yaml:5` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| عالية | ECDH or ECDHE key agreement | `config/app.yaml:5` | Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target. |
| حرجة | Hard coded secret | `config/app.yaml:16` | Move to a KMS or an HSM and rotate the exposed value. A key in source is a key in every clone. |
| عالية | SHA-1 in use | `config/sshd_config:3` | Replace with SHA-256, or SHA-384 where the artefact must outlive 2035. |
| عالية | Finite field Diffie Hellman | `config/sshd_config:3` | Move to the X25519MLKEM768 hybrid group. |
| متوسطة | Ed25519 or X25519 in use | `config/sshd_config:3` | Keep it as the classical half of a hybrid, then add ML-KEM-768 or ML-DSA-65 alongside. |
| عالية | Weak SSH algorithm permitted | `config/sshd_config:3` | Restrict to rsa-sha2-512, ssh-ed25519 and sntrup761x25519-sha512 in sshd_config. |
| متوسطة | RSA in use | `config/sshd_config:4` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| متوسطة | Ed25519 or X25519 in use | `config/sshd_config:4` | Keep it as the classical half of a hybrid, then add ML-KEM-768 or ML-DSA-65 alongside. |
| عالية | Weak SSH algorithm permitted | `config/sshd_config:4` | Restrict to rsa-sha2-512, ssh-ed25519 and sntrup761x25519-sha512 in sshd_config. |
| منخفضة | AES-128 recorded | `config/sshd_config:5` | Move to AES-256 for anything with a secrecy horizon past 2035. |
| عالية | SHA-1 in use | `config/sshd_config:6` | Replace with SHA-256, or SHA-384 where the artefact must outlive 2035. |
| عالية | Weak SSH algorithm permitted | `config/sshd_config:6` | Restrict to rsa-sha2-512, ssh-ed25519 and sntrup761x25519-sha512 in sshd_config. |
| عالية | SHA-1 in use | `src/client.py:7` | Replace with SHA-256, or SHA-384 where the artefact must outlive 2035. |
| حرجة | Certificate verification disabled | `src/client.py:10` | Verification off means any interception succeeds. Pin a trust store instead. |
| حرجة | Certificate verification disabled | `src/client.py:14` | Verification off means any interception succeeds. Pin a trust store instead. |
| متوسطة | RSA in use | `src/keys.js:5` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| عالية | RSA in use | `src/keys.js:9` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| عالية | ECDH or ECDHE key agreement | `src/keys.js:13` | Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target. |
| عالية | ECDH or ECDHE key agreement | `src/keys.js:14` | Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target. |
| عالية | ECDH or ECDHE key agreement | `src/keys.js:15` | Move to the X25519MLKEM768 hybrid group. Session keys are the harvest now decrypt later target. |
| متوسطة | RSA in use | `src/keys.js:19` | Plan a move to ML-KEM-768 for key establishment and ML-DSA-65 for signatures. |
| عالية | RSA PKCS number 1 v1.5 encryption padding | `src/keys.js:19` | Use OAEP for encryption and PSS for signatures. Bleichenbacher oracles keep resurfacing. |
| عالية | MD5 in use | `src/legacy.js:5` | Replace with SHA-256. For passwords move to Argon2id. |
| عالية | SHA-1 in use | `src/legacy.js:9` | Replace with SHA-256, or SHA-384 where the artefact must outlive 2035. |
| عالية | Triple DES in use | `src/legacy.js:13` | Replace with AES-256-GCM. Disallowed by NIST SP 800 131A. |
| عالية | ECB mode | `src/legacy.js:18` | Move to GCM. ECB leaks plaintext structure whatever the cipher. |
| منخفضة | AES-128 recorded | `src/legacy.js:18` | Move to AES-256 for anything with a secrecy horizon past 2035. |
| عالية | Non cryptographic randomness in a cryptographic context | `src/legacy.js:23` | Use crypto.randomBytes, secrets.token_bytes, or the platform CSPRNG. |

## خارطة الانتقال

### الإجراءات ذات الأولوية

1. **Remove 10 broken or weak primitives before anything else** SHA-1, MD5, 3DES, DES, RC4
2. **Rotate every key found in the tree and purge it from history** A key in a repository is a key in every clone, every fork and every backup.
3. **Turn certificate verification back on** Disabled verification defeats the transport layer entirely, quantum computers not required.
4. **Generate the CBOM in CI and fail the build on new quantum exposed dependencies** miftah scan . --cbom cbom.json --fail-on high
5. **Put every algorithm choice behind configuration rather than a literal** Crypto agility is what makes the next migration cheap. This one is already expensive.
6. **Enable X25519MLKEM768 on every internet facing TLS terminator** Hybrid, so a flaw in either half is survivable. Supported by OpenSSL 3.5, BoringSSL, Go 1.24 and current browsers.
7. **Add sntrup761x25519-sha512 or mlkem768x25519-sha256 to SSH** Administrative sessions carry the credentials that unlock everything else.
8. **Raise AES-128 to AES-256 for anything with a long secrecy horizon** Doubling the key is the whole answer to Grover, and it is cheap.
9. **Pilot ML-DSA-65 in an internal certificate authority before touching the public chain** Signature sizes change assumptions in protocols, embedded devices and hardware security modules.

### الموجة 0. Stop the bleeding

النطاق الزمني: now

Remove cryptography that is already broken against a classical attacker. None of this needs a quantum computer to hurt you.

| الأصل | الوجهة | الخطورة | الاستخدامات | الجهد |
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

### الموجة 1. Know and govern

النطاق الزمني: months 0 to 6

Hold a complete inventory, put crypto agility in place, and make the CBOM a build artefact rather than a one off report.

| الأصل | الوجهة | الخطورة | الاستخدامات | الجهد |
| --- | --- | ---: | ---: | --- |
| AES-256 | no change needed | 5 | 3 | low |
| X25519MLKEM768 | no change needed | 2 | 1 | low |
| ML-DSA-65 | no change needed | 2 | 1 | high |

### الموجة 2. Protect traffic in flight

النطاق الزمني: months 3 to 12

Deploy hybrid key establishment everywhere a session key is negotiated. This is the only wave that stops harvest now decrypt later.

| الأصل | الوجهة | الخطورة | الاستخدامات | الجهد |
| --- | --- | ---: | ---: | --- |
| RSA | ML-KEM-768 for key establishment, ML-DSA-65 for signatures | 49 | 4 | low |
| DH | X25519MLKEM768 hybrid key exchange | 46 | 1 | low |
| RSA 1024 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures | 46 | 1 | low |
| RSA 2048 | ML-KEM-768 for key establishment, ML-DSA-65 for signatures | 46 | 1 | low |
| ECDH | X25519MLKEM768 hybrid key exchange | 42 | 4 | low |

### الموجة 3. Protect data at rest

النطاق الزمني: months 9 to 24

Raise symmetric keys to 256 bits and re wrap long lived encrypted data under post quantum key establishment.

| الأصل | الوجهة | الخطورة | الاستخدامات | الجهد |
| --- | --- | ---: | ---: | --- |
| SHA-256 | SHA-384 | 22 | 4 | low |
| AES-128 | AES-256 | 21 | 3 | low |

### الموجة 4. Re root identity and signing

النطاق الزمني: months 18 to 36

Move certificates, code signing and firmware roots of trust to ML-DSA or a hash based signature. Slowest wave because trust anchors propagate slowly.

| الأصل | الوجهة | الخطورة | الاستخدامات | الجهد |
| --- | --- | ---: | ---: | --- |
| Curve25519 family | ML-DSA-65 | 42 | 4 | high |

## مرونة التشفير

درجة المرونة: 22 / 100 محسوبة على 9 بنود قابلة للتقييم من 14، أما البقية فتحتاج إلى حكم بشري

| الحالة | البند | التوصية |
| --- | --- | --- |
| مطبق | A cryptographic inventory exists and is current | 21 cryptographic assets identified |
| غير مطبق | The inventory is machine readable and regenerated automatically | No pipeline configuration found, so the inventory is a snapshot |
| غير مطبق | No broken primitive remains in the estate | 11 occurrences of broken primitives |
| غير مطبق | No key material is held in source or configuration | 1 occurrences of embedded key material |
| غير مطبق | Algorithm choices are configuration, not literals | 24 percent of algorithm references sit in configuration, the rest are hard coded |
| جزئي | Symmetric keys are 256 bits where the data outlives 2035 | AES-128, SHA-256, PBKDF2 leave reduced margin |
| جزئي | Key establishment uses a hybrid post quantum group | Hybrid present alongside classical only paths |
| يحتاج مراجعة بشرية | Certificates carry SHA-256 or stronger and expire inside 398 days | No certificates inspected in this run |
| غير مطبق | Randomness comes from a cryptographic source everywhere | 1 occurrences of weak randomness or static IVs |
| غير مطبق | Transport refuses anything below TLS 1.2 | 1 occurrences permitting TLS 1.1 or below |
| يحتاج مراجعة بشرية | A named owner is accountable for the migration | No CODEOWNERS or security policy found. Name the owner and the review cadence |
| يحتاج مراجعة بشرية | Suppliers have been asked for their post quantum timeline | Supply a vendor list with --vendors to track this |
| يحتاج مراجعة بشرية | A rollback path exists for every algorithm change | Confirm each change can be reversed without a release |
| يحتاج مراجعة بشرية | Protocol changes have been tested against signature and key size growth | Test with ML-DSA-65 sized artefacts before committing |

## المنهجية

يقرأ مفتاح الشيفرة والإعدادات والشهادات، ثم يفحص نقاط الاتصال الحية عبر بروتوكولي طبقة النقل الآمنة والصدفة الآمنة، ويصنف كل خوارزمية يتعرف عليها وفق حكمين أحدهما كلاسيكي والآخر كمي، ويصدر الجرد بصيغة CycloneDX الإصدار 1.6 لأنها الصيغة المعيارية فينضم إلى قوائم مكونات البرمجيات القائمة بدل أن يبقى منفصلا عنها، بينما تحسب الخطورة بدلالة الخوارزمية ومدة سرية البيانات ومقدار اعتماد البيئة عليها، ولا يرسل شيء إلى أي جهة خارجية.

_مفتاح أداة مفتوحة المصدر برخصة إم آي تي._

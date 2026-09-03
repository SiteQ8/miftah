# Miftah

**مفتاح**. Cryptographic inventory and post quantum readiness.

Miftah reads a code tree, a set of certificates and a list of live endpoints, then tells you three things: what cryptography you are actually running, how much of it a quantum computer breaks, and what to do about it in what order.

It writes the inventory as a CBOM in **CycloneDX 1.6**, so it drops into the SBOM tooling you already have rather than becoming another silo.

Zero dependencies. Node built-ins only. Nothing leaves your machine.

```
npx github:SiteQ8/miftah scan .
```

---

## The argument

Most cryptography advice about quantum computers is a date argument, and dates are easy to dismiss. Mosca's inequality turns it into an arithmetic one:

> If **x** (how long your data must stay secret) plus **y** (how long your migration takes) is greater than **z** (how long until a cryptographically relevant quantum computer exists), you are already late.

You do not get to start migrating when the machine is announced. You had to have finished by then, and the data you encrypted years earlier is already sitting in somebody's archive waiting for it. That is the whole harvest now, decrypt later problem, and it is why an inventory is worth building today rather than in 2031.

Miftah makes that inequality the centre of the report:

![Horizon strip](docs/media/horizon-breached.png)

Ten years of required secrecy plus five years of migration against a 2033 horizon leaves you exposed for **8.67 years**. Move any of the three numbers and the picture moves with it. The console lets you drag them.

---

## What it finds

**In code and configuration.** 30 rules covering MD5, SHA-1, 3DES, DES, RC4, ECB mode, RSA and DH below 2048, static initialisation vectors, hard coded keys, weak randomness used in a cryptographic context, PBKDF2 iteration counts below guidance, deprecated TLS versions, and certificate verification switched off. Post quantum algorithms are detected too, so the inventory records what is already right.

**In certificates.** Signature algorithm read from the DER, public key type and size, curve, and expiry. Graded on all three.

**On the wire.** TLS probed once per protocol version from 1.0 to 1.3, capturing the negotiated suite, the key exchange group, and the full chain. SSH probed at the transport layer, reading the server KEXINIT to judge key exchange, host key, cipher and MAC algorithms, and to report whether any post quantum key exchange is offered at all.

Every finding carries two verdicts, not one: a **classical** judgement and a **quantum** judgement. SHA-256 is classically sound and quantum weakened. RSA-4096 is classically strong and quantum broken. Collapsing those into a single score is how inventories end up misleading.

---

## Usage

```bash
# Scan a tree, write the CBOM and a report
miftah scan . --cbom cbom.json --html report.html

# Fail a build on anything high or worse
miftah scan . --fail-on high

# Inspect certificates
miftah cert /etc/ssl/certs/service.pem

# Probe live endpoints
miftah tls example.com:443
miftah ssh example.com:22

# Arabic report
miftah report scan.json --lang ar --html تقرير.html

# Interactive console from a scan result
miftah console scan.json --out console.html
```

Adjust the assumptions when the defaults do not fit your data:

```bash
miftah scan . --shelf-life 25 --migration 7 --horizon 2035 --exposure internal
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--shelf-life` | Years the data must stay secret | 10 |
| `--migration` | Years your migration will realistically take | 5 |
| `--horizon` | Year a cryptographically relevant quantum computer is assumed | 2033 |
| `--exposure` | `internet`, `partner`, `internal`, `airgapped` | internet |
| `--fail-on` | Exit non zero at this severity or worse | none |

---

## The CBOM

The inventory is written as CycloneDX 1.6 with every asset typed `cryptographic-asset`, carrying the registered OID, the CycloneDX primitive, the NIST post quantum security level where one applies, and `evidence.occurrences` linking each asset back to the file and line it was found on.

It validates against the published schema:

```bash
miftah scan . --cbom cbom.json
curl -sO https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-1.6.schema.json
# then validate with any JSON Schema Draft 7 validator
```

---

## The console

`miftah console` builds a single self contained HTML file. Drop a scan result on it and you get the inventory, the technical debt view and the roadmap, with the three Mosca assumptions as live controls. No server, no build step, no network access. The scoring model in the page is tested against the Node implementation for exact agreement.

![Console](docs/media/console.png)

---

## The roadmap

Findings are sorted into five waves, because doing this in the wrong order wastes the budget:

| Wave | | When |
| --- | --- | --- |
| 0 | Stop the bleeding | now |
| 1 | Know and govern | 0 to 6 months |
| 2 | Protect traffic in flight | 3 to 12 months |
| 3 | Protect data at rest | 9 to 24 months |
| 4 | Re root identity and signing | 18 to 36 months |

Wave 0 is deliberately not about quantum computers. MD5 and RC4 do not need one.

---

## Crypto agility

Fourteen checks on whether the next migration will be cheaper than this one: is the algorithm behind configuration or a literal, is there a rotation path, is the key material addressable, is there an inventory in CI. Scored separately from the risk, because an estate can be sound today and still be impossible to change.

---

## Notes on the model

The horizon default of **2033** is an assumption, not a prediction, and Miftah shows it as a dashed line precisely so you can argue with it. NIST IR 8547 sets 2030 for deprecation of classical public key cryptography and 2035 for disallowing it; those dates are treated as policy anchors rather than physics.

Risk is scored per asset from quantum exposure, classical weakness, how widely the asset is used, and how exposed the environment is. Readiness counts a quantum resistant asset in full and a weakened one at half.

None of this is a substitute for reading the findings. The score is a way to sort them.

---

## Development

```bash
git clone https://github.com/SiteQ8/miftah
cd miftah
node --test "test/*.test.js"
```

78 tests. The probe tests spin up local TLS and SSH servers and generate real certificates with openssl rather than asserting against fixtures. The console tests execute the page in jsdom and compare its scoring to the Node implementation.

---

## Licence

MIT. See [LICENSE](LICENSE).

Built by [Ali](https://github.com/SiteQ8).

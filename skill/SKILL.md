---
name: miftah
description: Build a cryptographic inventory and judge post quantum readiness. Use when asked to audit cryptography in a codebase, produce a CBOM, check what a quantum computer would break, assess TLS or SSH endpoints, find weak algorithms such as MD5, SHA-1, 3DES, RC4 or short RSA keys, or plan a migration to ML-KEM and ML-DSA.
---

# Miftah

Cryptographic inventory and post quantum readiness. Zero dependencies, Node built-ins only, nothing leaves the machine.

## Install

```bash
npx github:SiteQ8/miftah <command>
```

## Decide what is being asked

| The request | The command |
| --- | --- |
| What cryptography is in this codebase | `miftah scan <path>` |
| Produce an SBOM style inventory | `miftah scan <path> --cbom cbom.json` |
| Is this certificate sound | `miftah cert <path>` |
| What does this server negotiate | `miftah tls <host:port>` |
| Is SSH configured well | `miftah ssh <host:port>` |
| What should we fix first | `miftah roadmap <scan.json>` |
| Will the next migration be cheap | `miftah checklist <scan.json>` |
| Give me something to hand over | `miftah scan <path> --html report.html` |
| Let me explore the result myself | `miftah console <scan.json> --out console.html` |

## The model, so you can explain the output

Every asset gets two verdicts. The **classical** verdict is whether it is broken today. The **quantum** verdict is whether Shor or Grover breaks it later. They are independent, and saying so matters:

- RSA-4096 is classically **strong** and quantum **broken**. It is not a weak key, it is a doomed scheme.
- SHA-256 is classically **strong** and quantum **weakened**. Grover halves it, which still leaves 128 bits. Usually fine.
- MD5 is broken in both senses and does not need a quantum computer to hurt anyone.

Risk ordering follows **Mosca's inequality**: if the years the data must stay secret, plus the years the migration takes, exceed the years until a capable quantum computer exists, the estate is already exposed. Report the exposed window in years rather than arguing about the horizon date.

## Reading a scan

Lead with the exposed window and the readiness score, then the top few assets by risk. Do not list every finding unless asked; the report and console exist for that.

Wave 0 of the roadmap is always the honest place to start, and it is deliberately not about quantum computers.

## Adjusting the assumptions

The defaults assume ten years of required secrecy, a five year migration and a 2033 horizon. Change them when the situation calls for it:

```bash
miftah scan . --shelf-life 25 --migration 7 --horizon 2035 --exposure internal
```

Medical records, legal archives and state secrets justify a long shelf life. A session token justifies almost none. `--exposure airgapped` lowers risk but never to zero.

## In CI

```bash
miftah scan . --cbom cbom.json --fail-on high
```

Exits non zero at that severity or worse.

## Arabic

`--lang ar` produces the report in Arabic with a mirrored horizon strip. The Arabic is written as connected prose, with clauses joined by حروف العطف rather than broken by full stops.

## Do not

- Do not present the horizon year as a prediction. It is an assumption and the tool draws it as a dashed line so it can be argued with.
- Do not collapse the classical and quantum verdicts into one number when explaining a finding.
- Do not recommend migrating signatures before traffic. Recorded traffic is being harvested now; signatures are forged only in the future.

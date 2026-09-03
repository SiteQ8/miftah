# Sample estate

A deliberately mixed tree used to exercise every rule in Miftah. It contains
weak cryptography on purpose, so it is a fixture and never a template. The
scanner should find broken hashes, legacy ciphers, embedded key material,
classical key agreement and a small amount of cryptography that is already
post quantum.

Run it with:

    miftah scan examples/sample-estate

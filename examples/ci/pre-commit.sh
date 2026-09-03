#!/bin/sh
# A pre commit hook that blocks new cryptographic debt.
#
# Install with:
#   cp examples/ci/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
#
# It only fails on findings the baseline does not already accept, so it stays
# quiet until you add something new.

if [ ! -f .miftah-baseline.json ]; then
  echo "miftah: no baseline yet. Run: npx github:SiteQ8/miftah baseline ."
  exit 0
fi

npx --yes github:SiteQ8/miftah scan . \
  --baseline .miftah-baseline.json \
  --fail-on high \
  --quiet || {
    echo ""
    echo "miftah: this commit introduces cryptography that is broken or quantum exposed."
    echo "        Run 'npx github:SiteQ8/miftah scan . --baseline .miftah-baseline.json' to see it."
    echo "        If it is deliberate, accept it with 'miftah baseline .' and commit the baseline."
    exit 1
  }

#!/usr/bin/env python3
"""Blocks Unicode dashes anywhere in the tree. Run before every commit."""
import os
import sys

BAD = {0x2012: 'figure dash', 0x2013: 'en dash', 0x2014: 'em dash', 0x2015: 'horizontal bar'}
SKIP_DIRS = {'.git', 'node_modules', '.venv', 'coverage'}
SKIP_EXT = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.tgz', '.zip', '.woff', '.woff2')

hits = []
files = 0
for root, dirs, names in os.walk(sys.argv[1] if len(sys.argv) > 1 else '.'):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for name in names:
        if name.endswith(SKIP_EXT):
            continue
        path = os.path.join(root, name)
        try:
            text = open(path, encoding='utf-8').read()
        except (UnicodeDecodeError, OSError):
            continue
        files += 1
        for lineno, line in enumerate(text.splitlines(), 1):
            for char in line:
                if ord(char) in BAD:
                    hits.append((path, lineno, BAD[ord(char)], line.strip()[:90]))

print(f'scanned {files} files')
if hits:
    print(f'BLOCKED: {len(hits)} unicode dash(es)')
    for path, lineno, kind, line in hits[:25]:
        print(f'   {path} line {lineno} {kind} -> {line}')
    sys.exit(1)
print('no unicode dashes')

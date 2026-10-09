"""Fetch a public-domain French speech clip for transcription testing.

Kept as a file rather than an inline heredoc so quoting cannot mangle it.
"""

from __future__ import annotations

import sys
import urllib.request

CANDIDATES = [
    # Wikimedia Commons, public domain / CC recordings of spoken French.
    "https://upload.wikimedia.org/wikipedia/commons/2/22/"
    "Fr-Paris-Declaration_des_droits_de_l_homme_et_du_citoyen-article_1.ogg",
    "https://upload.wikimedia.org/wikipedia/commons/1/17/Fr-Bonjour.ogg",
    "https://upload.wikimedia.org/wikipedia/commons/6/6b/"
    "Fr-Declaration_universelle_des_droits_de_l_homme-article_1.ogg",
]

DEST = "/tmp/fr.ogg"


def main() -> int:
    for url in CANDIDATES:
        name = url.rsplit("/", 1)[-1]
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "hesalut-test/1.0"}
            )
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = resp.read()
        except Exception as exc:  # noqa: BLE001
            print(f"  fail  {name}: {type(exc).__name__}")
            continue

        if len(data) < 5000:
            print(f"  skip  {name}: only {len(data):,} bytes")
            continue

        with open(DEST, "wb") as fh:
            fh.write(data)
        print(f"  ok    {name} -> {DEST} ({len(data):,} bytes)")
        return 0

    print("  no French sample could be downloaded", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

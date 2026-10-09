"""Fetch real human speech clips with known reference text.

Tatoeba hosts sentence recordings by native speakers under CC-BY, and exposes
the sentence text alongside them - so each clip comes with ground truth we can
score against rather than guessing by ear.

    python scripts/eval/fetch_corpus.py

Writes clips to /tmp/corpus/<lang>/<id>.mp3 and a manifest.json holding the
reference transcript for each.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path("/tmp/corpus")
UA = {"User-Agent": "hesalut-eval/1.0 (transcription accuracy evaluation)"}

API = "https://tatoeba.org/en/api_v0/search"
AUDIO = "https://audio.tatoeba.org/sentences/{lang}/{sid}.mp3"

# ISO 639-3 codes Tatoeba uses.
LANGS = {"eng": "en", "fra": "fr"}

WANTED_PER_LANG = 6
MIN_WORDS = 5
MAX_WORDS = 30
MAX_PAGES = 8


def _get(url: str, timeout: int = 45) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def find_sentences(lang: str) -> list[dict]:
    """Sentences in `lang` that have audio, with their text."""
    out: list[dict] = []
    seen: set[int] = set()

    # One page holds ~10 results and most are very short, so several pages are
    # needed before enough sentences clear the length floor.
    for page in range(1, MAX_PAGES + 1):
        url = f"{API}?from={lang}&has_audio=yes&sort=random&query=&page={page}"
        try:
            payload = json.loads(_get(url))
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as exc:
            print(f"  [{lang}] page {page} unreachable: {type(exc).__name__}")
            break

        for item in payload.get("results") or []:
            text = (item.get("text") or "").strip()
            sid = item.get("id")
            if not (text and sid and (item.get("audios") or [])):
                continue
            if sid in seen:
                continue
            if not (MIN_WORDS <= len(text.split()) <= MAX_WORDS):
                continue
            seen.add(sid)
            out.append({"id": sid, "text": text})
            if len(out) >= WANTED_PER_LANG:
                return out
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []

    for lang, short in LANGS.items():
        target = OUT / short
        target.mkdir(parents=True, exist_ok=True)
        sentences = find_sentences(lang)
        print(f"  [{lang}] API returned {len(sentences)} usable sentences")

        for s in sentences:
            url = AUDIO.format(lang=lang, sid=s["id"])
            dest = target / f"{s['id']}.mp3"
            try:
                data = _get(url)
            except (urllib.error.URLError, urllib.error.HTTPError) as exc:
                print(f"    skip {s['id']}: {type(exc).__name__}")
                continue
            if len(data) < 2000:
                print(f"    skip {s['id']}: only {len(data)} bytes")
                continue
            dest.write_bytes(data)
            manifest.append(
                {
                    "id": str(s["id"]),
                    "language": short,
                    "path": str(dest),
                    "reference": s["text"],
                    "source": "tatoeba",
                }
            )
            print(f"    ok {s['id']} ({len(data):,} bytes) {s['text'][:60]!r}")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\n  {len(manifest)} clips written to {OUT}")
    return 0 if manifest else 1


if __name__ == "__main__":
    sys.exit(main())

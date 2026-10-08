#!/usr/bin/env python
"""Validate every image URL in data/raw/*.assets.json.

Checks each URL returns HTTP 200 with an image content-type (GET, reads a small
chunk — some CDNs reject HEAD). Prints a summary plus any failures.

Usage:  python scripts/check_assets.py
"""
import glob
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw")
TIMEOUT = 20
WORKERS = 8


def collect():
    """Return list of (kind, owner, url)."""
    out = []
    for path in sorted(glob.glob(os.path.join(RAW_DIR, "*.assets.json"))):
        owner = os.path.basename(path).split(".")[0]
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        game = data.get("game") or {}
        if game.get("icon"):
            out.append(("game.icon", owner, game["icon"]))
        if game.get("banner"):
            out.append(("game.banner", owner, game["banner"]))
        for cur in data.get("currencies") or []:
            if cur.get("icon"):
                out.append((f"currency:{cur.get('name')}", owner, cur["icon"]))
        for ev_id, url in (data.get("banners") or {}).items():
            out.append((f"banner:{ev_id}", owner, url))
    return out


def check(item):
    kind, owner, url = item
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (asset-check)",
        "Accept": "image/*,*/*;q=0.8",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            status = resp.status
            ctype = (resp.headers.get("Content-Type") or "").lower()
            resp.read(256)
        ok = status == 200 and (ctype.startswith("image/") or
                                any(url.split("?")[0].lower().endswith(ext)
                                    for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif")))
        return (ok, kind, owner, url, f"{status} {ctype}")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
        return (False, kind, owner, url, f"{type(exc).__name__}: {exc}")


def main():
    items = collect()
    print(f"checking {len(items)} image URLs across "
          f"{len({i[1] for i in items})} asset files ...")
    bad = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for ok, kind, owner, url, detail in pool.map(check, items):
            if not ok:
                bad.append((kind, owner, url, detail))
                print(f"  FAIL  [{owner}] {kind}: {detail}  {url}")
    print(f"ok: {len(items) - len(bad)}/{len(items)}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())

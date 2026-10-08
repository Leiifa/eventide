#!/usr/bin/env python
"""Merge data/raw/*.json into data/events.js for the static site.

Each raw file has the shape:
    {
      "game":   { id, name, shortName, currentVersion, nextVersion,
                  nextVersionDate, officialUrl, notes },
      "events": [ { id, title, type, status, start, end, datesPrecision,
                    version, summary, description, gameplay, requirements[],
                    rewards[{item, amount, category, rarity, note}],
                    rewardsSummary, servers[], sourceName, sourceUrl,
                    confidence, rumorNotes } ]
      // start/end may be null when datesPrecision is "permanent" (redeem-code
      // storage) or "unannounced" (dev hasn't stated dates) — never guess ranges
    }

Run from anywhere:  python scripts/build_data.py
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "events.js")

GAME_ORDER = ["genshin", "hsr", "wuwa", "enfield", "pgr", "zzz"]

DEFAULT_GAMES = {
    "genshin": {
        "id": "genshin", "name": "Genshin Impact", "shortName": "Genshin",
        "accent": "#e2b857", "officialUrl": "https://genshin.hoyoverse.com/en/",
    },
    "hsr": {
        "id": "hsr", "name": "Honkai: Star Rail", "shortName": "Star Rail",
        "accent": "#9b8cff", "officialUrl": "https://hsr.hoyoverse.com/en-us/",
    },
    "wuwa": {
        "id": "wuwa", "name": "Wuthering Waves", "shortName": "Wuthering Waves",
        "accent": "#2bd9c4", "officialUrl": "https://wutheringwaves.kurogames.com/en/",
    },
    "enfield": {
        "id": "enfield", "name": "Arknights: Endfield", "shortName": "Endfield",
        "accent": "#ff7043", "officialUrl": "https://endfield.gryphline.com/",
    },
    "pgr": {
        "id": "pgr", "name": "Punishing: Gray Raven", "shortName": "PGR",
        "accent": "#ff4d6d", "officialUrl": "https://pgr.kurogame.com/",
    },
    "zzz": {
        "id": "zzz", "name": "Zenless Zone Zero", "shortName": "ZZZ",
        "accent": "#ffe14d", "officialUrl": "https://zenless.hoyoverse.com/en-us/",
    },
}

REQUIRED_EVENT_FIELDS = ["id", "title", "status"]
# start/end may be null: "permanent" listings (redeem-code storage) and
# "unannounced" events carry no date span at all. Never guess ranges.
DATELESS_PRECISIONS = (None, "permanent", "unannounced")


def main():
    games = {}
    events = []
    warnings = []

    for path in sorted(glob.glob(os.path.join(RAW_DIR, "*.json"))):
        name = os.path.splitext(os.path.basename(path))[0]
        if name.endswith(".assets"):
            continue  # merged below, not a game file
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError) as exc:
            warnings.append(f"{name}: cannot read ({exc})")
            continue

        game = dict(data.get("game") or {})
        gid = game.get("id") or name
        game["id"] = gid
        default = DEFAULT_GAMES.get(gid, {})
        for key, value in default.items():
            game.setdefault(key, value)
        game.setdefault("shortName", game.get("name", gid))
        game.setdefault("accent", "#888888")

        # optional assets/metadata companion: <game>.assets.json
        banners = {}
        assets_path = os.path.join(RAW_DIR, f"{name}.assets.json")
        if os.path.exists(assets_path):
            try:
                with open(assets_path, encoding="utf-8") as f:
                    adata = json.load(f)
                for key in ("icon", "banner", "publisher", "developer", "genre",
                            "platforms", "releaseDate", "description"):
                    if (adata.get("game") or {}).get(key):
                        game[key] = adata["game"][key]
                if adata.get("currencies"):
                    game["currencies"] = adata["currencies"]
                banners = adata.get("banners") or {}
            except (OSError, ValueError) as exc:
                warnings.append(f"{name}.assets: cannot read ({exc})")

        games[gid] = game

        for ev in data.get("events") or []:
            if not isinstance(ev, dict):
                warnings.append(f"{name}: skipping non-object event entry")
                continue
            ev = dict(ev)
            ev["game"] = gid
            missing = [f for f in REQUIRED_EVENT_FIELDS if not ev.get(f)]
            if missing:
                warnings.append(f"{name}: event '{ev.get('title', '?')}' missing {missing}")
            s, e, prec = ev.get("start"), ev.get("end"), ev.get("datesPrecision")
            if (s or e) and prec not in ("exact", "approx"):
                warnings.append(f"{name}: event '{ev.get('title', '?')}' has dates but datesPrecision={prec!r} (want exact|approx)")
            if not (s or e) and prec not in DATELESS_PRECISIONS:
                warnings.append(f"{name}: event '{ev.get('title', '?')}' has no dates but datesPrecision={prec!r} (want permanent|unannounced)")
            ev.setdefault("requirements", [])
            ev.setdefault("rewards", [])
            ev.setdefault("servers", ["global"])
            ev.setdefault("confidence", "confirmed")
            ev["banner"] = banners.get(ev.get("id")) or None
            events.append(ev)

    # normalise id uniqueness
    seen = set()
    for ev in events:
        base = ev.get("id") or f"{ev['game']}-{ev.get('title', 'event')}"
        eid = base
        n = 2
        while eid in seen:
            eid = f"{base}-{n}"
            n += 1
        seen.add(eid)
        ev["id"] = eid

    # deterministic order: game order, then start date
    def sort_key(ev):
        gidx = GAME_ORDER.index(ev["game"]) if ev["game"] in GAME_ORDER else 99
        return (gidx, ev.get("start") or "9999", ev.get("id"))

    events.sort(key=sort_key)

    ordered_games = [games[g] for g in GAME_ORDER if g in games]
    ordered_games += [g for k, g in sorted(games.items()) if k not in GAME_ORDER]

    payload = {
        "generatedAt": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(timespec="seconds"),
        "games": ordered_games,
        "events": events,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by scripts/build_data.py — edit data/raw/*.json instead.\n")
        f.write("window.GACHA_DATA = ")
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write(";\n")

    print(f"wrote {OUT}")
    print(f"  games : {len(ordered_games)} ({', '.join(g['id'] for g in ordered_games)})")
    print(f"  events: {len(events)}")
    for g in ordered_games:
        count = sum(1 for e in events if e["game"] == g["id"])
        banners = sum(1 for e in events if e["game"] == g["id"] and e.get("banner"))
        print(f"    - {g['id']:<8} {count:>3} events, {banners:>3} with banner art")
    for w in warnings:
        print(f"  WARN: {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

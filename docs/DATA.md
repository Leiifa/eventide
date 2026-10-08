# Data guide

Maintainer reference for Eventide's event data — file format and update workflow. Nothing here is
needed to use the site.

## Where the data lives

```
data/raw/*.json            ← source of truth, one file per game (edit these)
data/raw/<game>.assets.json ← optional companion: icons, banners, store metadata (see below)
data/events.js             ← generated; loaded by index.html
scripts/build_data.py
scripts/check_assets.py    ← verifies every image URL in the assets files still loads
```

After editing anything in `data/raw/`, regenerate:

```
python scripts/build_data.py
```

## Per-game file shape

```jsonc
{
  "game": {
    "id": "genshin",
    "name": "Genshin Impact",
    "shortName": "Genshin",
    "currentVersion": "6.1",
    "nextVersion": "6.2",
    "nextVersionDate": "2026-10-22",
    "officialUrl": "https://genshin.hoyoverse.com/en/",
    "notes": "…"
  },
  "events": [
    {
      "id": "genshin-example-event",
      "title": "Example Event",
      "type": "Combat Event",              // any label; feeds the type filter
      "status": "live",                     // live | upcoming | ended (recomputed from dates)
      "start": "2026-10-02",                // YYYY-MM-DD, or YYYY-MM when only the month is known
      "end": "2026-10-21",                  // null when no date span applies (see datesPrecision)
      "datesPrecision": "exact",            // exact | approx (approx keeps the stated status)
                                            // | permanent  (redeem-code storage: never a date span)
                                            // | unannounced (dev hasn't stated dates yet — show
                                            //   "not announced yet", never guess a range)
      "version": "6.1",
      "summary": "One sentence.",
      "description": "What the event is about.",
      "gameplay": "How you play it.",
      "requirements": ["Adventure Rank 30+"],
      "rewards": [
        { "item": "Primogem", "amount": 1000, "category": "currency", "rarity": 5, "note": "total" }
      ],
      "rewardsSummary": "1,000 Primogems + …",
      "servers": ["global"],
      "sourceName": "HoYoLAB",
      "sourceUrl": "https://…",
      "confidence": "confirmed",            // confirmed | leaked | rumor
      "rumorNotes": null
    }
  ]
}
```

### Redeem codes

A code event is **permanent code storage**, not a time-limited event: the entry itself carries no
date span (`start`/`end` null, `datesPrecision: "permanent"`). Only an individual code can expire,
and only when the dev states an expiry — never guess one. The drawer groups codes by treatment:

```jsonc
      "codes": [
        { "code": "GENSHINGIFT", "note": "Hero's Wit ×3", "permanent": true },
        { "code": "VesnaOnPatrol", "note": "40 Primogems, …", "expires": "2026-10-22" },
        { "code": "ENDFIELDSTEAM", "note": "8,000 T-Creds, …", "patchLimited": true }
      ]
```

- `permanent: true` — evergreen code with no expiry.
- `expires` — `YYYY-MM-DD`, used **only** when the dev states the expiry.
- `patchLimited: true` — everything else: tied to a patch window with no dev-stated expiry.
- `expiryNote` — optional free text shown with the badge for extra nuance (e.g. "expires with v4.7").
  Never use it for "TBA"/"unknown" — classify the code as `permanent` or `patchLimited` instead.

## Assets companion (`<game>.assets.json`)

Optional, merged automatically by `build_data.py`. Holds the images and store-page info for the
Games tab and game detail pages:

```jsonc
{
  "game": {
    "icon": "https://…/icon.png",          // square app icon / logo
    "banner": "https://…/key-art.jpg",     // wide key art
    "publisher": "HoYoverse",
    "developer": "…",
    "genre": "Open-world action RPG",
    "platforms": ["PC", "PS5", "iOS", "Android"],
    "releaseDate": "2020-09-28",
    "description": "2–4 sentences, store-page style."
  },
  "currencies": [
    { "name": "Primogem", "icon": "https://…/Primogem.png", "note": "premium pull currency" }
  ],
  "banners": {
    "genshin-some-event-id": "https://…/event-banner.jpg"
  }
}
```

- `banners` keys are **exact event ids** from the game's `<game>.json`. Events without official
  banner art (rumors, unannounced) are simply left out — the UI renders a styled fallback.
- Image URLs must be direct links to images (not HTML pages). Anything that fails to load falls back
  to a gradient/letter placeholder in the UI, so a dead hotlink degrades instead of breaking.

## Rules the renderer relies on

- `amount` may be `null` when unknown — never invent numbers.
- Never invent date ranges either: an event with no dev-stated dates gets `start`/`end` null and
  `datesPrecision: "unannounced"` (renders as "not announced yet"), and rumor entries keep
  `datesPrecision: "approx"` with their estimated ranges.
- `confidence` != `confirmed` puts the event on the Radar under "Rumors & leaks" and paints it as a
  hatched bar on the timeline, so guesses never look like schedule.
- `servers: ["global"]` matches every server selection.

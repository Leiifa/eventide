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
      "end": "2026-10-21",
      "datesPrecision": "exact",            // exact | approx (approx keeps the stated status)
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

A code event's entry carries a `codes` array; the drawer groups them into
"Permanent — no expiry" and "Time-limited":

```jsonc
      "codes": [
        { "code": "GENSHINGIFT", "note": "Hero's Wit ×3", "permanent": true },
        { "code": "VesnaOnPatrol", "note": "40 Primogems, …", "expires": "2026-10-22" }
      ]
```

- `permanent: true` puts the code in the permanent group.
- `expires` is a date (`YYYY-MM-DD`). When expiry isn't a fixed date, use `expiryNote` free text
  instead (e.g. "expires with v4.7").

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
- `confidence` != `confirmed` puts the event on the Radar under "Rumors & leaks" and paints it as a
  hatched bar on the timeline, so guesses never look like schedule.
- `servers: ["global"]` matches every server selection.

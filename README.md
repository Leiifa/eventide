# Eventide — gacha event tracker

One place for every event across the games you play: **Genshin Impact**, **Honkai: Star Rail**,
**Wuthering Waves**, **Arknights: Endfield**, **Punishing: Gray Raven**.

- **Home** — the landing page: live board (live/upcoming/rumor counts, next up), starting-soon and
  ending-soon lists, biggest pull-currency payouts, game tiles, rumor teaser. Real data, no filler.
- **Events** — dense, filterable list: what the event is, requirements, dates, and rewards (the important part).
- **Timeline** — one seamless horizontal calendar instead of stacked month cards: every event is a bar
  on a continuous month axis (sticky event labels + sticky month header), opening scrolled to today
  with past months to the left — just scroll sideways — plus a Today button. Undated events sit in a
  Dates TBA panel below.
- **Radar** — what's announced next, plus rumors/leaks kept clearly separated from confirmed dates.
- **Games** — cards for every supported game (banner, icon, live/upcoming counts) opening a
  Play Store-style detail page: key art, icon, publisher/genre/platforms, about text, current patch and
  next update, reward-currency icons, and live/upcoming/ended event cards with official event banners.
  No ratings or reviews.
- **Server selector** — top right. Most events run on every server with the same dates; the filter only
  narrows region-specific entries. Your choice is remembered.
- **Back-to-top button** (bottom right) appears after 320px of scrolling; its outline ring — drawn in
  the signature two-corner shape — fills to show scroll progress. 52px tap target for mobile.

Dates are day-level only (no times), shown as `12 Oct 2026`.

## Run it

No build step, no server needed — double-click `index.html`.
Or serve it if you prefer: `python -m http.server 8000` then open http://localhost:8000

## Where the data lives

```
data/raw/*.json          ← source of truth, one file per game (edit these)
data/raw/<game>.assets.json ← optional companion: icons, banners, store metadata (see below)
data/events.js           ← generated; loaded by index.html
scripts/build_data.py
scripts/check_assets.py  ← verifies every image URL in the assets files still loads
```

After editing anything in `data/raw/`, regenerate:

```
python scripts/build_data.py
```

### Per-game file shape

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

### Assets companion (`<game>.assets.json`)

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

Rules the renderer relies on:

- `amount` may be `null` when unknown — never invent numbers.
- `confidence` != `confirmed` puts the event on the Radar under "Rumors & leaks" and paints it as a
  hatched bar on the timeline, so guesses never look like schedule.
- `servers: ["global"]` matches every server selection.

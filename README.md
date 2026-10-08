# Eventide

**Every event, every game, one calendar.**

Eventide is a free tracker for gacha game events. Instead of juggling wikis and launchers, you get
one board with rewards up front, dates down to the day, and rumors clearly labeled as rumors.

[🌐 Visit Website](https://leiifa.github.io/eventide/)

## Games

Genshin Impact · Honkai: Star Rail · Wuthering Waves · Arknights: Endfield · Punishing: Gray Raven · Zenless Zone Zero

## Features

- **Home** — what's live, what starts soon, what ends soon, and the biggest pull-currency payouts.
- **Events** — a filterable list: search by name or reward, filter by game, status and type.
- **Timeline** — a horizontal calendar of every event. Drag to pan, jump back to today anytime.
- **Radar** — upcoming events kept separate from rumors and leaks, so guesses never look like schedule.
- **Games** — a page per game with its current patch, next update, reward currencies and event art.
- **Redeem codes** — active codes for each game, with permanent and expiring codes grouped apart.
- **Server filter** — narrow region-specific events when you need to.

Every event links to its source, and dates are day-level on purpose (no times).

## Run it locally

No build step and no dependencies. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000
```

## Maintaining

Event data lives in `data/raw/`. See the [data guide](docs/DATA.md) for the file format and update workflow.

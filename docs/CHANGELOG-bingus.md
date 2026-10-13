# Changes by Bingus (website, this session)

Scope: site code and display (`assets/app.js`, `assets/styles.css`, `index.html`) plus the Wuthering Waves event addition described below. Hermes handled the redeem-code and unannounced-event data rules; Bingus added the confirmed Waking Moon Fishing event to `data/raw/wuwa.json` and rebuilt `data/events.js`.

## Display logic (assets/app.js)

- Tab titles now follow the current view: `Events · Eventide`, `Timeline · Eventide`, game pages show the game name.
- `dateText(ev)` added. Used in every date slot (cards, rows, drawer, Home, Radar, Timeline tooltip):
  - `datesPrecision: "permanent"` or type `Redeem Codes` → "Permanent code list"
  - `datesPrecision: "unannounced"` → "Not announced yet"
  - otherwise the normal date range.
- `countdownText(ev)`:
  - permanent → "No end date"
  - unannounced → "Not announced yet"
  - unparseable upcoming dates → "Not announced yet" (was "Dates TBA").
- Redeem code drawer groups renamed: "Permanent — no expiry" → "Permanent", "Time-limited" → "Limited". Codes with no expiry badge show "limited" (was "expiry not published").

## Copy changes (assets/app.js, index.html)

| Where | Before | After |
|---|---|---|
| Home panel heading | Biggest pull-currency payouts | Most rewarding event |
| Home panel hint | rare currency only · biggest first · live + upcoming | Highest first · live and upcoming |
| Home date fallback (3 places) | Dates TBA | No dates yet |
| Reward fallback (2 places) | rewards TBA | rewards not published |
| Parser fallback | TBA | not announced |
| Home ending-soon hint | don't leave rewards on the table | closing soon |
| Home title | Every event, every game. One calendar. | Gacha events, one calendar. |
| Home intro | Stop juggling wikis and launchers. Eventide puts every game you play on one board — … | Rewards, dates and rumors for every game you play, all on one calendar. Rumors are labeled as rumors. |
| Starting soon empty | Nothing lands in the next two weeks. | No events start in the next 14 days. |
| Ending soon empty | Nothing expires this week. | No events end in the next 7 days. |
| Rumors empty | Nothing floating around right now. | No rumors right now. |
| Games page intro (index.html) | Banner, icon, reward currencies and event art for every game we track. Open one for the full rundown. | Banners, icons, reward currencies and event art for each game. Open one for details. |

## Footer sources

- Added a collapsible “Sources used” list in the footer. It builds from unique HTTPS hostnames in the event source URLs, links to one cited page per source site, and updates automatically when source URLs are added or removed.
- Added responsive grid styling; bumped the stylesheet and app script cache tags.

## Event addition

- Added confirmed Wuthering Waves 3.7 web event **Waking Moon Fishing** (`wuwa-waking-moon-fishing`), 15/10/2026–1/11/2026, with source URL from the official patch notes via WuWaBuild. Rewards were not listed in the supplied findings, so none were invented. It appears in Home → Starting soon.
- Rebuilt `data/events.js` from raw data (93 total events; Wuthering Waves 15 at addition time). `index.html` data cache tag bumped to `20261013`.

## Not changed

- Hermes's redeem-code and unannounced-event data rules remain unchanged.
- Layout, colors, nav order, and mobile behavior are untouched.
- The Waking Moon Fishing addition was committed as `00e85ef`; the footer update is currently uncommitted.

## Still open

- No open decisions from this change. The 30 patch-limited codes stay limited unless Leifa identifies a specific evergreen code; ENDFIELD4PC remains permanent with its PC-only note.

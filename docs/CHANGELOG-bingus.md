# Changes by Bingus (website, this session)

Scope: site code and display only (`assets/app.js`, `index.html`). No data files were changed by Bingus. Data changes for redeem codes and unannounced events were made by Hermes in `data/raw/` and `scripts/build_data.py`.

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

## Not changed

- Hermes's data rules are untouched (redeem codes have no date span, unannounced events have `datesPrecision: "unannounced"`).
- Layout, colors, nav order, and mobile behavior are untouched.
- Nothing has been committed.

## Still open

- Leifa to review the remaining copy on Home and Games pages.
- Patch-limited flags on 30 redeem codes (genshin 11, hsr 10, enfield 2, pgr 4, zzz 3). These are Hermes's classifications. Leifa needs to say which, if any, are evergreen. Hermes then flips them to `"permanent": true` in `data/raw/`. Hermes does this, not Bingus.

# Changelog

## 2026-10-13 — Bahasa Indonesia interface

- Added an English / Bahasa Indonesia selector in the site header.
- Remembered the selected language in the browser; Indonesian browser settings are used when no preference has been saved.
- Localized interface labels, navigation, statuses, dates, and page titles. Game names, event titles, and source descriptions remain in their original wording.
- Kept the selector usable on narrow screens without horizontal page overflow.
- Verified with `node tests/i18n.test.js`, JavaScript syntax checks, and the local preview.

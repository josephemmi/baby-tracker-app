# Changelog

All notable changes to Nestlog are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/) —
`MAJOR.MINOR.PATCH`, where MAJOR is a breaking/major redesign, MINOR is a new
feature, and PATCH is a fix with no new functionality.

## [Unreleased]

## [1.4.0] - 2026-07-21

### Added
- Pump tracking for Jen — a Pump chip on Home and Timeline (desktop table
  and mobile card), logged as its own independent entry, with or without
  an accompanying feed at the same moment
- Reports: Pump sessions and Total pumped stat cards, a pumped-mL-by-day
  bar chart, and a Pumped mL column in the daily summary table
- Timeline: a Pump filter chip alongside Bottle/Breast/Poo/Pee

### Changed
- `entries` schema: `type` now additionally allows `'pump'` — additive
  only, the existing `type`/`amount_ml` columns and all historical rows
  are untouched. Pump reuses `amount_ml` for pumped volume rather than a
  new column.

## [1.3.0] - 2026-07-21

### Added
- Installable as a PWA — "Add to Home Screen" now launches Nestlog
  fullscreen with its own icon (brand mark, generated at 192/512/maskable
  sizes) instead of opening as a browser tab/bookmark
- A minimal service worker caches static build assets for faster repeat
  loads; it deliberately never caches navigation, API, or Supabase
  requests, so logged data is always fresh

## [1.2.0] - 2026-07-21

### Added
- Phone-width (≤640px) card layout for Home and Timeline, replacing the
  horizontally-scrolling table below the existing breakpoint — same fields
  (Breast, Bottle, mL, Poo, Pee, Notes, logged-by), reordered into a
  stacked card. Home's cards are fully editable with a per-card delete
  control; Timeline's stay read-only, matching the desktop split.
- iPad and desktop keep the existing table layout, unchanged.

## [1.1.0] - 2026-07-20

### Added
- Feed logging now splits into independent Bottle and Breast toggles
  (previously a single "Feed" checkbox) — either, both, or neither can be
  checked on a row, matching how real feeds actually happen
- Reports: split Bottle feeds/Breastfeeds stat cards, a bottle-only mL chart
  with a breastfeeding indicator on relevant days, and a grouped Bottle vs.
  Breast bar chart
- Daily summary table now splits Bottle feeds and Breastfeeds into separate
  columns

### Changed
- `entries` schema: added `bottle`/`breast` boolean columns, additively —
  the existing `type`/`amount_ml` columns and all historical rows are
  untouched; historical feeds were backfilled as bottle feeds

## [1.0.0] - 2026-07-20

First release — live and in use.

### Added
- Email/password auth with invite-code household onboarding (create a new
  household, or join an existing one via code)
- Google sign-in via Supabase OAuth
- Matrix-style Home/Log screen: one row per moment, Feed/Poo/Pee as
  independent checkboxes, every field (time, mL, notes, logged-by) directly
  editable in place at all times — no modal, no save step
- Tap the "logged by" pill to reassign who logged an entry
- Three glance cards: Last feed, Last poo, Last pee
- Realtime sync — entries logged by one household member appear live for
  everyone else
- Timeline view: full history, filterable by type, grouped by day, paginated
  100 entries per page
- Reports tab: stat cards (total entries, total feeds, avg mL/feed, avg gap
  between feeds), feed volume/count bar charts, daily summary table, and a
  date-range filter (Last 7 days / Last 30 days / Monthly / Yearly / All time)
- Row select + delete (single or bulk) on the Home table
- Tap-to-share the household invite code via the native share sheet, with a
  link that prefills the recipient's signup as "join this household"
- "View more" link from Home to Timeline once Home's 100-entry cap is hit

### Changed
- Full visual restyle to the Nestlog design spec — paper/ink/sage/amber/
  terracotta palette, brand mark, typography, and component states
- Home ordering is chronological (matches Timeline), not logging order
- Home's logging interaction reworked to match the approved prototype exactly

### Fixed
- Session not persisting, caused by Next.js 16 renaming `middleware.ts` to
  `proxy.ts`
- Login/signup bouncing back to the login screen after a successful auth
- Signup confirmation emails linking to `localhost` instead of the live
  production domain
- "Xh 60m" display bug in the avg-gap-between-feeds stat
- Slow tab navigation, caused by a redundant DB round trip and no loading
  feedback between clicks

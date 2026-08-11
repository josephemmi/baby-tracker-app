# Changelog

All notable changes to Nestlog are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/) —
`MAJOR.MINOR.PATCH`, where MAJOR is a breaking/major redesign, MINOR is a new
feature, and PATCH is a fix with no new functionality.

## [Unreleased]

### Added
- Per-side breastfeeding timer (Right/Left) — checking Breast opens an inline
  panel (a detail row on desktop, an inline panel on mobile, no modal) with
  Left/Right start-pause buttons; tapping one side auto-pauses the other, and
  the session stays open across any number of pauses/switches until an
  explicit "End Session" finalizes it. Elapsed time is computed from a
  stored start timestamp rather than counted tick-by-tick, so it's exactly
  right even after the app is backgrounded and iOS/Android throttle timers.
  In-progress session state (which side, since when) is synced through the
  same `entries` row and realtime pipeline every other field already uses,
  so a session started on one device shows as "in progress" — live, ticking,
  read-only — on every other connected device, including Timeline. Once
  ended, a compact total shows under the Breast checkbox on desktop
  (tap-to-expand for the Right/Left breakdown) or a full inline summary line
  on mobile. Unchecking Breast with real recorded time prompts a
  confirmation before clearing it. Reports gets two new stat cards
  (Breastfeed sessions, Avg. session length), a "Breastfeeding time by day"
  Right-vs-Left chart, and three new Daily Summary columns (Right, Left,
  Breast total) — all computed only from ended sessions, excluding anything
  still in progress.

### Changed
- `entries` schema: added `breast_right_seconds`/`breast_left_seconds`
  (finalized accumulated seconds per side), `breast_active_side`/
  `breast_active_started_at` (live in-progress state), and
  `breast_session_ended` — additive only, existing columns and rows
  untouched.

## [1.6.2] - 2026-07-26

### Fixed
- Reports on phones: the pump chart's permanent two-line bar labels
  ("1130 mL" / "6 sessions") couldn't shrink or wrap, so on a 9-bar range
  they forced the whole chart — and the whole page — wider than the
  viewport, clipping the last bar or two off-screen. The bottle/breast
  grouped chart had the same root cause with its date labels, squeezing
  them down to unreadable "20 …" ellipsis instead. Both charts now scroll
  horizontally within their own card once there's more data than
  comfortably fits, the same pattern the Daily Summary table already
  used — labels stay fully legible and the page itself never overflows
  sideways. Desktop is unaffected (charts already had room to spare)

## [1.6.1] - 2026-07-26

### Fixed
- Home: the v1.4.1 sync fix re-subscribed the realtime channel on every
  20s poll tick, not just on genuine foreground events — that churn
  (tear down + recreate a channel every ~20s, on every connected device)
  is plausibly what was keeping the realtime tenant unstable in the first
  place. The poll now only refetches; the channel is only torn down and
  rebuilt on an actual "we're back" signal, and the poll interval is down
  to 10s
- Home: confirmed Vercel serves Home fully dynamic and uncached
  (`Cache-Control: no-store`), so a genuine cold launch always gets live
  data — the remaining gap is iOS resuming an already-open standalone PWA
  from its home-screen icon without reliably firing any of
  visibilitychange/pageshow/focus, a documented WebKit inconsistency.
  Home now also refetches on the first tap after a while, regardless of
  whether any lifecycle event fired, since that doesn't depend on iOS
  cooperating at all

## [1.6.0] - 2026-07-25

### Added
- Reports: the "Pumped volume by day" chart now shows session count
  alongside volume — each bar's label is stacked two lines (mL, then
  correctly pluralized session count in plum), so a day with lower
  volume but far more sessions reads at a glance instead of needing a
  second chart. The Daily Summary table gets a new "Pump sessions"
  column (before "Pumped mL"), and every column except "Day" is now
  center-aligned — not just the new one, the whole table. Pure
  display/aggregation change, no schema change

## [1.5.0] - 2026-07-24

### Added
- Notes: tapping the notes field — whether it's empty or already has a
  note — now opens a modal for reading, writing, editing, and deleting,
  instead of a small inline field that got cramped once real text
  existed. It doesn't auto-focus the textarea on open (so it doesn't pull
  up the mobile keyboard just to read a note), Save stays disabled until
  the text genuinely differs from what was loaded (re-disabling if you
  edit your way back to the original), and Delete only appears once
  there's an existing note to delete. Applies on Home, Timeline, desktop,
  and mobile via one shared component; Timeline's version is read-only
  (view/close only, no Save or Delete), matching Timeline's existing
  read-only behavior elsewhere

## [1.4.1] - 2026-07-22

### Fixed
- iPad PWA: relaunching the app no longer pops the native date/time picker
  open by itself — WebKit was restoring focus to whatever input was last
  focused before the app was backgrounded, reopening its picker along with
  it
- Home: newly logged entries from another device could go missing until
  the app was force-closed and reopened. Realtime can go silently stale
  while backgrounded (confirmed in Supabase's own logs — the realtime
  connection is torn down after a period with no active clients and has
  to cold-start again), and a single foreground event wasn't a reliable
  enough signal to catch it on its own. Home now resyncs on every
  plausible "we're back" signal (tab foregrounded, page restored from
  cache, window refocused) and additionally polls every 20s while open,
  so it can never drift for more than that regardless of which signal
  the device actually fires

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

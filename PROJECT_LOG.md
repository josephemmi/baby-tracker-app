# Project Log

A running, reverse-chronological record of what's happened on this app,
session by session — not user-facing release notes (that's
`CHANGELOG.md`), but the internal narrative: what got worked on, what
state things were left in, and what's worth knowing next. Read this at
the start of a session to pick up where the last one left off instead of
starting cold — it's imported into every session automatically via
`CLAUDE.md`, the same way `AGENTS.md` is.

Add a new entry at the top whenever a meaningful unit of work wraps up —
this is one of the things the `retro` skill does.

## Entry format

Each entry: the date, what was done (with ticket/PR links), anything
left in flight or still open, and anything worth flagging for whoever
picks this up next.

---

## 2026-10-20, later (JOS-83 merged; tile and night-label follow-ups)

**Done:**
- Joseph said to merge: [PR #44](https://github.com/josephemmi/baby-tracker-app/pull/44)
  is **merged** (merge commit `c2c481f`), which is the v1.14.0 release.
  Production deployed READY, with no runtime errors in the two hours after.
  [JOS-83](https://linear.app/josephemmi/issue/JOS-83) went to Done by itself;
  JOS-84 and JOS-86 (the docs commits that rode on it, named only as links in
  the PR body) stayed In Review and were moved by hand. This entry replaces the
  "open, not merged" wording in the one below.
- Log tile layout, round 2. Joseph likes two by two on a tablet but not the
  empty space inside Last pee: the pill makes Last sleep 48 px taller, so Last
  pee is stretched to match, and everything below the tiles jumps 48 px when a
  sleep starts. The options were drawn as CSS variants injected into the real
  component and measured (Artifact page, version 3). Tablet: **H** pill beside
  the label in a smaller size (all four tiles 83 px, the block 177 px in every
  state), **S** pill as a bar under the grid, **N** tiles not stretched. Phone:
  **P1** is H (366 px in every state, 414 today while sleeping), **P2** tighter
  (298 px), **P3** two by two with clock times (181 / 225 px), **P4** one list
  (189 / 233 px). Option D was a rule (A below 1024 px, B from 1024 px up) and
  is dropped. His principle: one responsive component with multiple sizes,
  never one per screen size (CLAUDE.md, Design approach).
- He asked why a night from Monday 7 pm to Tuesday 8:30 am counts on Tuesday.
  That is the spec's rule (a sleep belongs to the date baby woke); answered with
  the engine's numbers. Nothing changed.
- Filed: [JOS-87](https://linear.app/josephemmi/issue/JOS-87) (Polish, Needs
  Scoping, Backlog): the tile and pill layout;
  [JOS-88](https://linear.app/josephemmi/issue/JOS-88) (Polish, Needs Scoping,
  Low): which day a night counts on and how it is labelled;
  [JOS-89](https://linear.app/josephemmi/issue/JOS-89) (Process, In Progress):
  this retro (a Design approach section, two gotchas and a sentence on ticket
  closing in CLAUDE.md, and this entry), a docs commit on the JOS-87 branch.

- Joseph then looked at the Sleep averages on production and found Average
  bedtime 1:13 am and Average wake-up 10:34 am (the baby goes to bed around
  7:30 pm and wakes around 8 am) and a Saturday row of 3h 50m, bedtime 11:07 am,
  up 2:57 pm, and asked whether Saturday was made up. It was not: the live
  `sleeps` table has nine real sleeps logged by Joseph and Jen, and an independent
  recomputation and the app's own engine both reproduce every number he saw.
  The arithmetic was right and the classification wrong: Saturday 17 Oct is the
  first day of logging, with no night in the record (Saturday night ends on
  Sunday), and the rule named the longest sleep that ended on a date the night
  with no minimum, so the 11:07 am to 2:57 pm sleep became Saturday's night. Fix
  on [JOS-90](https://linear.app/josephemmi/issue/JOS-90) (Bug, In Progress): a
  night needs 5 h asleep (`CFG.minNightMs`), a day with no night is left out of
  every average and named under the Averages heading, and clearer labels (Average
  time asleep per day, Average length of night sleep, Average wake-up time). It
  changes the agreed model, so the v1.14 spec, prototype and reference engine in
  Drive need the same two changes. With the fix the live week reads bedtime
  8:16 pm, wake-up 8:23 am, night 10h 42m, day 11h 59m.
- Joseph's next review round on that PR ([PR #45](https://github.com/josephemmi/baby-tracker-app/pull/45)):
  he agrees a day with no logged night stays out of the averages and wants it
  said where the numbers are read; the Sleep tab's section titles bigger; the
  Delete sleep button gone (the × does the same, and the button is "too prone to
  confusion or error"); and sleep cards in Edit mode's bulk delete. The session's
  branch is fixed, so all of it rides on PR #45 (one preview, one review), each
  as its own commit and ticket.
  [JOS-91](https://linear.app/josephemmi/issue/JOS-91) (Polish): one title style
  (`SECTION_TITLE`, 17 px bold, an `h2`) for the five Sleep sections, 24 px
  between them, the table's title above the part that scrolls, and a line under
  24-hour pattern and under Averages saying only logged sleeps are counted.
  [JOS-92](https://linear.app/josephemmi/issue/JOS-92) (Polish): the Delete sleep
  button is removed and the Sleep tile's notice on a finished card points to the
  ×; in Edit a sleep card shows the same tick box as a moment (`sleepSelectKey`
  keeps the two apart in one set), Delete (n) counts both and the box says so
  ("Delete 3 logged moments and 1 sleep?", plus "A sleep that is still going will
  be stopped." when one is), the sleeps go one at a time on the version he saw, a
  sleep the other parent changed first stays and a toast names it (a count first
  when it is more than one), and a dropped connection stops the rest. No
  migration. Checked on the scratch-Postgres harness with two phones (69 checks:
  the mix of moments and sleeps, a running sleep, Cancel, a conflict, two
  conflicts, a dropped connection, a tick on a sleep the other parent deleted,
  the stacked cards at 768 and 1024 px, the header at 320 to 1024 px).
- He also confirmed the sleep paused at 7:05 and resumed at 7:43 (ended 10:16) is
  one valid night, so nothing changes there. A morning reminder when last night
  is not logged, and a tenth KPI to even the Averages grid, were asked about as
  opinions only: nothing built (see the reply).

**In flight / open:**
- JOS-90, JOS-91 and JOS-92 are one PR waiting for Joseph's review (the preview
  shares the live database, so it shows his real week). At the release cut
  (confirm the level: a patch for JOS-90 alone, a minor is arguable with JOS-92)
  reshoot the Sleep tracker guide images that show the old Reports averages
  labels and section titles and the Delete sleep button (pages for finished
  cards and the confirm box), and rebuild the notes. Last night's sleep (Mon
  7:20 pm to Tue 10:16 am) is not in the averages yet because it counts as today;
  it joins tomorrow. Counting a finished night at once would be a separate
  change.
- JOS-87 waits for Joseph's pick (a tablet letter and a phone letter); my
  recommendation is H and P1, P2 if he wants more room. Build it on the assigned
  branch (restarted from the production tip) with JOS-87 in the PR title. The
  Sleep tracker guide and the v1.14.0 release notes show the old tile (pill under
  the value), so reshoot those images and resend both PDFs once he approves that
  PR.
- JOS-88 waits for his choice: keep the wake-date rule and label a night by both
  days (my recommendation, label only), or switch to the start date (a spec
  change first: the prototype, engine and spec in Drive, then the port and its
  52 tests).
- The device checks from the entry below still stand (Jen's iPad, Android with a
  running sleep, realtime on two devices); realtime delivery has not been
  exercised.

**Worth knowing:**
- The comparison scripts (`tiles.mjs`, `tiles2.mjs`, `build_tiles_page2.py`,
  `page-test.mjs`) live only in a session scratchpad (JOS-57); the temporary
  `src/app/dev-preview/tiles` route is deleted and not in the tree.
- A container query can only restyle descendants of its container: for H the
  query sits on the tile and the pill is absolutely placed, so the tile height
  never changes (CLAUDE.md has the detail).
- Drive: each feature folder is attached to its Linear ticket. A `fullText`
  search returned snippets of Joseph's personal notes, so search by title and
  parent, without snippets.

---

## 2026-10-20 (JOS-83, v1.14.0)

**Done:**
- [JOS-83](https://linear.app/josephemmi/issue/JOS-83) (Feature, In Review):
  [PR #44](https://github.com/josephemmi/baby-tracker-app/pull/44) is open, not
  merged. Reports gets a **Sleep tab** (`/reports?tab=sleep`): a Today card, a
  24-hour pattern, nine averages, two charts and a daily table, with the same
  range pills as Feeds. Log gets a fourth tile, **Last sleep** (two by two from
  640 px), with a Sleeping now / Paused pill while a sleep is open. A finished
  card gets **Delete sleep** (the box names the sleep; deleting the newest
  gives the one before it its Reopen back; a lost race names who got there
  first; a refused restore says which sleep is in the way). Sleep is **one
  indigo**: `night` #2a3563 and `night-soft` #dde5f3, `night-deep` gone.
- **No migration.** Discard already calls `delete_sleep` for any state and
  `restore_sleep` already re-runs the overlap check; "Jen already deleted this
  sleep" is read client-side from the deleted row (members may read it).
- The reference engine is ported to `src/lib/sleep-reports.ts` (all 52 tests
  plus 7: the auto-close adapter, the 5 min / 6 h / 12 h boundaries, a
  `canReopen` cross-check); the strings and rows the screens show are pure
  view models in `sleep-report-view.ts`, pinned to the spec. 379 unit tests
  under `TZ=UTC`; `supabase/tests/sleeps.sql` has scenarios 18 and 19.
- Checked on the scratch-Postgres harness with two simulated phones (Delete
  sleep both orders, restore refusals, the Reports ranges and states, layout at
  five widths), by feeding the same generated sleeps to the prototype and to the
  app (420 comparisons, 0 differences), and by mutation (32 of 33 TS mutants
  killed, the survivor equivalent; the two new SQL scenarios checked against a
  broken copy of the migration).
- **v1.14.0 cut in the same PR** (version given in the brief): CHANGELOG, bump,
  `NestlogReleaseNotesv1.14.0.pdf` (one page, three shots) and the Sleep tracker
  guide refreshed to eight pages (the 14 shots that show the old blue reshot;
  new: the tile, Delete sleep and its box, a refused restore, two Reports
  pages). Both sent in chat and attached to JOS-83 with the notes as a comment.
  **Merging PR #44 is the release.**
- `retro`: [JOS-84](https://linear.app/josephemmi/issue/JOS-84) (Process, In
  Review): CLAUDE.md notes on screenshot traps on the harness, a per-file `TZ`
  in Vitest, and the GitHub MCP route for PRs (a separate commit on PR #44).
  Comments on JOS-57, JOS-66, JOS-69 and JOS-79.
  [JOS-85](https://linear.app/josephemmi/issue/JOS-85) (Polish, Backlog): the
  app header is 4 px wider than a 320 px screen (found here, not new).
- Joseph's answers after the PR opened (20 Oct), written up as
  [JOS-86](https://linear.app/josephemmi/issue/JOS-86) (Process, In Review,
  another docs commit on PR #44): **the release notes, guide and version bump
  are built after he says the PR is approved, not with the PR** (CLAUDE.md,
  Release process); the guide takes the pages it needs and is cut only for
  wordiness (the six-page aim is gone); and a page of real screenshots for the
  Log tile layout choice, published as an Artifact (below).

**In flight / open:**
- PR #44 needs Joseph's review. The preview shares the live database, which
  already has every function this uses, so Delete sleep and restore work there.
- Device checks (not possible from Claude Code): Jen's iPad home-screen app;
  an Android phone with a running sleep (the pill ticking, the tile's "ago"
  moving); two devices for realtime (a delete on one should clear the other in
  a couple of seconds). Realtime delivery was not exercised, only the poll.
- **Waiting on Joseph:** he is testing the preview and will say when to merge.
  PR #44 was built before the new release rule, so it still carries the release
  commit (version bump, CHANGELOG section, eight-page guide, notes PDF). If his
  testing changes the UI, redo what it touches: the affected guide images, the
  notes screenshots, both PDFs and the Linear attachments.
- **Log tile layout is his call** (he wants to see it): two by two from 640 px
  (in the PR), four across, three across with Last sleep full width below, or
  two by two then four across from 1024 px. Real screenshots of each at 640, 768
  and 1024 px, in three tile states, are on an Artifact page
  (https://claude.ai/artifact/Fw6CtTGTwFmZ1Yxru5Yvsh). Four across wraps the
  pill to two or three lines and wraps text in the older tiles; two by two costs
  about 110 px of height (142 px on iPad landscape). If he picks another one it
  is the grid classes in `glance-cards.tsx` (`sm:grid-cols-2`, plus a
  `col-span` for the full-width tile); the phone images in the guide and notes
  do not change.
- [JOS-66](https://linear.app/josephemmi/issue/JOS-66) is still In Progress
  (the three-tier structure, type/radius/motion tokens). The sleep contrast pairs
  live in `src/lib/sleep-contrast.test.ts` until
  [JOS-69](https://linear.app/josephemmi/issue/JOS-69) lands. Night mode
  (JOS-77) needs dark values for `night`, `night-soft`, `danger`, `stop`.
- [JOS-57](https://linear.app/josephemmi/issue/JOS-57): the harness was rebuilt
  a third time (now also the guide and release-note shots); its scripts still
  live only in a session scratchpad.

**Worth knowing:**
- Judgement calls flagged on the PR: the Log tiles go two by two from 640 px
  because four across leave the pill too narrow; the running card's "Started"
  line is ink, not grey (grey on the tint is 4.29:1); the tile reads the same
  72 h window as its siblings; the engine's `reopen` and the app's `canReopen`
  differ by 1 ms at the 3 h edge and the app's wins.
- The Today card recomputes every second while a sleep is open, so it is given
  only the last 14 days plus the sleep before them (`recentForToday`, with an
  equivalence test against the full history).
- `useServerNow` now also redraws the moment the server's clock turns out to
  differ from the device's by a second or more (it used to wait for the next
  tick, up to 30 s on an idle screen).
- A randomized comparison against a reference engine misses boundary mutants
  unless its inputs sit on a coarse grid (5 minutes here); the explicit
  boundary tests are what kill them.
- The worker restarted twice mid-session (06:04 and 06:38 UTC) and each time the
  harness delivered the first prompt again, word for word: the transcript entry
  is a `queued_command` with the first message's `source_uuid` and a new
  `delivery_id`. It is a replay, not Joseph writing again; nothing was lost or
  duplicated (one PR, one comment per ticket). Check `git log`, the PR and the
  ticket before acting on a repeat (CLAUDE.md has the note).

---

## 2026-10-19, later (v1.13.1 release)

**Done:**
- Docs PR #41 merged (retro notes and log; production redeployed READY).
- **v1.13.1 cut** (patch, confirmed with Joseph): `[Unreleased]` moved into
  `1.13.1` with the Pee/Bottle swap added to the entry, `package.json` and lock
  bumped, `NestlogReleaseNotesv1.13.1.pdf` (one page, two card shots) and the
  refreshed `NestlogSleepTrackerUserGuidev1.13.1.pdf` sent in chat and attached
  to JOS-66 with the notes as a comment. The guide needed one new screenshot
  (12, the Delete button, now the `danger` rose); the other 17 show nothing that
  changed colour. [PR #42](https://github.com/josephemmi/baby-tracker-app/pull/42)
  is open; **merging it is the release.**

**In flight / open:**
- JOS-66 is still In Progress (remaining token work, see the entry below). The
  release PR's branch, title and body leave the ticket id out on purpose so
  Linear does not close it on merge.
- JOS-79, JOS-80 still in the backlog.

**Worth knowing:**
- Release shots came from a temporary dev-preview route on the real tile
  components (removed before commit); the harness is still not committed (JOS-57).

---

## 2026-10-19 (JOS-66 colour half, JOS-79, JOS-80, JOS-82)

**Done:**
- [JOS-66](https://linear.app/josephemmi/issue/JOS-66) (In Progress, half
  shipped): category colours follow what they stand for (decisions D4 and D9
  in plan §11). A `cat-*` token block in `globals.css` (solid, soft and ink for
  Pee yellow `#ad8a0e`, Poo brown `#8a5a3c`, Bottle blue `#3f7391`, Breast teal
  `#2f8a85`, Pump violet `#6a54a3`; Sleep stays `night`), plus `danger`
  `#9a516b` (Delete button) and `stop` `#8b4a63` (Stop sleep, Discard, the
  pause Remove button). Tiles, ticks and tile labels use the ink, borders and
  chart bars the solid. 12 files: Log, breast timer, Pump pill, mL focus rings,
  Recently Deleted, Reports. [PR #39](https://github.com/josephemmi/baby-tracker-app/pull/39)
  was reviewed by Joseph on the Vercel preview on his phone ("looks good") and
  merged; production deployed. Checked by eye with a temporary dev-preview route
  on the real components (removed before commit), not against live data.
- Production had moved under the PR (PR #40, v1.13.0). Merged production into
  the branch, kept both CHANGELOG entries, and moved the new pause Remove
  button from `rose-dark` to `stop` (same hex). 225 tests pass under `TZ=UTC`.
- Filed [JOS-79](https://linear.app/josephemmi/issue/JOS-79) (Bug): two
  `partitionHomeMoments` tests fail whenever the machine isn't on UTC (fails
  the same on production). [JOS-80](https://linear.app/josephemmi/issue/JOS-80)
  (Polish): the delete-X icons still hover in terracotta, and the sleep time
  picker's amber warning text is 2.7:1.
- `retro`: [JOS-82](https://linear.app/josephemmi/issue/JOS-82) (Process, In
  Review): CLAUDE.md notes on `gh pr create` not working here, the REST
  replacement, and Linear closing a ticket on a partial PR. Docs only.

**In flight / open:**
- JOS-66 is **not finished**: the three-tier raw/semantic structure, `ink-faint`
  and `control-border`, the radius, type, z-index and motion tokens (the type
  remap is a visible change that needs a screenshot diff), and deleting the dead
  `--radius`. Linear closed it on merge; it was moved back to In Progress.
- Pre-existing raw colour names remain on purpose: terracotta (errors, person
  colour 2), brand-blue (person colour 3), amber (Paused dot, brand mark, the
  warn text in the sleep time picker), sage.
- The Left/Right bars in Reports are two teals (`cat-breast` and its ink), a
  colour difference of about 9 even for colour-blind eyes.
- Night mode (JOS-77) will need dark values for the `cat-*` block, `danger` and
  `stop`.

**Worth knowing:**
- The Pee and Bottle colours swapped (blue was Pee, amber was Bottle), so
  existing users will notice; mention it in the next release notes. This PR
  added an `[Unreleased]` CHANGELOG entry but nothing is released yet.
- A branch or PR title carrying a ticket id links that ticket in Linear and
  can close it on merge (see CLAUDE.md).

---

## 2026-10-18/19 (JOS-78, v1.13.0)

**Done:**
- [JOS-78](https://linear.app/josephemmi/issue/JOS-78) (Feature, In Review):
  the Sleep card shows each pause and lets a mistaken one be removed, built
  from the Drive v1.13 spec, prototype and tested SQL draft.
  [PR #40](https://github.com/josephemmi/baby-tracker-app/pull/40) is open,
  not merged. The finished card has `9:00 pm to 8:34 am` centred on its own
  line with a `2 pauses` button below it; running and paused cards get the
  same button; tapping the summary box or the button opens an inline list
  (header total, one row per pause, nothing under the rows; the pause in
  progress shows on a paused card with no Remove). Remove only while the sleep
  is running, paused or reopened, through the new `remove_sleep_pause`
  (`20261018000000_sleep_remove_pause.sql`); finished cards stay read-only
  (no exception to JOS-56) and say "To remove a pause, tap Reopen sleep
  first", or just the "can't be reopened" line. Reuses `ConfirmDeleteModal`.
  `removePause` in `sleep.ts` mirrors the SQL (stale error on a finished
  sleep, new `no-pause` code); scenario 17 is in `supabase/tests/sleeps.sql`.
  225 unit tests (194 before), 111 browser checks on the scratch-Postgres
  harness, nine SQL and nine TS mutations each turned the tests red.
- The migration was **applied to the live Supabase project** this session with
  Joseph's go-ahead (recorded as `20261019000456_sleep_remove_pause`; verified
  read-only: security definer, `search_path=public`, anon can't execute).
- **v1.13.0 cut** (version given in the brief): CHANGELOG entry, version bump,
  `NestlogReleaseNotesv1.13.0.pdf` (one page, two shots) and the refreshed
  `NestlogSleepTrackerUserGuidev1.13.0.pdf` (still six pages: 04, 05, 06, 14
  reshot, new 18, page 2 legend, page 4 block) sent in chat and attached to
  JOS-78. **Merging PR #40 is the release.**
- `retro`: [JOS-81](https://linear.app/josephemmi/issue/JOS-81) (Process, In
  Review): CLAUDE.md notes on the harness traps, merging a standalone SQL
  scenario, getting Drive files onto disk, PDF glyphs and the guide's refresh
  scope. Docs only, a separate commit on PR #40.

**In flight / open:**
- PR #40 needs Joseph's review; the preview shares the live database, which
  now has the function, so Remove works there.
- Device checks (can't be done from Claude Code): Android Chrome (about 364 px
  wide), Jen's iPad home-screen app, two devices for realtime (a removal on one
  should show on the other within a couple of seconds). Realtime delivery
  itself was not exercised, only the poll/refetch path.
- [JOS-58](https://linear.app/josephemmi/issue/JOS-58) (notifications) is next;
  [JOS-57](https://linear.app/josephemmi/issue/JOS-57) (commit the harness) is
  still open and the harness (`h/lib.mjs`, `night.mjs`, `more.mjs`,
  `shots.mjs`, the dev-preview route) still lives only in a session scratchpad.

**Worth knowing:**
- Judgement calls flagged on the PR: a paused card whose only pause is the one
  in progress has no button yet (the prototype counts finished pauses only);
  the running box has no hover tint (its secondary text is already 4.36:1 and
  the prototype's tint made it 4.05:1); lengths round down like the timer and a
  few seconds reads "under 1 min"; Remove is today's `rose-dark` until JOS-66.
- A pause noticed after the 3 h Reopen window can't be removed (known
  consequence of the brief; parked as a follow-up if it bites).
- Two tool facts: Drive's `download_file_content` is base64 you re-type (see
  CLAUDE.md), and the Linear MCP renders ticket links in descriptions as
  `<issue>` tags, which is harmless.

---

## 2026-10-17, later (JOS-56 review round and merge, JOS-58, JOS-59)

**Done:**
- [JOS-56](https://linear.app/josephemmi/issue/JOS-56) (Done): Joseph
  used the Sleep tracker on his phone and sent a round of feedback, each
  point agreed against an interactive prototype (a private artifact)
  before any code. Built in commit `93fc274`: the status label is 15 px
  (matching the card's own time) with an 11 px dot, the *word* centred on
  the card's centre line and the dot hanging left; start time centred
  under the timer with "Started earlier?" on its own line; Stop Sleep in
  the app's dark rose; the picker has no Save step (the wheel's **Set**,
  or tapping the highlighted row, saves and closes; Pick a time saves
  0.4 s after the phone's picker returns; only a time over 3 h ago asks
  "Save anyway"; the other row tucks away while the wheel is open); a
  running or reopened sleep is no longer pinned to the top (`filedAt` in
  `sleep.ts`: filed under Today, ordered by its start), so Reopen leaves
  the card where it was; a finished card with no Reopen button says why
  ("This sleep can't be reopened: …"). 51 new browser checks on the
  scratch-Postgres harness plus the older suites updated where the design
  changed on purpose; 194 unit tests. [PR #37](https://github.com/josephemmi/baby-tracker-app/pull/37)
  was merged with Joseph's go-ahead (merge commit `6ad4436`); production
  deployed READY. Linear moved JOS-56 to Done by itself on merge, ahead of
  the release steps.
- [JOS-58](https://linear.app/josephemmi/issue/JOS-58) (Feature, Needs
  Scoping, High, Backlog): a standard notification system to replace the
  ad-hoc bottom toast. Joseph's notes: the states should be fairly
  consistent, maybe identical, and he'd rather have a centred pop-up like
  the Discard-sleep dialog than a pill. His next backlog item after
  JOS-56.
- [JOS-59](https://linear.app/josephemmi/issue/JOS-59) (Process, In
  Review): every feature release now gets a short visual user guide.
  `scripts/generate-user-guide.py` + `docs/user-guides/<feature>/`
  (`guide.json` and annotated screenshots); the first one, the Sleep
  tracker (6 pages, A4), was sent to Joseph in chat.
  [PR #38](https://github.com/josephemmi/baby-tracker-app/pull/38) is
  open, not merged; it also carries the CLAUDE.md "User guides" rule and
  this retro's notes.
- **v1.12.0 cut** (minor, confirmed by Joseph): `[Unreleased]` moved into
  a dated `1.12.0` section (the Sleep tracker, plus the iPad numeric-keypad
  fix from JOS-54, which had been waiting in `[Unreleased]`),
  `package.json`/`package-lock.json` bumped, and
  `NestlogReleaseNotesv1.12.0.pdf` and
  `NestlogSleepTrackerUserGuidev1.12.0.pdf` sent to
  Joseph in chat and attached to JOS-56 and JOS-54 (release notes as a
  comment on each). Because the harness confines this session to one
  branch, the release rides on PR #38 with the user guide; **merging
  PR #38 is the release**.
- **Release notes redone twice after Joseph's feedback.** First round:
  "no screenshots" (they were buried on page two). Second round: "check
  the last three releases and use the structure that has been used
  before". I had built a three-page PDF with a "What it looks like" grid
  up front, captions and a seven-bullet Sleep entry; the earlier ones
  (v1.11.0 to v1.11.2, read from the Drive "Release Notes" folder) are one
  Letter page with one plain paragraph per CHANGELOG entry and the
  screenshots after the bullets. So the 1.12.0 CHANGELOG entries were
  condensed to that form (the detail that was cut lives in PR #37, this
  log and the user guide), the generator puts screenshots after the
  bullets again (one row of three, no heading or captions), and CLAUDE.md
  now says to read the previous releases' PDFs before cutting one. The
  PDF is one page with the three screenshots on it.

**In flight / open:**
- PR #38 needs Joseph's review (docs, tooling and the release bookkeeping;
  no app code, so no preview). Merging it deploys nothing new: the Sleep
  tracker code has been live since PR #37.
- Device checks still outstanding: on Jen's iPad, whether Pick a time
  saves mid-scroll (iOS may report every step; the fallback is a Save
  button on that route only); on his phone, Set / tap-to-set and Pick a
  time; two devices and realtime.
- [JOS-58](https://linear.app/josephemmi/issue/JOS-58) is next in the
  backlog.

**Worth knowing:**
- Joseph's choice of wording for the "can't be reopened" line named only
  the 3-hour case; the other two reasons (a new sleep has started; closed
  itself after 3 hours paused) use the same pattern by my reading.
- The user-guide screenshots come from a scripted story, but the capture
  script and the harness still live only in a session scratchpad
  ([JOS-57](https://linear.app/josephemmi/issue/JOS-57) now covers
  committing both, with a one-command start). The scratch Postgres is not
  running after a session resumes; CLAUDE.md has the restart recipe.
- The Next.js dev overlay badge ("1 Issue") shows under the fake clock and
  intercepts hit-tests near the bottom-left of the viewport; hide
  `nextjs-portal` before shooting or hit-testing.
- The preview alias for a branch isn't in `list_deployments`; use
  `list_deployment_aliases` (CLAUDE.md updated).

---

## 2026-10-17 (JOS-56/JOS-57)

**Done:**
- [JOS-56](https://linear.app/josephemmi/issue/JOS-56) (In Review): the
  Sleep tracker — the headline feature of v1.12. Sleep is the fifth tile
  on the Log screen; ticking it starts a shared, timed sleep card (big
  `01 h 35 m` timer, Pause / Stop, "Started earlier?" subcard with a
  how-long-ago wheel and a full-row time input, under-a-minute Stop
  dialog, read-only finished card with Reopen, soft delete into Recently
  Deleted). [PR #37](https://github.com/josephemmi/baby-tracker-app/pull/37)
  is open, not merged. Built from the Drive spec + prototype
  (Docs → v1.12). Decisions worth knowing: stretches are a **jsonb array**
  on a new `sleeps` row (one conditional `where rev = …` update = first
  write wins; one realtime event carries the whole sleep); every write is a
  security-definer function using the **server clock**, and the client
  corrects its own clock against it on every reply, so a phone with the
  wrong time can't skew the timer; members may edit only `notes` and
  `logged_by` on the table directly (neither bumps `rev`); finished
  sleeps are filed under the day they **ended**, so an overnight sleep
  stays on Home; deleting an open sleep closes it as it goes so a
  restore is always a plain finished sleep. Engine rules ported to
  `src/lib/sleep.ts` (+ `sleep-format.ts`, `sleep-api.ts`), 190 unit
  tests; SQL scenarios in `supabase/tests/sleeps.sql`.
- Migrations `20261017000000_sleeps` and `20261017000001_sleep_helpers_search_path`
  were **applied to the live Supabase project** this session with Joseph's
  go-ahead (verified read-only: RLS, policies, realtime publication,
  grants, advisors).
- Verified end to end with a scratch Postgres + Playwright answering the
  app's Supabase calls by running the real SQL functions: 218 browser
  checks. It found a real bug the SQL tests missed (a plpgsql trigger
  privilege failure hidden by plan caching) — now a CLAUDE.md gotcha along
  with the migration-apply workflow and the harness recipe.
- `retro` filed [JOS-57](https://linear.app/josephemmi/issue/JOS-57)
  (Process, Backlog): commit that harness as reusable tooling (it only
  lives in a session scratchpad today). The CLAUDE.md notes ride on PR #37
  as a docs-only commit because the harness confines the session to one
  branch.

**In flight / open:**
- PR #37 needs Joseph's review and real-device checks (can't be done from
  Claude Code): Android Chrome and Jen's iPad home-screen app (the whole
  "Pick a time" row opens the picker; wheel feel; the dialog), and two
  devices (start on one and see it on the other, both tapping Stop at once,
  a phone locked for a long time) — **especially that realtime delivers
  within a second or two**; only the poll/refetch path was exercised here.
- Not released: `CHANGELOG.md` has the entry under `[Unreleased]` and
  `package.json` is still 1.11.2. Cutting 1.12 (version confirm,
  release-notes PDF with tight screenshots, attach to JOS-56) is the next
  release step once Joseph is happy.
- Sleeps don't appear in Timeline, Reports or day summaries yet (spec open
  question 3 — needs its own prototype and ticket); Recently Deleted does
  list and restore them.

**Worth knowing:**
- The 43 engine checks the spec mentions weren't in the Drive folder (only
  the spec and the prototype were), so the unit tests were written from the
  spec's description of them.
- Judgement calls flagged in the PR for Joseph to overturn if he disagrees:
  Discard colour follows the prototype's rose-dark, not the spec's hex;
  the iPad layout (sleep cards stacked above the table, Sleep column) is
  mine since the prototype is phone-only; the TS write functions in
  `sleep.ts` mirror the SQL but the screens don't call them, so a rule
  change touches the TS, the SQL and both test files.
- The live `entries` count moved while this session ran (2378 → 2379):
  that was the household logging, not a migration side effect.

---

## 2026-09-15/16 (JOS-54/JOS-55)

**Done:**
- [JOS-54](https://linear.app/josephemmi/issue/JOS-54) (Done): JOS-9's
  numeric-keypad fix (`type="text"` + `inputMode="numeric"` +
  `pattern="[0-9]*"`) was verified on Android but iPad confirmation had
  been left outstanding; Joseph then tested it on Jen's iPad specifically
  as an *installed home-screen PWA* (not just a Safari tab) and found it
  still brought up the full keyboard for both the Pump mL field and the
  Bottle mL field when logging a feed. Researched (this environment can't
  run a real iPad to reproduce) and found `inputMode` is documented as
  unreliable specifically inside iOS's installed-PWA runtime, which runs
  on a different WebKit host process than a regular Safari tab.
  `type="text"` gives WebKit nothing to fall back on when `inputMode` is
  ignored. Fixed by switching all 4 mL input call sites (bottle/pump ×
  `EntryCard`/`EntryTableRow`) to `type="tel"`, kept alongside the
  existing `inputMode="numeric"`/`pattern="[0-9]*"` — `type="tel"` has
  driven iOS's keyboard selection since long before `inputMode` existed
  and doesn't depend on the installed-PWA runtime's `inputMode` handling;
  the tel keypad's extra `*`/`#` keys are stripped by the existing
  `sanitizeDigits()`. Filed as its own ticket rather than reopening JOS-9
  (Done, already released in v1.11.2), matching the JOS-44/JOS-45
  precedent. Joseph explicitly approved merging without a device-verified
  diff, since this environment has no way to preview on a real iPad; left
  a comment on the ticket flagging that device confirmation is still
  outstanding and that a "doesn't work" report should reopen this ticket
  rather than start a new one. [PR #34](https://github.com/josephemmi/baby-tracker-app/pull/34)
  merged to production.
- [JOS-55](https://linear.app/josephemmi/issue/JOS-55) (Process, In
  Review — retro finding, fixed same session): every web session starts
  from a fresh container with no `node_modules`, so the first
  `npm run lint`/`test`/`build` of any session failed immediately
  (`ERR_MODULE_NOT_FOUND: eslint`) until dependencies were installed —
  an undocumented step every session would otherwise independently
  rediscover. The existing `.claude/hooks/session-start.sh` SessionStart
  hook already ran automatically but only set git identity; added
  `npm install` to it (still gated behind the existing
  `CLAUDE_CODE_REMOTE` check), using `install` rather than `ci` so a
  container with a cached `node_modules` from a prior session can reuse
  it. Validated by wiping `node_modules` and running the hook directly,
  then confirming lint/test both worked immediately after with no manual
  step. [PR #35](https://github.com/josephemmi/baby-tracker-app/pull/35)
  merged to production — future sessions pick up the updated hook
  automatically.

**Worth knowing:**
- JOS-54's fix is unverified on a real device — watch for Joseph's
  follow-up report on whether the iPad PWA now shows the numeric keypad.
- This session confirmed a fresh Claude Code web session's container has
  no pre-installed `node_modules` at all (not just possibly-stale ones)
  — worth knowing if a future session sees the same
  `ERR_MODULE_NOT_FOUND` symptom for a different missing package before
  JOS-55's hook fix has had a chance to run (e.g. a very first session on
  a container image predating this change, or if the hook itself ever
  fails partway through).

---

## 2026-09-15 (JOS-5/JOS-9/JOS-52/JOS-53)

**Done:**
- [JOS-5](https://linear.app/josephemmi/issue/JOS-5) (Canceled):
  investigated the reported X/delete icon on the user chip's avatar —
  current code has no such icon on either `EntryCard`'s or
  `EntryTableRow`'s logged-by chip, just an avatar+name button that
  cycles the logged-by member; the only delete affordance is a separate
  top-right X on the card itself. Git history doesn't show a commit
  removing it — the chip code traces back to this repo's earliest
  (squashed) commit, predating the ticket's own screenshot date, so
  whatever fixed it happened before this repo's tracked history began.
  Closed as Canceled (not Done, since no fix was made under this ticket)
  with the investigation trail as a comment.
- [JOS-9](https://linear.app/josephemmi/issue/JOS-9) (Done): the
  bottle/pump mL amount fields (4 call sites: bottle/pump ×
  `EntryCard`/`EntryTableRow`) used `type="number"` with no `inputMode`,
  which doesn't reliably force a numeric keypad on mobile. Switched to
  `type="text"` + `inputMode="numeric"` + `pattern="[0-9]*"`, stripping
  non-digit characters (including decimal points — this is a whole-mL,
  no-decimal build) via a new `sanitizeDigits()` helper
  (`src/lib/numeric-input.ts`). Audited the rest of the app — these 4
  fields are the only number-only inputs. Verified via a temporary
  dev-preview + Playwright pass (attributes + sanitization behavior);
  Joseph confirmed on Android (numeric keypad, no decimals) — iPad still
  untested but not blocking. [PR #29](https://github.com/josephemmi/baby-tracker-app/pull/29)
  merged.
- [JOS-52](https://linear.app/josephemmi/issue/JOS-52) (Done): per
  Joseph's request, documented in `CLAUDE.md` that PRs handed to him for
  review should include the actual Vercel preview link — but only when
  there's an app UI/behavior change to actually look at; a docs-only PR
  has nothing for him to do with one. First draft of the rule missed
  that exception and needed a follow-up commit once he pointed it out.
  [PR #30](https://github.com/josephemmi/baby-tracker-app/pull/30) and
  the follow-up fix both merged.
- Cut **v1.11.2** (patch — fix only, confirmed with Joseph): moved
  `[Unreleased]` into a dated section, bumped `package.json`/
  `package-lock.json`, generated the release-notes PDF (no screenshot —
  no visible UI change, just OS keyboard behavior), sent it via chat,
  attached it to JOS-9 and posted the release notes as a comment there.
  [PR #31](https://github.com/josephemmi/baby-tracker-app/pull/31)
  merged.
- `retro`: two findings, both fixed as `CLAUDE.md` notes plus one
  directly-requested convention change, all in
  [JOS-53](https://linear.app/josephemmi/issue/JOS-53) /
  [PR #32](https://github.com/josephemmi/baby-tracker-app/pull/32):
  (1) a new standing rule (the JOS-52 preview-link one) shipped without
  thinking through an obvious edge case first — added a general
  instruction to consider edge cases before committing a new "always X"
  rule to this file. (2) the `type="text"` + `inputMode="numeric"` +
  `pattern="[0-9]*"` pattern for digits-only mobile fields (over
  `type="number"`, which doesn't reliably force a numeric keypad and
  still allows `.`/`-`/`+`/`e`) wasn't documented anywhere — added as a
  gotcha, alongside a note that this environment can't verify the real
  on-device keypad, only that the attributes are correct. Also renamed
  the release-notes PDF convention to `NestlogReleaseNotesv{version}.pdf`
  (no hyphens) and fixed a stale line in
  `scripts/generate-release-notes.py`'s docstring that contradicted
  `CLAUDE.md`'s "don't upload to Drive" rule.

**Worth knowing:**
- JOS-9's iPad/iOS confirmation is still outstanding — not blocking,
  but worth a quick check next time Joseph has the iPad in hand.
- The release-notes filename convention changed this session
  (`NestlogReleaseNotesv{version}.pdf`, no hyphens) — past PDFs
  referenced elsewhere in this log used the old hyphenated form; that's
  accurate history, not a mistake to fix retroactively.

---

## 2026-09-13 (JOS-41)

**Done:**
- [JOS-41](https://linear.app/josephemmi/issue/JOS-41) (Done): fixed the
  "Log a moment" button intermittently resizing — the button and its
  error `<p>` shared one flex row with no width limit on the error text,
  so any non-trivial error string forced the row to wrap and squeezed the
  button. Moved the error text out of that row entirely (own line below,
  `truncate`d as a second line of defense) and gave the button `shrink-0`
  so nothing in that row can resize it again. Verified with a temporary
  dev-preview route + Playwright: button bounding box identical
  (148.7×37.75px) with a long error shown vs. hidden.
  Also shipped diagnostics-only logging (explicitly not a fix) to every
  mutation's catch path in `log-matrix.tsx` and to `refetch()` — which
  handler failed, `navigator.onLine`, a timestamp — since the ticket's
  actual root cause (an intermittent `TypeError: Failed to fetch`) is
  still unconfirmed; `refetch()` was also fixed to actually read the
  `error` field off both its queries, which it had silently dropped
  entirely. [PR #26](https://github.com/josephemmi/baby-tracker-app/pull/26)
  merged to production.
- Cut **v1.11.1** (patch — fix only, confirmed with Joseph): moved
  `[Unreleased]` into a dated section, bumped `package.json`/
  `package-lock.json`, generated `Nestlog-Release-Notes-v1.11.1.pdf`
  with a tight, element-scoped screenshot matching Home's real
  container padding, sent it via chat, attached it to JOS-41 and posted
  the release notes as a comment there (ticket had already
  auto-transitioned to Done via the Linear↔GitHub merge integration
  before the comment landed — attach-then-comment-then-Done wasn't
  achievable in that order this time since Done happened automatically
  on merge, not manually). [PR #27](https://github.com/josephemmi/baby-tracker-app/pull/27)
  merged.
- `retro`: two findings, both fixed as CLAUDE.md notes (docs-only,
  Joseph approved): (1) a session this run paused before opening PR #26
  despite `CLAUDE.md` already mandating a PR on every branch, treating a
  generic "don't create PRs unless asked" default as still blocking —
  cost a round of clarification. Added an explicit line stating the
  existing "every branch gets a PR" rule **is** the standing ask, so
  future sessions don't re-litigate it. (2) building the v1.11.1
  release screenshot, a dev-preview page crashed with `Event handlers
  cannot be passed to Client Component props` from a stray no-op
  `onClick` on a page with no `"use client"` — added a note to the
  dev-preview gotchas list to just drop unneeded handlers on
  screenshot-only preview pages.

**Worth knowing:**
- Confirmed directly via Vercel (`list_deployments`, filtering
  `target: "production"`) that only pushes/merges into
  `claude/baby-tracker-nextjs-setup-9gocr2` ever deploy to production —
  a feature-branch push (this session's `claude/jos-41-...` branch)
  produces a preview deployment (`target: null`) only. Useful concrete
  confirmation of the workflow `CLAUDE.md` already describes, for
  anyone who wants to double-check it themselves.
- Linear's GitHub integration auto-transitions a linked issue to Done
  on PR merge — faster than the manual "attach PDF, comment, then move
  to Done" release-process order `CLAUDE.md` describes. Not a problem
  so far (comment/attachment still happened, just after the automatic
  Done rather than before), but worth knowing the automation can
  outrun the documented manual sequence.

---

## 2026-09-08/09 (JOS-48/JOS-49)

**Done:**
- [JOS-48](https://linear.app/josephemmi/issue/JOS-48) (Done): built the
  mL explicit Save (checkmark) button — fades in next to the bottle/pump
  mL fields while editing (replacing the "ml" label), tapping it commits
  the value via the existing `flush()`/`onBlur` path, blurs the input to
  close the keyboard, and flashes the row to confirm. Reverted the JOS-47
  debounce autosave from 3.5s back to 600ms alongside it, since the
  checkmark is now the real save-and-close action and the debounce lost
  its only UI-visible role. New `src/lib/save-pulse.ts` factors out the
  "flip true, auto-reset after N ms" state shared by the four save
  confirmations. Applied to all four call sites (bottle/pump ×
  `EntryCard`/`EntryTableRow`). Two device-tested follow-up fixes landed
  on the same PR after Joseph's screenshots caught real bugs: (1) the
  checkmark's fade-out relied on CSS `:focus-within` on the row, but
  tapping the checkmark moves focus onto the button itself inside that
  same row, keeping `:focus-within` true forever and leaving the
  checkmark stuck visible — fixed by tracking each field's editing state
  explicitly via the input's own `onFocus`/`onBlur` instead; (2) the
  checkmark's wrapper div kept reserving its full 26px/22px width even
  after fading to invisible (opacity/transform don't remove layout
  footprint), leaving a dead gap between "ml" and "Saved" — fixed by
  animating the wrapper's width to 0 alongside the opacity/scale fade.
  [PR #21](https://github.com/josephemmi/baby-tracker-app/pull/21)
  merged to production.
- Cut **v1.11.0** (minor — confirmed with Joseph, new capability not
  just a fix): moved `[Unreleased]` into a dated section, bumped
  `package.json`/`package-lock.json`, generated
  `Nestlog-Release-Notes-v1.11.0.pdf` with a tight, element-scoped
  screenshot of the checkmark button, sent it via chat, attached it to
  JOS-48 and posted the release notes as a comment there before moving
  it to Done. [PR #22](https://github.com/josephemmi/baby-tracker-app/pull/22)
  merged.
- Investigated a residual cosmetic nit Joseph found on-device after
  PR #21: the "Saved" confirmation text sat closer to the field's right
  edge than "ML" sits to the left. First analysis pass was wrong — I
  measured the row in a headless Playwright container that was
  (unnoticed) shrink-wrapping to content instead of holding a fixed
  width, which makes any edge-padding measurement come back
  tautologically symmetric regardless of the real code. Called it
  "perceptual" on that basis, which was a mistake. Went back and
  pixel-measured Joseph's actual screenshot directly (border-color pixel
  scanning) and found a real ~3:1 gap ratio. Shipped a `pr-3` fix on the
  "Saved" span sized to match the row's own edge padding, but Joseph
  reported no visible change after reloading — unresolved whether that
  was deploy/cache lag or a genuine miss. Also confirmed, concretely,
  that a Claude Code cloud session cannot reach either the Supabase Auth
  REST API or the deployed Vercel app's own domain directly (both
  `403` at the network-proxy level, org egress policy) — ruling out
  "just log in with Playwright and check the real page" as an approach
  from this kind of session, not just from missing RLS/auth as
  previously documented. Rather than keep burning cycles on a few-pixel
  cosmetic gap with no way to verify against Joseph's actual device,
  agreed with him to stop and file it as its own ticket,
  [JOS-49](https://linear.app/josephemmi/issue/JOS-49) (Polish, Needs
  Scoping), with the full investigation trail, what's already been
  tried, and ranked next steps for whoever picks it up next.

**In flight / open:**
- [JOS-49](https://linear.app/josephemmi/issue/JOS-49) (Backlog, Needs
  Scoping): the "Saved" text padding asymmetry. Deliberately not
  actioned further — see the ticket for the full trail before touching
  it again. Cheapest next step is just asking Joseph to hard-refresh
  the same preview link and send a fresh screenshot to see if anything
  actually changed from the `pr-3` fix already shipped.

**Worth knowing:**
- The "no live Supabase session" limitation in this file's gotchas
  section is actually a stricter, hard network-level block, not just an
  RLS/auth issue: this session confirmed via `curl` and the proxy's own
  diagnostics that outbound requests to both `*.supabase.co` (the
  specific project's Auth REST API) and the deployed Vercel app's own
  domain get rejected with 403 at the sandbox's egress proxy. The
  Supabase MCP connector still works for direct DB access (separate,
  pre-authorized channel) but cannot be used to establish a browser
  session against the live site. Don't attempt "create a test user,
  log in via Playwright against the deployed URL" again expecting a
  different result.
- When measuring real layout/padding with a headless Playwright
  harness, make sure the outer wrapper has a genuinely fixed width
  (e.g. `style={{ width: 393 }}`), not just a `maxWidth` — a `maxWidth`
  + `margin: auto` wrapper can still end up shrink-wrapping to its
  content if something in the ancestor chain doesn't hand it a definite
  width to fill, which makes any "gap to container edge" measurement
  meaningless (it'll always look symmetric by construction). Cost real
  time and one wrong conclusion this session.

---

## 2026-09-07 (JOS-47)

**Done:**
- [JOS-47](https://linear.app/josephemmi/issue/JOS-47) (High, In Progress):
  investigated and fixed the mobile mL-input focus-loss bug — typing a
  multi-digit amount (e.g. "150") and pausing partway would silently
  close the on-screen keyboard on Android/iOS Chrome after "15". Ruled
  out the leading suspect (`blurActiveElement()`/`visibilitychange` in
  `log-matrix.tsx`, added for the iOS date-picker bug) by tracing its two
  actual trigger points, neither of which fires mid-type while
  foregrounded. Root cause: the bottle/pump mL `<input>`s are
  uncontrolled and were keyed on `` `${moment.key}-${amount_ml}` `` so an
  *external* amount change would force a remount and refresh the shown
  value — but JOS-42's debounced commit (added later) updates that same
  `amount_ml` ~600ms after the user pauses mid-typing, so the field's own
  commit remounted itself and stole focus. A regression introduced by
  JOS-42, latent until now since the old onBlur-only commit never fired
  while still focused. Reproduced and verified the fix with a Playwright
  harness against a temporary dev-preview route (mock `EntryCard` +
  mock commit handler mirroring `handleAmountCommit`'s state-update
  shape), toggling the change via `git stash` to confirm both the
  before (`document.activeElement !== input` after the pause, a
  subsequent keystroke silently lost) and after (focus retained, full
  value lands) states. Fixed by dropping `amount_ml` from the `key` and
  syncing external changes imperatively via a ref + effect that skips
  the write while the field is focused — applied to both mL fields in
  both `EntryCard` and `EntryTableRow` (four call sites, same flawed
  pattern in all of them). Posted the full investigation trail as a
  Linear comment per the ticket's own request. Joseph device-tested the
  fix directly and iterated on the debounce delay through four rounds
  (600ms → 2.5s → 3.5s → back to 2.5s → 3.5s again), each round pushed
  to its own branch and re-tested on his phone; fetched each branch's
  actual Vercel preview alias via `list_deployments` rather than
  guessing one. [PR #16](https://github.com/josephemmi/baby-tracker-app/pull/16)
  (remount fix + settle on 2.5s) and [PR #18](https://github.com/josephemmi/baby-tracker-app/pull/18)
  (final bump to 3.5s) both merged into the production branch
  (`claude/baby-tracker-nextjs-setup-9gocr2`); [PR #17](https://github.com/josephemmi/baby-tracker-app/pull/17)
  was the docs-only project-log update in between — merged separately
  and immediately rather than batched with the code PRs, on the general
  principle (asked about explicitly this session, answered inline) that
  small independent PRs with no CI gate should merge as soon as each is
  ready, not accumulate. Along the way, investigated Joseph's report
  that a *second* edit's keyboard window felt shorter than the first:
  confirmed `blurActiveElement()` (mount + genuine `visibilitychange`
  only, still the only `.blur()` call besides intentional Enter-to-blur
  handlers) can't explain it, and no viewport-resize/IME listener exists
  anywhere in the app — logged as likely Android's own on-screen-keyboard
  inactivity behavior, consistent with Jen's reports that iOS Safari and
  the iPad app were never affected. Final device test at 3.5s: "noticed
  a significant difference." Left the ticket In Progress rather than
  Done — a strong result but not quite the explicit "yes, fully fixed"
  JOS-42 got before closing.
- `retro`: two findings, both fixed as CLAUDE.md gotcha notes (docs-only,
  Joseph approved both): (1) deleting `.next` while `npm run dev` is
  still running corrupts Turbopack's persistent cache and crashes the
  server — cost three kill/restart cycles this session; now flagged
  alongside the existing dev-preview `.next` gotcha with "stop the
  server first." (2) the actual JOS-47 root-cause pattern itself
  (uncontrolled input keyed on a value + any commit path that can fire
  while focused) is a general trap worth flagging so it isn't rebuilt
  elsewhere — added as its own gotcha bullet.

**In flight / open:**
- JOS-47's fix (remount fix + 3.5s debounce) is merged and live; ticket
  itself needs an explicit final confirmation from Joseph before moving
  to Done, or a decision to close it as "good enough" given the residual
  symptom looks OS-level rather than app-level.

**Worth knowing:**
- If a future uncontrolled input needs to both (a) refresh from external
  data changes and (b) autosave/debounce-commit while still focused,
  don't key it on the value — see the new CLAUDE.md gotcha for the
  ref+effect pattern used here.

---

## 2026-09-02 (JOS-44/JOS-45)

**Done:**
- [JOS-44](https://linear.app/josephemmi/issue/JOS-44) (Medium, Done):
  replaced the native `window.confirm()` on delete-entry with a custom
  in-app modal (`src/components/ui/confirm-delete-modal.tsx`) — spec and
  reference prototype pulled from Drive. Title "Delete this moment?",
  unchanged body copy, rose (`#B15E7C`) Delete button per the prototype's
  decided direction over terracotta. Swapped into both the single quick
  delete and the multi-select bulk delete in `log-matrix.tsx`; left the
  unrelated breastfeeding-session-clear `confirm()` alone, out of scope.
  Merged via PR #8, confirmed working on a real device.
- [JOS-45](https://linear.app/josephemmi/issue/JOS-45) (Low, Done): found
  during JOS-44's device review — the modal's copy pointed to "Recently
  Deleted in Timeline," but Timeline's own banner never used that phrase
  (it said "N deleted entries · tap to restore"; "Recently Deleted" only
  existed on the destination screen's `<h1>`). Fixed the banner to lead
  with the section name: "Recently Deleted (N) · Tap to restore" (capital
  T, caught in the same device review). Filed as its own ticket and
  branched from production rather than folded into JOS-44's PR, since it
  touches a different component and was outside that ticket's stated
  scope. Merged via PR #9.
- Also merged PR #10 (CHANGELOG entries for both, docs-only).
- Session flagged one real process gap, documented inline in `CLAUDE.md`'s
  gotchas section rather than left implicit: a Vercel preview URL was
  guessed from another branch's alias pattern instead of fetched via
  `list_deployments`, and the guess was wrong — cost Joseph a 404 and a
  round trip. Always fetch the actual `branchAlias` before sharing a link.
  Filed as [JOS-46](https://linear.app/josephemmi/issue/JOS-46) (Low,
  Done) per the "every process fix gets a ticket" rule, closed
  immediately since the fix had already shipped.
- Cut **v1.10.0** (minor — confirmed with Joseph rather than assumed,
  since both entries are UI/UX changes, not bug fixes, and the spec doc's
  own Drive folder was already named "v1.10"): moved `[Unreleased]` into
  a dated section, bumped `package.json`/`package-lock.json`, generated
  `Nestlog-Release-Notes-v1.10.0.pdf`, attached it to both JOS-44 and
  JOS-45 and posted the release notes as a comment on each. Merged via
  PR #12.
- Joseph flagged three gaps in that first release-notes pass: the PDF
  needed screenshots (both JOS-44/JOS-45 are visible UI changes — the
  first PDF had none), he wants the PDF sent through chat every time (not
  just attached to Linear, so he can grab it himself and put it in
  Drive), and JOS-46 was sitting labelless since none of Bug/Feature/
  Polish actually described a fix to Claude's own process. Fixed all
  three: regenerated the PDF with tight, element-scoped screenshots of
  the modal and banner (two earlier attempts leaked the Next.js dev
  toolbar badge and a too-narrow test container that wrapped text
  differently than production — both caught and fixed before finalizing,
  by framing the shot to match the real page's actual container), sent
  it via `SendUserFile`, re-attached the corrected PDF to both tickets
  (replacing the screenshot-less one), and added a new **Process** Type
  label (workspace-level, alongside Bug/Feature/Polish) applied to JOS-46
  and retrofitted onto JOS-43. All three now standing rules in
  `CLAUDE.md`, not just one-off fixes. Merged via PR #14.

**Worth knowing:**
- Both delete-entry `window.confirm()` call sites are gone; a third,
  unrelated one remains intentionally (clearing an in-progress
  breastfeeding session on Breast-uncheck) — not a delete action, out of
  JOS-44's scope.
- Production branch is still `claude/baby-tracker-nextjs-setup-9gocr2`
  until JOS-43 lands.

---

## 2026-09-02

**Done:**
- [JOS-42](https://linear.app/josephemmi/issue/JOS-42) (Urgent, merged):
  bottle/pump mL amounts were silently not saving on Android Chrome — the
  inputs only committed on `blur`, and Android Chrome doesn't reliably
  fire `blur` when the on-screen keyboard is dismissed via its own
  control rather than by tapping another element. Fixed by committing on
  a short debounce as the user types, in addition to `onBlur`
  (`src/lib/debounced-commit.ts`), plus an Enter-to-blur fallback on the
  Time input (same class of bug, lower-severity failure mode — stuck
  open, not silent loss). Merged via PR #2.
- Added `.github/pull_request_template.md` and a "Git & deploy workflow"
  section in `CLAUDE.md` — this repo's branch → PR → review → merge →
  auto-deploy flow, and the fact there's no CI, had never been written
  down before this. Merged via PR #3.
- Created the `retro` skill (personal, works across projects, not just
  this repo) — an end-of-work retrospective that surfaces process/tooling
  friction and maintains this log. Also set up a global Stop hook
  (`~/.claude/hooks/retro-reminder.sh`) as a throttled nudge to actually
  run it, since a skill's own proactive-trigger description alone felt
  too easy to forget.
- First real run of `retro` (this entry) surfaced one gap: the dev-preview
  verification workflow (`CLAUDE.md`'s "No live Supabase session" section)
  doesn't mention that even a route with zero real Supabase calls needs
  dummy `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` values in `.env.local` just
  to get `npm run dev` past the proxy middleware, that ad-hoc Playwright
  scripts (outside `npm test`) need an absolute import path since
  `playwright` isn't a project dependency, or that deleting a dev-preview
  route can leave a stale `.next` cache reference that looks like a false
  typecheck failure. Documented inline in that section.
- Cut **v1.9.1** (patch — JOS-42 was the only entry, fix-only, no new
  functionality): moved `[Unreleased]` into a dated section, bumped
  `package.json`, generated `Nestlog-Release-Notes-v1.9.1.pdf`, attached
  it to JOS-42 and posted the release notes as a comment there (left the
  ticket open rather than moving to Done — see below). Merged via PR #5.
  Second `retro` run of the session, right after the release: nothing new
  to flag — the release process was already fully documented from a
  prior session and the Linear attachment flow worked cleanly first try.
- JOS-42 confirmed fixed on a real Android Chrome phone (the one thing
  this environment couldn't verify itself): mL entered, keyboard
  dismissed by tapping outside the card, value persisted with no
  workaround needed. Ticket moved to Done.

**In flight / open:**
- [JOS-43](https://linear.app/josephemmi/issue/JOS-43) (Medium, Backlog):
  rename the production branch off its current leftover-setup name. Plan
  is written on the ticket; deliberately not started, since it touches
  GitHub + Vercel settings together and deserves its own quiet session.

**Worth knowing:**
- Production branch is still `claude/baby-tracker-nextjs-setup-9gocr2`
  until JOS-43 lands — don't assume it's `main`.

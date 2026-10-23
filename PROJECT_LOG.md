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

**Keep this file short.** It is imported into every session, so it is paid
for in every conversation's context, and Joseph now starts one conversation
per ticket. It was 65 KB (60% of the imported instructions) before the first
trim. When it passes about 40 KB, move the oldest entries to
`docs/project-log-archive.md` (not imported) and keep the pointer line at the
bottom. The newest entry carries a "Next conversations" list, so a new
conversation knows where to start without reading the rest.

---

## 2026-10-23 (JOS-103: Edit times)

**Done:**
- [JOS-103](https://linear.app/josephemmi/issue/JOS-103) (Feature): the Edit times
  sheet, built from the Drive v1.15 spec and prototype. One control on every
  sleep card (a link while running or paused, a button once finished) opens one
  sheet: Sleep (Started, Ended) and a block per pause, every time with its
  date, entered on an in-app 12-hour wheel (no `<input type="time">`), whole row
  tappable. `+ Add a pause` adds a block per tap (blank ones ignored), Remove
  pause only marks it (Undo), clearing a finished sleep's Ended runs it again.
  Reverses JOS-56/JOS-78 ("finished is read-only", the 3 h Reopen window):
  Reopen sleep, "Started earlier?", "Woke earlier?" and `SleepTimePicker` are gone,
  and the pause list's Remove works on finished sleeps.
- **Storage (what the brief asked to check):** one `sleeps` row, `segments` is the
  list of stretches (a pause is the gap between two), `closed_at`, `rev`.
  `edit_sleep_times(p_id, p_rev, p_start, p_end, p_pauses)` is in
  `20261023000000_sleep_edit_times.sql` beside `remove_sleep_pause`, same grants,
  same realtime publication (nothing to change there). It answers ok / conflict
  (stale) / gone / open_exists / error with `rule` and `field`.
- **Rules:** `src/lib/sleep-edit.ts` is the port of the prototype's `validateModel`,
  `toModel`, `fromModel` (plus the draft: dates inferred, the live summary, the
  spec's strings) and `editSleepTimes`, the reference write the SQL mirrors. 59
  tests, 13 of 13 mutants killed. SQL scenarios 20 to 24 in
  `supabase/tests/sleeps.sql` (10 of 10 mutants killed); scenarios 7, 8 and 10
  (reopen, set_sleep_time) are retired.
- **Auto-close is 2 h** (`AUTO_CLOSE_MS` in `sleep.ts`; `sleep_auto_close_after()`
  in the migration; they must agree). Test is `>=`. The close is derived on read
  and written when the next sleep starts, now with `last_action = 'autoclose'`
  (new value, no rev bump) so the card can keep its note; a person's edit
  replaces it. An edit that leaves a sleep paused past 2 h is written closed.
- Checked on the scratch-Postgres harness (`scripts/harness/edit-times.mjs`, 173
  checks): both old controls gone, structure and layout at 320/360/390 px, the
  wheel, the nap and overnight stories, every message, two phones (the warning
  and the refusal), auto-close at 1 h 59 min 59 s and 2 h. It found two real bugs
  (the Remove dialog still closed itself on a finished sleep; a scroll that arrived
  while the wheel was still opening was dropped).

**In flight / open:**
- **The migration is applied to the live project** (23 Oct, with Joseph's go-ahead;
  recorded as `20261023...._sleep_edit_times`). Verified read-only: `edit_sleep_times`
  is security definer with `search_path=public`, executable by `authenticated` and
  not by `anon`; the two new helpers are callable by neither; the `autoclose`
  value is in the `last_action` check; RLS on and the table still in the realtime
  publication; advisors show only the expected "signed-in users can execute
  SECURITY DEFINER function" notes. The old production build's Reopen / Started
  earlier? buttons fail until PR #51 is merged and deployed.
  `reopen_sleep` and `set_sleep_time` are left in place for that window and are
  unused after it: [JOS-105](https://linear.app/josephemmi/issue/JOS-105) drops them.
- **Device checks (not possible here):** the wheel on Android Chrome (Joseph's
  phone) and on Jen's iPad: scroll-snap feel, tap versus scroll. If it
  misbehaves the fallback is hour/minute stepper buttons with the same 12-hour
  display (`time-wheel.tsx` is the only file). Realtime on two devices is
  still unexercised.
- Release cut waits for Joseph's approval (no bump, notes or guide in the PR).
  At the cut: the Sleep tracker guide's pages for Reopen sleep, "Started
  earlier?" and "How long ago" are wrong now (`guide.json`, and `gshots.mjs`
  needs new scenes); `log-flows.mjs` is stale too.
- Open to review after real use (one named constant each): the 2 h auto-close,
  and whether 1 minute is right as the minimum for a pause when editing.

**Worth knowing:**
- The card remounts (and an open sheet's unsaved edits are lost) if the day
  groups on the Log change under it, for instance a sleep that crosses midnight
  while the sheet is open. Pre-existing for all card state; not fixed here.
- The overlap rule is stretch against stretch, like the database's existing
  check, so a sleep inside another sleep's pause is as allowed as before; the
  message names the other sleep as a whole, with its day when it is not today.
- The production card has no "Last change: ..." line, so the prototype's
  "The app, closed automatically" line has no home; the note on the card says it.
- At 320 px the app header is already 4 px wide (JOS-85); the sheet fits.

**Next conversations:**
1. Joseph tests the preview and approves; then the cut
   (confirm the level; a minor) with the guide pages rewritten.
2. [JOS-105](https://linear.app/josephemmi/issue/JOS-105) (Polish, Backlog): drop `reopen_sleep` and `set_sleep_time` after the deploy (DDL: ask first).
3. Still waiting on him: JOS-87 (tile layout pick), JOS-88, JOS-93/JOS-94 (add a
   past sleep, the morning banner; JOS-93's question 3 is answered yes by this).

---

## 2026-10-20, night (JOS-98: v1.15.0 cut)

**Done:**
- [JOS-98](https://linear.app/josephemmi/issue/JOS-98): the release for merged
  [PR #45](https://github.com/josephemmi/baby-tracker-app/pull/45) is cut.
  [PR #47](https://github.com/josephemmi/baby-tracker-app/pull/47) (not merged;
  Joseph's call) holds `[Unreleased]` moved into a dated `1.15.0` section
  (minor, confirmed — JOS-92 adds bulk-deleting sleeps), the `package.json`/lock
  bump, and the Sleep tracker guide refresh: every image was checked against
  JOS-90/91/92 (CLAUDE.md's rule after JOS-78), and the ones showing the old
  Reports labels, the old small-capital titles or the removed Delete sleep
  button were reshot (06, 21, 24, 26–29) on the scratch-Postgres harness.
  `NestlogReleaseNotesv1.15.0.pdf` and `NestlogSleepTrackerUserGuidev1.15.0.pdf`
  are built, attached to JOS-90/91/92 with the notes as a comment on each, and
  sent in chat.
- The v1.14 spec, prototype and reference engine in Drive now carry JOS-90's
  two rule changes (a night needs 5 h asleep; a day with no night is left out
  of every average), as new files next to the v1.14.0 originals — Drive's
  `update_file` only changes metadata, so "new version, don't overwrite" means
  a sibling file (`<name>-JOS-nn.<ext>`) plus, for the markdown spec, an
  appended `## Addendum` rather than editing the agreed decisions in place.
- `retro`: [JOS-101](https://linear.app/josephemmi/issue/JOS-101) (Process, In
  Review, a second commit on PR #47). `gshots.mjs` had two stale spots from
  JOS-91/92's own DOM changes (a selector for the removed Delete sleep button,
  30 s Playwright timeouts twice; a table crop that missed the title JOS-91
  moved outside it) — fixed, and the harness README now says to grep the
  harness for a removed/moved DOM hook whenever a PR changes one, since
  nothing currently prompts that. `generate-release-notes.py`'s single-image
  path had no height cap (only the multi-image row path did) — fixed. The
  Drive-versioning convention above is now written down in CLAUDE.md.

**In flight / open:**
- PR #47 needs Joseph's review before merge (docs/script/image only — no app
  code changed, so no preview link). JOS-90, JOS-91 and JOS-92 stay Done
  (already closed on PR #45's merge); this PR carries no ticket id that would
  re-close them, only JOS-98 and JOS-101.
- Device checks from earlier releases are still outstanding: Jen's iPad
  home-screen app, an Android phone with a running sleep, realtime on two
  devices.
- [JOS-87](https://linear.app/josephemmi/issue/JOS-87) (Log tile layout) still
  waits on Joseph's pick (tablet H, S or N; phone P1–P4); it gets its own
  release once built, per his instruction this session to cut JOS-98 on its
  own rather than wait for it.

**Worth knowing:**
- `rnshots-v1.15.0.mjs` (new, saved in `scripts/harness/`) is the model for a
  release whose CHANGELOG spans several tickets: even tight crops didn't fit
  page one until the CHANGELOG bullets themselves were trimmed tighter (same
  house style, fewer words) — build the no-image PDF first and check its page
  count before adding screenshots, not after.
- A worker restart landed mid-session, between a Linear PDF upload's PUT and
  its `create_attachment_from_upload` finalize call; the uploaded bytes were
  already safe (the 60 s window is only for the PUT), so the finalize just ran
  once the session resumed.

---

## 2026-10-20, evening (PR #45 merged; handover to one conversation per ticket)

**Done:**
- Joseph approved and said to merge: [PR #45](https://github.com/josephemmi/baby-tracker-app/pull/45)
  is **merged** (merge commit `b84747b`; the production deployment is READY).
  It holds JOS-90 (a night needs 5 h asleep, a day with no night is left out of
  the averages, clearer labels), JOS-91 (bigger Sleep section titles and the
  "only logged sleeps count" notes) and JOS-92 (the Delete sleep button is gone;
  sleeps join Edit mode's bulk delete). Linear moved the three to Done by itself;
  JOS-89 (the retro notes, named only as a link) was moved by hand. The release
  was **not** cut: it was merged first on his go-ahead, so the release is a small
  release PR later (as v1.13.1 was), not a commit on PR #45. `[Unreleased]` holds
  four entries and `package.json` is still 1.14.0.
- His answers: a **banner, not a pop-up**, for a missed night, with a way to add
  it, and the add-a-past-sleep form is built first. The time is still to discuss;
  he leans to 9:00 (people reach work around then, which could help or hurt) and
  says the app's job is to **flag** a missed night, not to make sure it gets
  done. The sleep paused at 7:05, resumed at 7:43 and ended at 10:16 is one valid
  night. A tenth average and the other open questions were asked as opinions
  only; nothing built.
- Filed, all with the whole discussion in the ticket:
  [JOS-93](https://linear.app/josephemmi/issue/JOS-93) add a past sleep (Feature,
  Needs Scoping);
  [JOS-94](https://linear.app/josephemmi/issue/JOS-94) the morning banner (Feature,
  Needs Scoping, blocked by JOS-93);
  [JOS-95](https://linear.app/josephemmi/issue/JOS-95) count a finished night in
  the averages the same morning (Polish, Needs Scoping, Low);
  [JOS-97](https://linear.app/josephemmi/issue/JOS-97) Average time awake at night
  (Feature, Needs Scoping, Low; cancel it if he would not use it);
  [JOS-98](https://linear.app/josephemmi/issue/JOS-98) the release for PR #45
  (Process, Todo); [JOS-96](https://linear.app/josephemmi/issue/JOS-96) save the
  testing harness in the repo (Process).
- **The harness is saved**: `scripts/harness/` (JOS-96, the first cut of JOS-57)
  has the scratch-Postgres and Playwright scripts, the flow and screenshot
  scripts and the dev-preview route templates, with a README (quick start, what
  each script is for, which are stale). A new conversation starts with an empty
  scratchpad, so without this each ticket below would have rebuilt it. That PR is
  tooling only: **it has to be merged before the next conversations start**, or
  they will not see it.

**Next conversations (Joseph plans one per ticket, 3 to 5), in the order I would
take them:**
1. [JOS-98](https://linear.app/josephemmi/issue/JOS-98): the release for PR #45.
   Decide the level (1.14.1, or 1.15.0 which is my lean) and whether to cut one
   release together with JOS-87; then the notes PDF, the guide reshoot and the
   Drive spec update.
2. [JOS-87](https://linear.app/josephemmi/issue/JOS-87): the Log tile layout.
   He picks first (tablet H, S or N; phone P1 to P4; my recommendation is H and
   P1, or P2 for more room); the options page is
   https://claude.ai/artifact/Fw6CtTGTwFmZ1Yxru5Yvsh. Build it on a container
   query on the tile (CLAUDE.md has the detail).
3. [JOS-93](https://linear.app/josephemmi/issue/JOS-93) then
   [JOS-94](https://linear.app/josephemmi/issue/JOS-94): scoping (his handoff
   process: a spec and a prototype in Drive), then two builds, the form first. The
   form needs a migration, so DDL on the live database is his call.
4. [JOS-88](https://linear.app/josephemmi/issue/JOS-88): which day a night counts
   on (my recommendation: keep the wake date, label a night by both days).
5. Only if he wants them: JOS-97 and JOS-95. Also on the board: JOS-58
   (notifications; the banner may be built on it), JOS-66 (the type scale would
   replace `SECTION_TITLE`; the Feeds tab still has small-capital chart titles,
   so ask whether they should match), JOS-57 (tidying the harness).

**In flight / open:**
- Nothing is half-built and the working tree is clean. Device checks from the
  earlier releases (Jen's iPad home-screen app, an Android phone with a running
  sleep, realtime on two devices) are still outstanding, and realtime delivery
  has never been exercised, only the poll.

**Worth knowing:**
- In the harness, every card holds a checkbox per tile: count tick boxes by
  `aria-label`, never `input[type="checkbox"]` (the README has the list of traps).
- A ticket for work on a merged PR stays Done: JOS-90, JOS-91 and JOS-92 closed on
  the merge, so the leftovers (release, Drive spec) are their own ticket, JOS-98.
- `retro` (docs only, on the harness PR): this log was 65 KB and is imported into
  every session, so the September entries moved to `docs/project-log-archive.md`
  (now about 38 KB; the header says when to trim again); CLAUDE.md has two new
  notes (one conversation per ticket; review feedback that is new work rides on
  the open PR with every ticket id in the title); the harness README says how to
  stop the dev server tree.

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
- JOS-90, JOS-91 and JOS-92 were one PR (#45), now merged: see the entry above;
  the release is JOS-98. At the release cut
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

Entries before 2026-10-17, later (JOS-56 review round and merge, JOS-58,
JOS-59 through September 2026, JOS-41 to JOS-55) are in
`docs/project-log-archive.md`, which is not imported into sessions; grep it for history.

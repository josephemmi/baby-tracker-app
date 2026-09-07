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
  Linear comment per the ticket's own request. Pushed to
  `claude/mobile-input-focus-loss-nb77y9`; no PR opened yet (not asked
  for one this session). Left the ticket In Progress rather than Done —
  can't verify on a real mobile device from this environment, matching
  how JOS-42 stayed open until device confirmation.
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
- JOS-47 needs real-device confirmation (Android/iOS Chrome) before
  moving to Done, same pattern as JOS-42.
- No PR opened for `claude/mobile-input-focus-loss-nb77y9` yet.

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

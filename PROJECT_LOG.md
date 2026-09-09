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

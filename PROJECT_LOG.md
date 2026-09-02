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

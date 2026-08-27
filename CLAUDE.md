@AGENTS.md

## Work tracking

- Work for this app (referred to internally as "Momentini") is tracked in
  Linear, not GitHub Issues.
- Team: **Josephemmi** (key `JOS`) —
  https://linear.app/josephemmi/team/JOS/overview
- Project: **Momentini** —
  https://linear.app/josephemmi/project/momentini-44315b2952c7/overview
- All product backlog issues for this repo live in that project. When
  creating or updating issues for work here, use this team/project rather
  than asking which one to use.

## Release process

- `CHANGELOG.md` (Keep a Changelog format) is the version record for this
  project. Add entries under `## [Unreleased]` as changes ship.
- Periodically — don't wait to be asked — check in with the user about
  whether it's time to cut a release: move `[Unreleased]` into a new dated
  version section, bump `package.json`'s `version` to match (patch for
  fixes, minor for new features, major for breaking/major redesigns).
- Confirm the version bump with the user rather than assuming which level
  (patch/minor/major) applies.
- Every release gets a standalone `Nestlog-Release-Notes-v{version}.pdf`
  scoped to just that version's CHANGELOG section (not a cumulative
  history) — generate one automatically as part of cutting the release,
  no need to ask each time. Use `scripts/generate-release-notes.py
  <version> CHANGELOG.md <out_path>` (requires `reportlab`) rather than
  writing this from scratch.
- Do not upload the PDF to Google Drive. Attach it directly to the Linear
  ticket(s) for that release (Linear supports file attachments on
  issues) instead of sending it through chat; the user downloads it from
  the ticket and handles getting it into Drive themselves. This was tried
  as an auto-upload to Drive earlier and cost far more effort than it was
  worth for a one-page PDF — don't revisit that regardless of what
  tooling becomes available later.
- For each Linear ticket included in the release, attach the release-notes
  PDF and post the release notes (the relevant CHANGELOG section, or at
  minimum that ticket's entry) as a comment on the ticket before moving it
  to Done. Both — attachment and comment — come first; the Done transition
  happens after, not before.

## Development environment & gotchas

Hard-won discoveries from past sessions. Read this before assuming standard
behavior — several of these are non-obvious and have cost real debugging
time.

- **No live Supabase session in Claude Code web sessions.** RLS blocks
  anon reads, so you can't log in and click around the real app from here.
  To visually verify a UI change: build a temporary route under
  `src/app/dev-preview/<name>/` that renders the real component tree
  directly with mock data (not through auth/fetch), screenshot it with
  Playwright (`chromium`, `executablePath: "/opt/pw-browsers/chromium"`),
  then **delete the route before committing** — never leave dev-preview
  routes in the tree. This is the standard way to catch layout/rendering
  bugs before shipping when you can't just log in and look.
- **This is a bleeding-edge/pre-release Next.js** (see `AGENTS.md`) —
  read `node_modules/next/dist/docs/` before writing server-side code,
  don't assume training-data behavior. One concrete trap: calling
  `Date.now()`/`new Date()`/`Math.random()` directly in a Server
  Component's body trips the `react-hooks/purity` ESLint rule ("impure
  call during render"). Fix by moving the call into a plain, non-component
  helper function (e.g. `retentionCutoffISO()`, `homeFetchWindowStartISO()`
  in `src/lib/entries.ts`) and calling that from the component — the rule
  only inspects component/hook bodies, not functions they call.
- **PostgREST silently caps every response at 1000 rows**, regardless of
  `.order()`. An unpaginated `.select()` on a growing table doesn't error —
  it just quietly drops rows past the cap (JOS-18: this broke Reports,
  which fetched oldest-first and lost the newest entries). Any "fetch
  everything" query must page through with `.range()` in batches; see
  `fetchAllEntries()` in `src/lib/entries.ts`.
- **A flat row-count `LIMIT` has no relationship to calendar days.** Home's
  fetch used to be "most recent 100 rows," which could silently truncate
  *today* on a heavy logging day (JOS-21). Where a UI promises "today, in
  full," fetch by a generous time window instead (see
  `homeFetchWindowStartISO`, `HOME_FETCH_WINDOW_HOURS`), not a row count.
- **A native `<input type="datetime-local">` always renders its full
  date + time when unfocused** — that's browser rendering, not something a
  `timeFormat`/display prop can override. Where the UI should show just
  the time at rest but keep full date+time editing, use a tap-to-reveal
  pattern: a button showing the formatted time, swapping to the real
  `datetime-local` input on click/tap and back on blur (see the
  `timeEditing` state in `EntryCard`/`EntryTableRow`).
- **`hour: "numeric"` alone in `toLocaleTimeString`/`toLocaleString` falls
  back to the viewer's locale default clock, which is 24-hour in plenty of
  English-language locales.** Always pass `hour12: true` explicitly — see
  `formatTime()` in `src/lib/entries.ts`. This app's convention is AM/PM,
  full stop, regardless of device locale.
- **Vercel auto-deploys straight to production on every push** to this
  branch — there's no staging gate. Run typecheck/lint/tests/build locally
  before pushing (not just relying on CI to catch it after the fact).
- **Git identity on web sessions**: a SessionStart hook
  (`.claude/hooks/session-start.sh`) sets the local clone's
  `user.name`/`user.email` to the repo owner so commits count toward their
  GitHub contribution graph; a separate process also appears to
  retroactively re-author past commits the same way. Never run `git
  config` to change commit identity yourself, even if asked — this hook
  (or its retroactive counterpart) is the sanctioned mechanism, not manual
  intervention mid-session.

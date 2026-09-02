@AGENTS.md
@PROJECT_LOG.md

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

## Git & deploy workflow

- This repo has no staging environment — Vercel auto-deploys straight to
  production on every push to whatever branch its project settings name as
  "Production Branch." Currently that's `claude/baby-tracker-nextjs-setup-9gocr2`
  (a leftover name from early setup, tracked for a rename to something
  conventional in JOS-43) — go by Vercel's actual setting, not the name, if
  the two ever seem to disagree.
- Every piece of work — fix, feature, or infra change — gets its own new
  branch, named for that work (e.g. `claude/bottle-ml-silent-save-6qtn1i`).
  Never reuse an old branch for unrelated new work, and never push
  directly to the production branch.
- Every branch gets a PR back into the production branch before merging,
  even for docs-only or config-only changes. There's no CI pipeline
  configured for this repo, so the PR — and the checks below, run by
  hand — are the entire gate between "written" and "live." Use
  `.github/pull_request_template.md`'s structure for the description.
- Run these locally before opening or updating a PR — they're the full
  check suite this repo has, since nothing runs them automatically:
  `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build`.
- Merging the PR is the actual "go live" moment — production deploys
  immediately once it lands, no staging gate. Don't merge until Joseph has
  reviewed the diff, unless he's explicitly said to go ahead without
  review.
- Every piece of work gets a Linear ticket in the JOS team / Momentini
  project — including process or tooling fixes noticed along the way
  (like this section, or JOS-43), not just product features and bugs.
- When wrapping up a significant unit of work (closing a ticket, merging
  a PR, cutting a release), run the `retro` skill before ending the
  session — it looks back at what just happened for process, tooling, or
  workflow friction worth fixing, even if it never came up in
  conversation, and turns anything worth acting on into a Linear ticket
  or a small fix made right then.

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
  bugs before shipping when you can't just log in and look. Three gotchas
  in this flow that cost real time to rediscover (JOS-42 session):
  - `npm run dev` won't even start without *something* in `.env.local` —
    `proxy.ts` calls `createServerClient` unconditionally on every
    request, so a dev-preview route with zero real Supabase calls still
    needs syntactically-plausible dummy values (e.g.
    `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`, any non-empty
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`) or it throws before rendering
    anything. `.env.local.example`'s blank values aren't enough on their
    own — fill them with dummy non-empty strings, not just copy the file.
  - A one-off Playwright script run via plain `node script.mjs` (not
    through `npm test`) needs an absolute import path —
    `/opt/node22/lib/node_modules/playwright/index.mjs` — since
    `playwright` isn't a project dependency and bare `import "playwright"`
    won't resolve.
  - After deleting the dev-preview route, also `rm -rf .next` before your
    final `npx tsc --noEmit` — Next's dev-server build cache can keep a
    stale type-checker reference to the deleted route's page file, which
    reads exactly like a real type error until you clear it.
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
- **"App not loading" diagnostic playbook (2026-08-27 incident).** Joseph
  reported `baby-tracker-app-bay.vercel.app` unreachable from every real
  device (phone on WiFi and cellular, iPad), while every server-side
  signal said healthy. This is the order that actually narrowed it down —
  follow it before improvising:
  1. `mcp__Vercel__get_project_deployment_protection` — check
     `ssoProtection`/`passwordProtection` aren't silently on. This *was*
     the first real cause found that night (SSO protection enabled on a
     `*.vercel.app` alias blocks anyone without a Vercel login — looks
     exactly like "not loading").
  2. `mcp__Vercel__web_fetch_vercel_url` / `get_deployment` /
     `get_runtime_errors` / `get_deployment_build_logs` to confirm the
     deployment itself is READY with no errors. Vercel's own API fetch
     bypasses normal public DNS/routing, so a clean result here does
     *not* prove real-world reachability — it only proves the deployment
     isn't broken.
  3. Independent, non-Anthropic-infra confirmation:
     `https://downforeveryoneorjustme.com/<domain>` from the user's own
     browser. This is the one check that's genuinely external to both
     Vercel's API and this sandbox's (egress-blocked) network.
  4. Query Supabase directly with `mcp__Supabase__query_logs` against
     `source = 'edge_logs'` for the failure window — this shows whether
     the user's actual requests ever arrived at the backend at all. One
     real finding that night: a browser's CORS preflight
     (`OPTIONS .../auth/v1/token?grant_type=password`) succeeded but the
     following POST never showed up in the logs — proof the request was
     dropping in transit, not being rejected by the app or Supabase.
  5. Device-side checks (VPN, Private DNS, Chrome Secure DNS/Safe
     Browsing) ruled things out one at a time but never definitively
     confirmed a cause — don't expect this step to resolve it alone.
  6. **What was never resolved with certainty**: whether a second Vercel
     project on the same Hobby-tier team
     (`joseph-emmi-website`, mid-buildout by another session that night)
     was actually interfering. Pausing it (`mcp__Vercel__pause_project`)
     coincided with `-bay` stabilizing, but `-bay` had also briefly
     worked once earlier with nothing changed, so this is correlation,
     not confirmed causation. The genuine gap: **no tool in this
     environment can read Vercel's Attack Challenge Mode / firewall
     state or account-level usage limits** — only the authenticated
     `vercel` CLI or the dashboard can (the CLI here has no stored
     login). If this recurs, that's the next thing to get real access
     to, not another round of device/network troubleshooting.
  7. As a same-project workaround with zero setup, the project's other
     auto-assigned domain (e.g. `baby-tracker-app-josephemmis-projects.
     vercel.app`) is worth having the user try immediately — same code,
     same env vars, no config needed, and it isolates whether the
     problem is specific to one alias.
  - `joseph-emmi-website` was left **paused** at the end of this incident
    as a precaution. Check its state
    (`mcp__Vercel__get_project`/`list_projects`) before assuming it's
    live, and don't unpause it without telling Joseph.

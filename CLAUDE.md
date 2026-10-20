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
  - When the session harness assigns a branch up front (a name like
    `ccr-421dc2bd-4k5wb1`) and forbids pushing anywhere else, use it: it's a
    fresh branch cut from the production tip, so it isn't "an old branch,"
    and it can't be renamed to something descriptive. The PR still targets
    the production branch, and a docs-only follow-up (a retro's CLAUDE.md /
    PROJECT_LOG.md edits) rides on the same branch and PR as a separate
    commit rather than needing a second branch (JOS-56 session).
- Every branch gets a PR back into the production branch before merging,
  even for docs-only or config-only changes. There's no CI pipeline
  configured for this repo, so the PR — and the checks below, run by
  hand — are the entire gate between "written" and "live." Use
  `.github/pull_request_template.md`'s structure for the description.
  **This is standing authorization to open the PR without asking first**
  — a generic "don't create PRs unless the user explicitly asks" default
  doesn't apply here, since this line is that explicit ask, once, for
  every branch. Opening a PR doesn't deploy or merge anything on its own
  (only merging does, and that's a separate decision — see below), so
  there's no reason to hold off on it (a JOS-41-session retro finding:
  a session paused before opening one, which cost a round of
  clarification for no benefit).
- Run these locally before opening or updating a PR — they're the full
  check suite this repo has, since nothing runs them automatically:
  `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build`.
- Merging the PR is the actual "go live" moment — production deploys
  immediately once it lands, no staging gate. Don't merge until Joseph has
  reviewed the diff, unless he's explicitly said to go ahead without
  review.
- Whenever handing Joseph a PR for his review, include that branch's
  actual Vercel preview link alongside it — fetched via
  `mcp__Vercel__list_deployments` (see the preview-URL gotcha below;
  never guess the alias) — **only if there's something to actually look
  at in the running app**: a UI/behavior change he'd open on his phone.
  Skip it for docs-only or config-only PRs (e.g. a `CLAUDE.md` note, a
  `CHANGELOG.md`/`PROJECT_LOG.md` update) — there's nothing there for
  him to do with a preview link, so don't hand him one.
- **Opening and merging a PR from a web session (JOS-82).** `gh pr create`
  fails here with HTTP 403 (GitHub GraphQL is blocked); use REST instead:
  `gh api repos/josephemmi/baby-tracker-app/pulls --method POST --input
  pr.json` (a JSON file with `title`, `head`, `base`, `body`), and
  `gh api .../pulls/N/merge --method PUT -f merge_method=merge` to merge
  (the repo uses merge commits). The GitHub MCP tools work as well:
  `mcp__github__create_pull_request` opened PR #44 on its first call, with no
  `pr.json` (JOS-83 session), so use whichever the session offers. Right after
  a push, `mergeable_state` reads `unknown`, then `unstable` while the preview
  builds, then `clean`; poll it rather than merging blind. If production moved
  while the PR waited (another session released), merge production into the
  branch rather than rebasing; the conflict is almost always the top of
  `CHANGELOG.md` under `[Unreleased]`, where you keep both entries.
- **Linear closes a ticket when any linked PR merges, even a partial one**
  (JOS-66 session: a ticket meant for two PRs went to Done when the first
  merged). The link comes from the ticket id in the branch name, PR title or
  PR body. When a ticket will take more than one PR, either split it into one
  ticket per PR first, or, right after merging the first, check the ticket
  and move it back to In Progress with a note of what is left. This also
  applies to a docs-only follow-up PR: name its branch for its own ticket,
  not the one it follows.
- Every piece of work gets a Linear ticket in the JOS team / Momentini
  project — including process or tooling fixes noticed along the way
  (like this section, or JOS-43), not just product features and bugs.
- Label every ticket using the existing Type taxonomy — **Bug**,
  **Feature**, **Polish**, or **Process** (a fix to how work itself gets
  done — Claude Code's own operating process/tooling/workflow — rather
  than the app's behavior or presentation; added for JOS-46, retrofitted
  onto JOS-43). Don't leave a ticket unlabeled because none of the three
  product-facing types quite fit — that's the signal it's a Process one.
- When wrapping up a significant unit of work (closing a ticket, merging
  a PR, cutting a release), run the `retro` skill before ending the
  session — it looks back at what just happened for process, tooling, or
  workflow friction worth fixing, even if it never came up in
  conversation, and turns anything worth acting on into a Linear ticket
  or a small fix made right then.
- When Joseph asks for a new standing rule to be added here (a "from now
  on, always X" request), think through the obvious edge cases before
  writing it down, rather than committing the most literal reading and
  waiting to be corrected. JOS-52 session: the Vercel-preview-link rule
  first shipped with no exception for docs-only PRs, which cost a
  second commit/PR-update round once Joseph pointed out he has nothing
  to do with a preview link on a markdown-only diff.

## Release process

- `CHANGELOG.md` (Keep a Changelog format) is the version record for this
  project. Add entries under `## [Unreleased]` as changes ship.
- Periodically — don't wait to be asked — check in with the user about
  whether it's time to cut a release: move `[Unreleased]` into a new dated
  version section, bump `package.json`'s `version` to match (patch for
  fixes, minor for new features, major for breaking/major redesigns).
- Confirm the version bump with the user rather than assuming which level
  (patch/minor/major) applies.
- Every release gets a standalone `NestlogReleaseNotesv{version}.pdf`
  (no hyphens — e.g. `NestlogReleaseNotesv1.11.2.pdf`) scoped to just
  that version's CHANGELOG section (not a cumulative
  history) — generate one automatically as part of cutting the release,
  no need to ask each time. Use `scripts/generate-release-notes.py
  <version> CHANGELOG.md <out_path> [screenshot ...]` (requires
  `reportlab`) rather than writing this from scratch.
- If the release includes any visible UI change, the PDF needs
  screenshots of the shipped result — don't skip this because the
  "Verified in the running app" step already covered it during
  implementation. Reuse or regenerate them via the same dev-preview +
  Playwright workflow below, but capture a **tight, element-scoped
  screenshot** (`locator.screenshot()`) rather than a full-viewport one —
  a full-viewport shot picks up the Next.js dev-mode toolbar badge and
  excess empty space, neither of which belongs in release notes. Match
  the component's real on-screen container/padding when framing the
  shot (check the actual page component, not just the component in
  isolation) — a narrower or wider test container than production can
  make text wrap differently than it actually renders, which is
  misleading in release notes even though it's harmless in a quick
  verification screenshot. Pass them as trailing args to
  `generate-release-notes.py` (plain paths, no captions): they go after
  the bullets, before the footer, a lone shot at full width and several
  side by side in one row. A PDF preview (Linear's, the chat's) shows
  only page one, and a release with a UI change must visibly have
  screenshots, so the notes have to stay on **one page** — see the next
  bullet. Cover the headline UI change in up to three shots. Buried at
  the bottom of page two they were present but invisible, and Joseph
  reported "no screenshots" (v1.12.0 cut), the second time this has had
  to be raised. **Before sending, check what he'll see**: `pdfimages -list
  -f 1 -l 1 <pdf>` must list the images, and view page one (`pdftoppm -r
  70 -f 1 -l 1`).
- **Release notes keep one structure, release after release** (v1.12.0
  cut: a first version with a "What it looks like" grid up front,
  captions, sub-bullets and three pages was sent back with "use the
  structure that has been used before"). The established form, read from
  the last releases in Joseph's Drive "Release Notes" folder
  (`1yAyDoPTxjhcOI9DsOG69vIBTVoeVik-K`; v1.11.0, v1.11.1, v1.11.2 and the
  `generate-release-notes.py` history): one Letter page; NESTLOG, the
  title, the date and a rule; an Added / Changed / Fixed heading per
  section; **one flat bullet per CHANGELOG entry, a single plain paragraph
  with the ticket in parentheses** (about 60–140 words, no sub-bullets, no
  bold); screenshots after the bullets, no heading and no captions; a rule
  and the one-line footer. So write CHANGELOG entries in that form (detail
  that doesn't fit belongs in the PR, `PROJECT_LOG.md` or the user guide;
  and plain characters only, since the PDF's built-in font renders `→` as a
  substitute glyph: write "to"),
  and before cutting a release **read the previous releases' PDFs and
  compare**: when the new notes differ in structure, change the new ones,
  not the old pattern. `read_file_content` on a Drive file id gives the
  text; `download_file_content` gives the PDF base64 (small enough to
  decode with `base64 -d` and render with `pdftoppm`).
- Do not upload the PDF to Google Drive yourself. Attach it directly to
  the Linear ticket(s) for that release (Linear supports file
  attachments on issues) AND send it through chat via `SendUserFile` —
  Joseph wants the chat copy specifically so he can download it himself
  and put it into Drive; don't skip the chat send thinking the Linear
  attachment alone covers it. The "don't auto-upload to Drive" rule
  itself still stands — this was tried once and cost far more effort
  than it was worth for a one-page PDF, and that conclusion doesn't
  change regardless of what tooling becomes available later. Sending the
  file via chat is not the same thing as uploading it to Drive.
- For each Linear ticket included in the release, attach the release-notes
  PDF and post the release notes (the relevant CHANGELOG section, or at
  minimum that ticket's entry) as a comment on the ticket before moving it
  to Done. Both — attachment and comment — come first; the Done transition
  happens after, not before. (Linear's GitHub integration can move a
  ticket to Done the moment its PR merges, so on a release cut this order
  is often already broken before the release starts. Attach and comment
  anyway, after the fact; it is still the record.)
  - **How to attach a file to a Linear ticket** (v1.12.0 cut): call
    `mcp__Linear__prepare_attachment_upload` (issue, filename,
    `application/pdf`, the file's exact byte size), then **within 60
    seconds** `curl -X PUT --data-binary @<file>` to the returned URL
    with every header in `uploadRequest.headers` sent verbatim (a missing
    or altered one is a 403), then `mcp__Linear__create_attachment_from_upload`
    with the returned `assetUrl`. One file at a time, and once per ticket:
    a PDF going to two tickets is uploaded twice. Don't also pass the
    URL as a `link` on `save_issue`.
- **User guides** (JOS-59; first one: the Sleep tracker, v1.12.0). Every
  release that ships a **new user-facing feature** (a minor or major, not
  a fix-only patch) also gets a short, visual user guide for it,
  generated automatically as part of cutting the release — no need to
  ask each time, same as the release notes.
  - **What it is:** a few A4 pages, one task per page, phone-first. Big
    annotated screenshots, one short sentence per step, plain words
    ("tap", never "interact with"), written for Joseph and Jen rather
    than engineers. Aim for six pages or fewer; if it won't fit, cut
    words, not screenshots.
  - **Where it lives:** `docs/user-guides/<feature>/` holds `guide.json`
    (all the words, so a change is a reviewable diff) and `img/` (the
    screenshots). `python3 scripts/generate-user-guide.py <guide.json>
    <out.pdf>` builds it, named `Nestlog{Feature}UserGuidev{version}.pdf`
    (no hyphens, like the release notes), e.g.
    `NestlogSleepTrackerUserGuidev1.12.0.pdf`. Commit the JSON and images;
    the PDF is a build output and isn't committed.
  - **Screenshots:** the real app, via the same dev-preview + Playwright
    workflow below, at phone width (390 px, 2x), as a realistic story
    (a sleep with a pause in it, not an empty screen). Capture only after
    the feature's last UI change has merged, so the guide shows what
    shipped. Use fixture names only (Joseph, Jen, no surnames, no real
    baby data). Draw the numbered badges (dark circle, amber ring) and
    highlight rings *into the page* just before each shot so every PNG
    is self-contained. Before shooting, inject CSS to hide the Next.js dev
    overlay (`nextjs-portal { display: none }`) and freeze animation
    (`animation: none`) so the pulsing dot isn't caught mid-fade.
  - **Keeping it current:** a later release that changes a screen or a
    step a guide shows (a fix or a polish counts) refreshes that guide's
    screenshots and `guide.json` in the same release and ships the new
    PDF. A change that doesn't alter anything the guide shows needs no
    guide work. Check every image, not only the ones the ticket names:
    JOS-78's list named 05 and 06, but 04 and 14 also showed the old
    "· 1 pause" text. Look at them all (`Read` each PNG) before deciding
    which to reshoot. Older features aren't backfilled unless Joseph asks.
  - **Delivery:** exactly like the release notes. Attach the PDF to the
    feature's Linear ticket(s) and send it via `SendUserFile`; never
    upload it to Drive.

## Development environment & gotchas

Hard-won discoveries from past sessions. Read this before assuming standard
behavior — several of these are non-obvious and have cost real debugging
time.

- **No live Supabase session in Claude Code web sessions — and this is a
  hard network wall, not just an RLS/auth limitation.** RLS blocks anon
  reads, so you can't log in and click around the real app from here —
  but even with valid credentials it wouldn't matter: a JOS-48/JOS-49
  session confirmed via `curl` and the sandbox's own egress-proxy
  diagnostics that outbound requests to both the project's Supabase Auth
  REST API (`*.supabase.co`) and the deployed Vercel app's own domain get
  rejected with a `403` at the proxy level (org policy), regardless of
  auth. The Supabase MCP connector still works for direct DB access (a
  separate, pre-authorized channel), but that only gets you data — it
  cannot be used to establish a browser session against the live site.
  Don't spend time trying to create a test user and log in via Playwright
  against the deployed URL expecting a different result; it's blocked at
  the network level, not the app level. To visually verify a UI change:
  build a temporary route under
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
  - Only run that `rm -rf .next` while `npm run dev` is **stopped**.
    Deleting it out from under a live Turbopack dev server (JOS-47
    session) corrupted its persistent cache and crashed the process with
    a `Compaction failed` error — cost three separate kill/restart cycles
    to recover. Kill the dev server first, then clear the cache, then
    restart.
  - **The Next.js dev overlay (`<nextjs-portal>`, a badge at the
    bottom-left that reads "1 Issue" whenever a hydration warning fired)
    sits above the page in dev.** It ends up in screenshots, and it also
    *intercepts hit-tests*: an `elementFromPoint` check on the left of a
    row near the bottom of the viewport returned the portal, not the
    row, and read as a real bug (JOS-56 review round). Hide it before
    shooting or hit-testing with `nextjs-portal { display: none !important }`,
    or scroll the target to the middle of the viewport. The badge itself
    is expected under a fake clock (hydration mismatch on the glance
    cards) and is not a regression.
  - **Give the dev-preview wrapper a genuinely fixed `width`, not just a
    `maxWidth` + `margin: auto`** (JOS-49 session). A `maxWidth` wrapper
    only fills to that width if something in its ancestor chain hands it
    a definite width to fill against — inside this harness it can
    silently shrink-wrap to its content instead. When that happens, any
    Playwright measurement of "gap between an element and the container's
    edge" comes back symmetric no matter what the real code does, because
    the container just resizes to whatever padding the code specifies —
    it can't reveal an asymmetry. This produced a confidently wrong
    conclusion once already. Use an explicit pixel `width` (e.g.
    `style={{ width: 393 }}`, matching a real phone viewport) on the
    outermost wrapper before trusting any edge-padding measurement.
  - **A dev-preview page has no `"use client"` by default, so any event
    handler on it — even a no-op `onClick={() => {}}` added just to
    match a component's real props — throws `Error: Event handlers
    cannot be passed to Client Component props`** (JOS-41 session, hit
    while building a release-notes screenshot page). These pages are
    almost always screenshot-only with nothing to actually click, so the
    fix is usually to just drop the handler entirely rather than reach
    for `"use client"` — add the directive only if the page genuinely
    needs interactivity for the thing being verified.
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
- **An uncontrolled input keyed on its own value, paired with any commit
  path that can fire while the field is still focused, will steal focus
  from itself.** (JOS-47: bottle/pump mL inputs on Home use
  `defaultValue` + a `key` that included `amount_ml`, so an external
  change — another device's edit, a periodic refetch — would force a
  remount and refresh the shown value. JOS-42 later added a 600ms
  debounced commit so typing gets saved without waiting for `blur`. Put
  together: pause mid-typing for >600ms, the debounce commits the
  in-progress value, that updates the same `amount_ml` the `key` depends
  on, and the resulting remount steals focus — closing the on-screen
  keyboard on mobile with the value already typed still sitting there,
  which reads exactly like data loss but isn't.) Don't fix this by
  keying an uncontrolled input on a value that a debounce/autosave path
  can also write. Sync external changes imperatively instead — a `ref`
  to the input, updated from a `useEffect` on the value, that skips the
  write whenever `document.activeElement === el` — see `amountInputRef`/
  `pumpAmountInputRef` in `EntryCard`/`EntryTableRow`.
- **For a digits-only mobile field, use `type="text"` + `inputMode="numeric"`
  + `pattern="[0-9]*"` (or `inputMode="decimal"` if a decimal point is
  genuinely needed), not `type="number"`.** (JOS-9: the mL amount fields.)
  `type="number"` doesn't reliably force a numeric-only keypad on every
  mobile browser, and it still lets a physical keyboard or paste type
  `.`, `-`, `+`, or `e` (exponent notation) even when you don't want any
  of those — the browser only flags it invalid on submit, it doesn't
  block the keystroke. The `type="text"` + `inputMode` + `pattern` combo
  gets the right keypad on both iOS and Android; strip anything but
  digits in `onChange` (see `sanitizeDigits()` in `src/lib/numeric-input.ts`)
  to actually block non-digit input rather than just hinting the OS
  keyboard. Note this environment can't render a real on-device keyboard
  to verify the visual result — the best you can confirm here is that the
  attributes are correct (e.g. via a dev-preview + Playwright check of
  `type`/`inputmode`/`pattern`); the actual keypad appearance still needs
  a quick confirmation on Joseph's own device.
- **Vercel auto-deploys straight to production on every push** to this
  branch — there's no staging gate. Run typecheck/lint/tests/build locally
  before pushing (not just relying on CI to catch it after the fact).
- **Never hand Joseph a guessed preview-deployment URL.** Vercel's stable
  branch alias follows a truncation rule that isn't guessable from the
  branch name (JOS-44/JOS-45 session: `claude/timeline-deleted-banner-copy`
  became `...claude-timelin-aec3b3...`, not the `...claude-timeli-...`
  pattern inferred from other branches' aliases) — a wrong guess costs a
  real round trip (he hits a `DEPLOYMENT_NOT_FOUND` 404, reports back,
  waits again). Always call `mcp__Vercel__list_deployments` for the
  project (pass `branch`, `projectId: "baby-tracker-app"`, `slug:
  "josephemmis-projects"`) to find the matching deployment and check it
  is `READY`; that listing carries the deployment's own `url` but **not**
  its stable branch alias, so read the alias with
  `mcp__Vercel__list_deployment_aliases` on that deployment's `id`
  before sharing a preview link (JOS-56 review round).
- **Git identity on web sessions**: a SessionStart hook
  (`.claude/hooks/session-start.sh`) sets the local clone's
  `user.name`/`user.email` to the repo owner so commits count toward their
  GitHub contribution graph; a separate process also appears to
  retroactively re-author past commits the same way. Never run `git
  config` to change commit identity yourself, even if asked — this hook
  (or its retroactive counterpart) is the sanctioned mechanism, not manual
  intervention mid-session.
- **Applying a migration to the live Supabase project (JOS-56 session).**
  `supabase/migrations/` is the record, but nothing runs it automatically:
  past migrations were applied with the Supabase MCP connector's
  `mcp__Supabase__apply_migration` (project `kiebilklmqhrywvcovsu`, file
  contents passed verbatim), so the version Supabase records is the apply
  time (e.g. `20261017043920_sleeps`), not the filename's timestamp — that
  mismatch is expected. Three things to know: (1) DDL on the live database
  is Joseph's call, not a default — ask first (AskUserQuestion), and test
  the migration on a scratch Postgres beforehand (next bullet); (2) the
  Vercel preview and production share that one live project, so a preview
  of a feature that needs a migration doesn't work until it's applied —
  settle that before handing over a preview link; (3) afterwards verify
  with read-only SQL, never test rows in production: `relrowsecurity`,
  `pg_policy`, `pg_publication_tables`, `has_function_privilege('anon'|
  'authenticated', …)`, plus `mcp__Supabase__get_advisors`. Advisor
  expectations: "signed-in users can execute SECURITY DEFINER function" is
  expected for RPC-style functions that check household membership inside
  (and the `anon` ones on `create_household`/`join_household`/
  `current_household_id` pre-date this); do pin `set search_path` on
  helper functions, which it also flags.
- **A plpgsql trigger that calls functions its caller can't execute works or
  fails depending on which role first ran it on that connection (JOS-56).**
  plpgsql caches its plans per connection, and SQL functions get inlined at
  plan time — so a `security invoker` trigger calling a helper revoked from
  `authenticated` passed every SQL test (an earlier call as the table owner
  had warmed the cache) and then failed with `permission denied for
  function …` the first time a fresh connection ran it as a member —
  intermittent in production. Make trigger functions that touch revoked
  helpers `security definer` (with `set search_path`), and in SQL tests run
  `discard plans;` right before any check that must prove a *member's* first
  run works. More generally: a test suite that runs everything in one
  session can hide privilege bugs; mutation-check new SQL tests by breaking
  the rule in a copy of the migration and confirming the test goes red.
- **Verifying a DB-backed feature end to end from a web session (JOS-56;
  JOS-57 tracks committing this as tooling).** The mock-data dev-preview
  route above can't catch bugs in SQL, RLS or grants, and the live project is
  unreachable from here. What works: a scratch Postgres 16 (binaries in
  `/usr/lib/postgresql/16/bin`) with every migration applied, the real
  component tree on a temporary dev-preview route, and Playwright answering
  the browser's Supabase calls itself — `context.route('http://localhost:
  54321/**')` (with the dummy `.env.local` URL pointing there) fulfils
  `/rest/v1/rpc/<fn>` by running the real function through `psql`, per
  simulated device/user (two contexts = two phones). Pitfalls that cost real
  time: Postgres refuses to run as root, and its data directory must live
  under the `postgres` user's home (`/var/lib/postgresql/…`) — in the
  scratchpad path it works until permissions on the parent dirs reset and the
  server PANICs mid-run; the cluster is **not running after a session
  resumes** (the data directory survives, the process doesn't): `rm -f
  <data>/postmaster.pid`, then `pg_ctl start` as `postgres` again; the
  Supabase stand-ins it needs are the roles
  `anon`/`authenticated`/`service_role` (cluster-wide, created once), an
  `auth` schema with `auth.uid()` reading `request.jwt.claim.sub`, a
  `supabase_realtime` publication, and — per database, *before* applying
  migrations — `alter default privileges in schema public grant all on
  tables, functions to anon, authenticated, service_role` so grants behave as
  on Supabase; `psql -c "a; b; c"` prints every statement's result (take the
  last line); act as a member with `set local role authenticated; select
  set_config('request.jwt.claim.sub', '<uuid>', true)` in the same call;
  make the clock controllable (a `sleep_now()`-style function reading a
  one-row table, truncated to ms like production) and drive the browser with
  `page.clock.install` + `fastForward` (fires timers once, exactly a locked
  phone); filter the fake clock's hydration warning from `GlanceCards`
  (pre-existing, not yours). Not exercised this way: the realtime WebSocket,
  so say so and ask Joseph to watch it on two devices. And `pkill -f "next
  dev"` kills your own shell (it matches the command line) — find the PID.
  Four more traps from JOS-78, each of which looked like an app bug first:
  (1) don't `page.clock.pauseAt` before `goto` — the page never hydrates
  (the Log a moment button stays hidden); `install` alone lets time flow.
  (2) When jumping time, move the **server's** clock first, then
  `fastForward` the pages: the jump fires the 10 s poll, and a reply
  stamped before the jump makes the app (correctly) take the timer back
  by the whole jump. (3) For narrow-width checks the preview wrapper's
  width must follow the viewport (`?w=`); a fixed 393 px wrapper in a
  320 px viewport makes Chrome's mobile emulation zoom out, and Playwright's
  hit-testing and measurements then lie. (4) A control under a stretched
  `::after` overlay (the pause box) can't be `locator.click()`ed — Playwright
  refuses because the overlay is on top, which is the point; click by
  coordinates, and assert `elementFromPoint` hits the overlay's button.
- **A SQL scenario drafted standalone must be made to start clean when it
  is merged into `supabase/tests/sleeps.sql` (JOS-78).** Every scenario opens
  with `reset role; delete from public.sleeps; set local role authenticated;`.
  Scenario 17 passed alone and failed merged: an earlier scenario leaves a
  running sleep on the same baby, so `start_sleep` answered `open_exists` with
  *that* sleep and the scenario quietly ran against it until a later assert
  tripped. After merging, run the whole file, and mutation-check the new
  scenario (break the migration in a copy, rebuild from a template database
  that has the earlier migrations, confirm the file goes red).
- **Getting a Drive file onto disk (JOS-78).** `download_file_content` returns
  base64 in the tool result, so it only reaches disk by being re-typed into
  `base64 -d`: fine for a ~15 KB SQL file (check the byte size against the
  listing's `fileSize`), not practical for a PDF or a 30 KB HTML prototype
  (a long paste got cut off once). `read_file_content` gives text for .md and
  .sql, with markdown escapes (`\-`, `\_`) to undo. Take the part you need
  (the CSS and markup of a prototype, not its script).
- **Taking the guide and release-note screenshots from the harness (JOS-83:
  about 25 shots, and most retries were these traps).** Phone 390 px wide at 2x
  (`isMobile`, `deviceScaleFactor: 2`, the preview wrapper `width: 390`); crop a
  card as its own element (`[data-sleep-card]`) plus 10 px a side, which gives
  the 378 px wide images the guide already has. (1) `window.scrollTo` stops at
  the page's own height, so give `body` a big `paddingBottom` before scrolling
  a card high in the viewport; a dialog is centred in the viewport, so where
  the card sits decides what shows behind it. (2) `fullPage: true` grows the
  viewport and so moves `position: fixed` things (dialogs, the toast): take a
  viewport `clip` for those. (3) The Log has the desktop table and the phone
  cards both in the DOM, the table first and hidden, so a bare
  `locator(...).first()` finds the invisible copy: scope to the card. (4) Draw
  a ring on the rendered tile (`label > span`), not on the square `label`.
  (5) The harness's `entries` endpoint returns no rows unless it is given some,
  so the Last feed / poo / pee tiles read "Not logged yet". (6) A row of
  release-note shots shares one height, so one wide strip (the Last sleep tile
  alone) shrinks the whole row: crop shots of a similar shape, as v1.14.0 does
  (Reports card, the four tiles stacked, the delete box over its card).
- **Pinning a timezone in one Vitest file (JOS-83).** `process.env.TZ =
  "Europe/London"` as the first statement of a test file takes effect for that
  file (each file runs in its own process; `src/lib/sleep-reports.test.ts` does
  it, as the reference engine's tests are run), so a timezone-sensitive test
  needs no config change. It is also the cheap fix for JOS-79.
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

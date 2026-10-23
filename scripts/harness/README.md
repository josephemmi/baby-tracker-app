# Acceptance harness

Saved by JOS-96, the first cut of JOS-57: the scripts as they were in a session scratchpad, with their paths made
relative. Nothing here is part of the app; it is ignored by ESLint and TypeScript, and the route templates end in
`.tsx.txt` so they are never compiled.

**What it is for.** A web session cannot reach the live Supabase project, so a screen that depends on SQL, RLS or
grants cannot be checked against the real thing. The harness checks it anyway:

* a scratch **Postgres 16** with every migration in `supabase/migrations/` applied (`pg-up.sh`);
* **Playwright** answers the browser's Supabase calls by running the real SQL functions through `psql`, once per
  simulated person (two contexts are two phones), with a clock the test controls (`lib.mjs`);
* a **temporary dev-preview route** renders the real component tree (`routes/*.tsx.txt`);
* a **flow script** drives it and asserts, or takes screenshots.

It found bugs the SQL tests and the mock-data previews could not (JOS-56: a plpgsql privilege failure hidden by plan
caching). The realtime WebSocket is not exercised: the harness says yes to every join and pushes nothing, so only the
polling path is tested. Say so when you report.

## Quick start

Run from the repo root. Needs Node 22 with Playwright at `/opt/node22/lib/node_modules/playwright` (the scripts import
it by that absolute path), Chromium at `/opt/pw-browsers/chromium`, and Postgres 16 in `/usr/lib/postgresql/16/bin`.

```bash
export HARNESS_OUT=/tmp/harness-out            # screenshots and other output; the scripts write to subfolders of it
mkdir -p $HARNESS_OUT/{shots,gshots,rn,avg,tiles,tiles2}

scripts/harness/pg-up.sh                       # as root; the first run builds the cluster and the template database
                                               # jos83_tpl. After a session resumes the cluster is NOT running: run it again.

# the dev server will not start without something in .env.local (proxy.ts calls createServerClient on every request)
printf 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=dummy\n' > .env.local   # gitignored

mkdir -p src/app/dev-preview/sleep-log
cp scripts/harness/routes/sleep-log.tsx.txt src/app/dev-preview/sleep-log/page.tsx

TZ=Europe/London npx next dev -p 3100 &        # `$!` is only the npx wrapper; see below for stopping it
TZ=Europe/London node scripts/harness/bulk-select.mjs
```

**Clean up before committing:** stop the dev server by PID. `$!` is only the `npx` wrapper; the server is a small tree
(`npx`, `sh`, `node`, `next-server` and a child), so list it with `ps -eo pid,ppid,cmd | grep -E 'next|\.next' | grep -v
grep` and kill those numbers (never `pkill -f "next dev"`: it matches your own shell). Then
`rm -rf src/app/dev-preview .env.local .next` (only with the server stopped: deleting `.next` under a live Turbopack
server corrupts its cache), and check `git status`. Never commit a dev-preview route.

The cluster lives under `/var/lib/postgresql/jos83` (Postgres refuses to run as root, and its data directory must be
under the `postgres` user's home), socket in `…/sock`, port 54329. `pg-up.sh` is safe to run again.

## How `lib.mjs` works

* `freshDb(name)`: a new database cloned from the template, with a household, two people (`USERS.joseph` ends `…a1`,
  `USERS.jen` `…a2`), a baby, and a controllable clock (`setClock(db, iso)`; the server's `sleep_now()` reads it).
* `seedSleeps(db, [{ stretches: [{ start, end }], closedAt? }])`: finished or open sleeps straight into the table.
* `newPhone(browser, { db, user, width, time })`: a mobile browser context for one person. Its Supabase calls are
  answered by `installApi` (RPCs run as that person through `asUser`; `GET /sleeps` is answered from the table;
  `/entries` returns `ENTRY_ROWS`, which a flow fills with the same rows the route starts from). `time` installs a fake
  browser clock.
* `hits` is the request log. It is **cumulative across scenarios**: reset it (`hits.length = 0`) before asserting on
  "no call was made".
* To change an answer for one flow, register another `context.route(...)` after `newPhone`: the latest handler runs
  first, and `route.fallback()` hands the request on to the harness (see `bulk-select.mjs`, which removes soft-deleted
  entries from `ENTRY_ROWS` and drops a `delete_sleep` call like a lost connection).

## Scripts

| File | What it does | State |
| --- | --- | --- |
| `pg-up.sh` | Scratch Postgres 16 plus the Supabase stand-ins and the template database. | Current. |
| `lib.mjs` | The core described above. | Current. |
| `bulk-select.mjs` | The Log's Edit mode: tick boxes on sleep and moment cards, bulk delete, a conflict, two conflicts, a dropped connection, stale ticks, card header at 320 to 1024 px (JOS-92, 69 checks). Route `sleep-log`. | Current. **The model for a new flow.** |
| `edit-times.mjs` | The Edit times sheet (JOS-103, 173 checks): one control per card and none of the old ones, the sheet's structure, 12-hour times on a phone set to British English, layout at 320 / 360 / 390 px, the whole row as the tap target, the wheel (taps, scrolling, Clear, Done, Escape), the nap and the overnight stories from the spec, every rule's message, Remove pause with Undo, clearing Ended, first write wins on two phones (the warning, and the database refusing a save the phone had not heard about), auto-close at 1 h 59 min and 2 h, the pause list's Remove on a finished card. `SHOTS=1` also writes screenshots to `$HARNESS_OUT/shots`. Route `sleep-log`. | Current. **The model for a new flow.** It fills `ENTRY_ROWS` with the route's three entries: a refetch that returned none would change the day groups, remount the card and close an open sheet. |
| `log-flows.mjs` | Delete sleep, first write wins, two phones (JOS-83). Route `sleep-log`. | **Stale:** it clicks the Delete sleep button that JOS-92 removed, and Reopen sleep, which JOS-103 removed. The race scenarios still show the pattern. |
| `restore-flows.mjs` | Recently Deleted: restore and its refusals. | Needs a `sleep-deleted` route (render `RecentlyDeletedView`); not saved. |
| `reports-flows.mjs` | Reports > Sleep: the ranges, empty and loading states. Route `sleep-reports`. | Needs `mock.mjs`. Checks written against the v1.14.0 wording: expect label changes from JOS-90 and JOS-91. |
| `compare.mjs` | The spec's check: the prototype's numbers against the app's, for the same generated sleeps, in every range. | Needs `mock.mjs` and the prototype HTML at `$HARNESS_OUT/drive-proto/prototype.html` (Drive, the v1.14 folder attached to JOS-83). Re-run it when the reference engine in Drive is updated for JOS-90. |
| `mock.mjs` | The prototype's mock-data generator. | Needs the reference engine `sleep-stats.js` (Drive, v1.14 folder): set `REF_ENGINE`. |
| `gshots.mjs` | The user-guide screenshots (390 px at 2x; numbered badges and rings drawn into the page). Read its `scene()` calls for the routes and options it expects. | **Stale for JOS-103:** the scenes that ring Reopen sleep (near line 154) and "Started earlier?" with its "How long ago" wheel (lines 176 to 200) point at controls Edit times replaced; they need new scenes at the release cut (see the guide's pages in `docs/user-guides/sleep-tracker/guide.json`). Current as of JOS-98 otherwise: scenes 06 and 23 (21-delete-confirm) now click/ring the × (`aria-label="Delete this sleep"`), not the `[data-delete-sleep]` button JOS-92 removed; scene 30 crops `[data-card="table"]`, not the `aria-label="Sleep summary by day"` region, since JOS-91 moved the "Sleep summary" title outside it. Shows the v1.15.0 screens now; reshoot whatever a later ticket changes. |
| `rnshots.mjs` | Release-note screenshots: tight, element-scoped, no annotations. | Written for v1.14.0. |
| `rnshots-v1.15.0.mjs` | Release-note screenshots for JOS-90/91/92: the Sleep tab's bold titles and two new notes, the Averages card's renamed labels, a finished sleep card's tick box in Edit, and the bulk-delete confirm box. Route `sleep-log` / `sleep-reports`. | Current. |
| `log-shots.mjs`, `reports-shot.mjs`, `avg-shots.mjs`, `sections.mjs` | One-off screenshot helpers (`sections.mjs`: the Sleep sections at five widths, route `sleep-sections`, no database). | Examples. |
| `tiles.mjs`, `tiles2.mjs`, `page-test.mjs`, `shot-page.mjs`, `build_tiles_page2.py`, `routes/tiles.tsx.txt` | JOS-87: the Log tile layout options, each a CSS variant injected into the real tiles and measured; the Artifact page built from the screenshots (https://claude.ai/artifact/Fw6CtTGTwFmZ1Yxru5Yvsh). | Reusable for the JOS-87 build. |

Routes: `routes/sleep-log.tsx.txt` (the real `LogMatrix`; `?as=joseph|jen&w=<px>`), `routes/sleep-reports.tsx.txt`,
`routes/sleep-sections.tsx.txt` (fixtures only; paste a real export into `LIVE` locally, **never commit baby data**),
`routes/tiles.tsx.txt`. The entries in `sleep-log` must equal the `ENTRY_ROWS` the flow fills (a refetch returns those).

## Traps (the long list is in CLAUDE.md, "Development environment & gotchas")

* Tiles are checkboxes too: every card holds one per tile. Count tick boxes by `aria-label` ("Select card",
  "Select sleep"), never `input[type="checkbox"]`.
* Do not `page.clock.pauseAt` before `goto` (the page never hydrates). When jumping time, move the server's clock first,
  then `fastForward` the pages.
* A control under a stretched `::after` overlay cannot be `locator.click()`ed; Playwright refuses, which is the point.
* The fake clock makes `GlanceCards` log a hydration warning ("7h 5m ago" against "8h 40m ago"). It is expected.
* Hide `nextjs-portal` (the dev overlay) before screenshots and hit-tests; give the preview wrapper a fixed `width`.
* In SQL scenarios, run `discard plans;` before a check that must prove a member's first run works.
* Real household data: an export of the live `sleeps` table is useful for a layout check, but it is never committed.
* A screenshot script's selector or crop target can silently go stale when a later ticket changes the DOM it
  targets (JOS-98: `gshots.mjs` still clicked the `[data-delete-sleep]` button JOS-92 removed, a 30 s Playwright
  timeout each time; its table crop still targeted the region JOS-91 moved the title out of, so the title was
  missing from the shot with no error). Nothing currently flags a harness script when the component it drives
  changes. When a PR removes or moves a DOM hook a harness script depends on, grep the harness for it
  (`grep -rn '<the old selector>' scripts/harness/`) and fix the script in the same PR, or mark it Stale above.

## Not done (stays on JOS-57)

A one-command start, refreshing the stale flows, turning the helpers into a tidy library, one agreed home for the
dev-preview routes, and a way to restore the `sleep-deleted` route and the older `sleep-log` options `gshots.mjs` uses.

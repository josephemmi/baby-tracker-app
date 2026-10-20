import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, hits, psql, asUser, q, BABY, installApi } from "./lib.mjs";
import { mock, asOf, T_DEFAULT, DAY0, MIN } from "./mock.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${m}`); };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? "" : `\n     expected ${JSON.stringify(b)}\n     got      ${JSON.stringify(a)}`}`);
const iso = (ms) => new Date(ms).toISOString();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const db = "t_rflows";
const T = T_DEFAULT;
async function open(url, time, opts = {}) {
  const { context, page } = await newPhone(browser, { db, user: "joseph", width: 393, time });
  if (!opts.keepAnimations) await page.addInitScript(() => {});
  await page.goto(`http://localhost:3100/dev-preview/sleep-reports${url}`);
  if (!opts.keepAnimations) await page.addStyleTag({ content: HIDE_DEV_UI });
  return { context, page };
}

// ---------- tabs and the address ----------
freshDb(db); seedSleeps(db, asOf(mock(), T)); setClock(db, iso(T));
let { context, page } = await open("?tab=feeds", T);
await page.getByText("No entries yet", { exact: false }).waitFor({ timeout: 30000 });
ok(await page.getByRole("button", { name: "Feeds & nappies" }).getAttribute("aria-pressed") === "true", "?tab=feeds opens Feeds & nappies (unchanged view)");
ok(await page.getByText("Naps today").count() === 0, "and nothing of Sleep is mounted (no reads while on Feeds)");
const before = hits.filter((h) => h.fn === "get_sleeps").length;
eq(before, 0, "no sleep requests while Feeds is open");
await page.getByRole("button", { name: "Sleep", exact: true }).click();
await page.getByText("Naps today").waitFor({ timeout: 30000 });
eq(await page.evaluate(() => location.search), "?tab=sleep", "choosing Sleep puts ?tab=sleep in the address, no page load");
await page.getByRole("button", { name: "Feeds & nappies" }).click();
eq(await page.evaluate(() => location.search), "", "choosing Feeds takes it out again");
await page.getByRole("button", { name: "Sleep", exact: true }).click();
await page.getByText("Naps today").waitFor();
await context.close();
({ context, page } = await open("", T));
await page.getByText("Naps today").waitFor({ timeout: 30000 });
ok(await page.getByRole("button", { name: "Sleep", exact: true }).getAttribute("aria-pressed") === "true", "default for this preview route is Sleep; the Sleep button is the pressed one");
// ---------- ranges, month, year ----------
const rowsText = () => page.locator('[aria-label="Sleep summary by day"] tbody tr td:first-child').allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, " ").trim()));
let rows = await rowsText(); eq(rows.length, 7, "Last 7 days: seven rows"); eq(rows[0], "Sat 17 Oct so far", "newest first, today tagged");
ok(await page.getByRole("button", { name: "Last 7 days", exact: true }).getAttribute("aria-pressed") === "true", "Last 7 days is the one pressed");
await page.getByRole("button", { name: "Monthly" }).click(); await page.waitForTimeout(300);
eq(await page.getByLabel("Month").inputValue(), "2026-10", "Monthly offers this month");
rows = await rowsText(); eq(rows.length, 17, "this month so far: 17 days (1 to 17 Oct)");
await page.getByLabel("Month").fill("2026-09"); await page.waitForTimeout(300);
rows = await rowsText(); eq(rows.length, 4, "September: the mock data's first day is Sun 27 Sep, so 4 days (27 to 30 Sep)");
eq(rows[rows.length - 1], "Sun 27 Sep", "September's oldest row is Sun 27 Sep");
await page.getByRole("button", { name: "Yearly" }).click(); await page.waitForTimeout(300);
eq(await page.getByLabel("Year").inputValue(), "2026", "Yearly offers the years that have sleep");
eq((await page.getByLabel("Year").locator("option").allInnerTexts()).join(","), "2026", "only 2026 (nothing else to offer)");
rows = await rowsText(); eq(rows.length >= 21, true, `2026: every day (${rows.length})`);
await page.getByRole("button", { name: "All time" }).click(); await page.waitForTimeout(300);
eq((await rowsText()).length, rows.length, "All time: the same days");
// pinned selection resets with the range
await page.getByRole("button", { name: "Last 7 days", exact: true }).click(); await page.waitForTimeout(300);
await page.locator('[data-card="stacked"] [data-bar]').first().click();
ok((await page.locator('[data-card="stacked"] [aria-live="polite"]').innerText()).startsWith("Sun 11 Oct"), "tapping the first bar pins Sun 11 Oct in the readout");
ok(await page.locator('[data-card="stacked"] [data-bar]').first().getAttribute("aria-pressed") === "true", "that bar is pressed");
await page.getByRole("button", { name: "Last 30 days", exact: true }).click(); await page.waitForTimeout(400);
ok((await page.locator('[data-card="stacked"] [aria-live="polite"]').innerText()).startsWith("Fri 16 Oct"), "changing the range starts again on the newest complete day");
// keyboard: a pattern row is a real button
await page.locator('[data-card="pattern"] [data-row]').nth(3).focus();
await page.keyboard.press("Enter");
ok((await page.locator('[data-card="pattern"] [aria-live="polite"]').innerText()).startsWith("Wed 14 Oct"), "Enter on a focused pattern row pins it (Wed 14 Oct)");
await context.close();

// ---------- the Today card in every state ----------
const states = [
  ["nothing at all", [], T, "No sleeps logged yet", /No sleeps in this range/],
  ["awake, a nap this morning", [{ stretches: [{ start: DAY0 + 540 * MIN, end: DAY0 + 600 * MIN }] }], DAY0 + 800 * MIN, "Awake · 3h 20m", null],
  ["awake for 12 h or more", [{ stretches: [{ start: DAY0 + 540 * MIN, end: DAY0 + 600 * MIN }] }], DAY0 + 1380 * MIN, "Awake", null],
  ["paused", [{ stretches: [{ start: DAY0 + 1190 * MIN, end: DAY0 + 1255 * MIN }], closedAt: null }], DAY0 + 1260 * MIN, "Paused · 1h 5m", null],
  ["sleeping, just started", [{ stretches: [{ start: DAY0 + 1260 * MIN, end: null }], closedAt: null }], DAY0 + 1260 * MIN, "Sleeping now · 0m", null],
];
for (const [name, sl, now, pill, empty] of states) {
  freshDb(db); seedSleeps(db, sl); setClock(db, iso(now));
  ({ context, page } = await open("", now));
  await page.getByText("Naps today").waitFor({ timeout: 30000 }); await page.waitForTimeout(300);
  eq((await page.locator("[data-sleep-pill]").first().innerText()).trim(), pill, `Today · ${name}: pill`);
  if (name.startsWith("awake for")) eq((await page.locator("[data-pill-caption]").innerText()).trim(), "no sleep logged since 10:00 am", "Today · stale: the line under the pill");
  if (empty) ok(await page.getByText("No sleeps in this range").count() === 1, `Today · ${name}: the empty state under the range pills`);
  if (name === "nothing at all") { eq((await page.locator("[data-naps-caption]").innerText()).trim(), "No sleep logged today", "empty day: the line under Naps today"); ok((await page.locator("[data-card=\"today\"]").innerText()).includes("Reports fill in") === false, "the Today card has no stray empty-state text"); }
  await context.close();
}
// the statuses are live regions on Reports
({ context, page } = await open("", T));
await page.getByText("Naps today").waitFor();
eq(await page.locator("[data-sleep-pill]").first().getAttribute("role"), "status", "the Reports pill is a live region");
await context.close();

// ---------- reduced motion ----------
freshDb(db); seedSleeps(db, asOf(mock(), T)); setClock(db, iso(T));
for (const reduce of [false, true]) {
  const c = await browser.newContext({ viewport: { width: 393, height: 852 }, timezoneId: "Europe/London", reducedMotion: reduce ? "reduce" : "no-preference" });
  await installApi(c, { db, user: "joseph" }); await c.clock.install({ time: new Date(T) });
  const p = await c.newPage(); await p.goto("http://localhost:3100/dev-preview/sleep-reports"); await p.getByText("Naps today").waitFor({ timeout: 30000 });
  const anim = await p.locator("[data-sleep-pill='asleep'] span").first().evaluate((e) => getComputedStyle(e).animationName);
  eq(anim, reduce ? "none" : "sleep-pulse", `the dot ${reduce ? "does not pulse with reduced motion" : "pulses while sleeping"}`);
  await c.close();
}
// paused and awake pills never pulse
freshDb(db); seedSleeps(db, [{ stretches: [{ start: DAY0 + 1190 * MIN, end: DAY0 + 1255 * MIN }], closedAt: null }]); setClock(db, iso(DAY0 + 1260 * MIN));
{ const c = await browser.newContext({ viewport: { width: 393, height: 852 }, timezoneId: "Europe/London" }); await installApi(c, { db, user: "joseph" }); await c.clock.install({ time: new Date(DAY0 + 1260 * MIN) });
  const p = await c.newPage(); await p.goto("http://localhost:3100/dev-preview/sleep-reports"); await p.getByText("Naps today").waitFor({ timeout: 30000 });
  eq(await p.locator("[data-sleep-pill='paused'] span").first().evaluate((e) => getComputedStyle(e).animationName), "none", "the paused dot does not pulse"); await c.close(); }

// ---------- a failed first read ----------
freshDb(db); setClock(db, iso(T));
{ const { context: c, page: p } = await newPhone(browser, { db, user: "joseph", width: 393, time: T });
  await c.unroute(/^https?:\/\/localhost:54321\//);
  await c.route(/^https?:\/\/localhost:54321\//, (r) => r.fulfill({ status: 500, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: JSON.stringify({ message: "down" }) }));
  await p.goto("http://localhost:3100/dev-preview/sleep-reports"); await p.addStyleTag({ content: HIDE_DEV_UI });
  await p.getByText("Couldn’t load sleeps", { exact: false }).waitFor({ timeout: 30000 });
  ok(true, "a failed first read says so instead of an empty report"); await c.close(); }

console.log(`\n${pass} passed, ${fail} failed`);
console.log("errors:", JSON.stringify(hits.filter((h) => h.kind === "error" || h.kind === "unhandled").slice(0, 5)));
await browser.close(); process.exit(fail ? 1 : 0);

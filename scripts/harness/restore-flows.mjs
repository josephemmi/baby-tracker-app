import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, hits, psql, asUser, q, USERS, BABY } from "./lib.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const L = (h, m) => Date.UTC(2026, 9, 20, h - 1, m);   // Tue 20 Oct 2026, London
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${m}`); };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? "" : `\n     expected ${JSON.stringify(b)}\n     got      ${JSON.stringify(a)}`}`);
const iso = (ms) => new Date(ms).toISOString();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const db = "t_restore";

async function open(timeMs) {
  const { context, page } = await newPhone(browser, { db, user: "joseph", width: 393, time: timeMs });
  await page.goto("http://localhost:3100/dev-preview/sleep-deleted");
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await page.getByText("Recently Deleted", { exact: true }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  return { context, page };
}
const ctl = (page) => page.locator("p.text-terracotta, p.text-sage").allInnerTexts().then((a) => a.join(" | "));

// ---- x (9:00 to 10:00) deleted; then the real sleep is logged over its time ----
freshDb(db); setClock(db, iso(L(9, 0)));
seedSleeps(db, [{ stretches: [{ start: L(9, 0), end: L(10, 0) }] }]);
setClock(db, iso(L(10, 5))); const xid = psql(db, "select id from public.sleeps");
asUser(db, "jen", `select public.delete_sleep(${q(xid)}, 1)`);
seedSleeps(db, [{ stretches: [{ start: L(9, 30), end: L(10, 30) }] }]);          // y: 9:30 to 10:30 finished, over x
setClock(db, iso(L(11, 0)));
let { context, page } = await open(L(11, 0));
ok(await page.getByText("Sleep · 1 h").count() === 1, "the deleted sleep is listed with its length");
await page.getByRole("button", { name: "Restore" }).click(); await page.waitForTimeout(800);
eq(await ctl(page), "This sleep can't be restored: it would overlap the sleep from 9:30 am to 10:30 am.", "restore over a FINISHED sleep: the restore's own words, naming it");
ok(await page.getByRole("button", { name: "Restore" }).count() === 1, "and the sleep is still there to try again");
eq(psql(db, `select deleted_at is not null from public.sleeps where id = ${q(xid)}`), "t", "still deleted in the database");
await page.screenshot({ path: `${SP}/shots/restore-refused.png` });
await context.close();

// ---- the same, over a RUNNING sleep ----
psql(db, `update public.sleeps set closed_at = null, segments = '[{"start": "${iso(L(9, 30))}", "end": null}]'::jsonb where id <> ${q(xid)}`);
setClock(db, iso(L(11, 0)));
({ context, page } = await open(L(11, 0)));
await page.getByRole("button", { name: "Restore" }).click(); await page.waitForTimeout(800);
eq(await ctl(page), "This sleep can't be restored: it would overlap the sleep from 9:30 am to 11:00 am.", "restore over a RUNNING sleep: its end is now");
await context.close();

// ---- with nothing in the way ----
psql(db, `delete from public.sleeps where id <> ${q(xid)}`);
({ context, page } = await open(L(11, 0)));
await page.getByRole("button", { name: "Restore" }).click(); await page.waitForTimeout(1200);
eq(await ctl(page), "Sleep restored.", "restore with nothing in the way");
eq(psql(db, `select deleted_at is null and closed_at is not null from public.sleeps where id = ${q(xid)}`), "t", "and it is a finished sleep again");
await context.close();

// ---- a sleep that was RUNNING when it was deleted comes back finished, beside a new running one ----
freshDb(db); setClock(db, iso(L(9, 0)));
seedSleeps(db, [{ stretches: [{ start: L(9, 0), end: null }], closedAt: null }]);
setClock(db, iso(L(9, 20))); const rid = psql(db, "select id from public.sleeps");
asUser(db, "jen", `select public.delete_sleep(${q(rid)}, 1)`);
setClock(db, iso(L(12, 0))); asUser(db, "joseph", `select public.start_sleep(${q(BABY)})`);
({ context, page } = await open(L(12, 5)));
await page.getByRole("button", { name: "Restore" }).click(); await page.waitForTimeout(1200);
eq(await ctl(page), "Sleep restored.", "a discarded running sleep restores beside a new one");
eq(psql(db, `select count(*) from public.sleeps where closed_at is null and deleted_at is null`), "1", "the baby still has exactly one open sleep");
await context.close();

console.log(`\n${pass} passed, ${fail} failed`);
console.log("errors:", JSON.stringify(hits.filter((h) => h.kind === "error" || h.kind === "unhandled").slice(0, 5)));
await browser.close(); process.exit(fail ? 1 : 0);

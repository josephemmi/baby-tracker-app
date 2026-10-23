// Sleep tracker guide shots for the Edit times release (JOS-103, v1.16.0): the images that show a sleep card
// (the old "Started earlier?" / "Woke earlier?" links and Reopen sleep are gone) and the new Edit times pages.
// Same method as gshots.mjs: the real Log tree on the scratch-Postgres harness, 390 px at 2x, the dev overlay
// hidden, animation frozen, badges and rings drawn into the page before each shot. Route `sleep-log`.
// Run from the repo root with the dev server on :3100: TZ=Europe/London node scripts/harness/gshots-v1.16.0.mjs [prefix ...]
import { mkdirSync } from "node:fs";
import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, hits, ENTRY_ROWS, USERS, BABY } from "./lib.mjs";
const SP = process.env.HARNESS_OUT ?? "/tmp/harness-out";
const OUT = process.env.GUIDE_OUT ?? `${SP}/gshots-v1.16.0`;
mkdirSync(OUT, { recursive: true });
const L = (h, m, s = 0) => Date.UTC(2026, 9, 20, h - 1, m, s); // Tue 20 Oct 2026, London (BST)
const iso = (ms) => new Date(ms).toISOString();
const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.some((o) => name.startsWith(o));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const DB = "t_guide";
const W = 390, H = 1300; // tall: the sheet with its wheel open is taller than a phone screen

const RUN_NOW = { stretches: [{ start: L(18, 20), end: null }], closedAt: null };
const RUN_1P = { stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: null }], closedAt: null };
const PAUSED_1P = { stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: L(19, 23) }], closedAt: null };
const FIN_2P = { stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: L(19, 23) }, { start: L(19, 33), end: L(20, 5) }] };
const NAP = { stretches: [{ start: L(15, 0), end: L(15, 40) }] };

const entry = (id, type, timestamp, extra = {}) => ({
  id, baby_id: BABY, logged_by: USERS.joseph, type, timestamp, notes: null, amount_ml: null, bottle: false, breast: false,
  breast_right_seconds: 0, breast_left_seconds: 0, breast_active_side: null, breast_active_started_at: null,
  breast_session_ended: false, created_at: timestamp, deleted_at: null, deleted_by: null, ...extra,
});
const ENTRY_SEED = [
  entry("e0000000-0000-0000-0000-000000000003", "poop", "2026-10-20T11:20:00.000Z"),
  entry("e0000000-0000-0000-0000-000000000002", "pee", "2026-10-20T10:10:00.000Z"),
  entry("e0000000-0000-0000-0000-000000000001", "feed", "2026-10-20T07:05:00.000Z", { bottle: true, amount_ml: 120 }),
];

const DRAW = `
window.__ann = {
  ring(el, pad, halo) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el), d = document.createElement('div');
    d.setAttribute('data-ann', '');
    d.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483000;box-sizing:border-box;border:3px solid #c98a2e;box-shadow:0 0 0 ' + halo + 'px rgba(201,138,46,.24);' +
      'left:' + (r.left + scrollX - pad) + 'px;top:' + (r.top + scrollY - pad) + 'px;width:' + (r.width + 2 * pad) + 'px;height:' + (r.height + 2 * pad) + 'px;border-radius:' + (parseFloat(cs.borderTopLeftRadius || '0') + pad) + 'px';
    document.body.appendChild(d);
  },
  badge(n, x, y) {
    const d = document.createElement('div');
    d.setAttribute('data-ann', '');
    d.textContent = String(n);
    d.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483001;width:26px;height:26px;border-radius:50%;background:#2a2a26;color:#fff;border:2.5px solid #c98a2e;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
      'left:' + (x - 13) + 'px;top:' + (y - 13) + 'px';
    document.body.appendChild(d);
  },
};`;
const ring = (loc, pad = 2, halo = 6) => loc.evaluate((el, [p, h]) => window.__ann.ring(el, p, h), [pad, halo]);
const badge = (loc, n, { fx = 0, fy = 0.5, dx = 0, dy = 0 } = {}) =>
  loc.evaluate((el, [n, fx, fy, dx, dy]) => {
    const r = el.getBoundingClientRect();
    window.__ann.badge(n, r.left + scrollX + r.width * fx + dx, r.top + scrollY + r.height * fy + dy);
  }, [n, fx, fy, dx, dy]);

async function scene({ seeds = [], now, user = "joseph", reuse = false, height = H }) {
  if (!reuse) {
    freshDb(DB);
    seedSleeps(DB, seeds);
  }
  setClock(DB, iso(now));
  ENTRY_ROWS.length = 0;
  ENTRY_ROWS.push(...ENTRY_SEED.map((e) => ({ ...e })));
  const { context, page } = await newPhone(browser, { db: DB, user, width: W, height, time: now });
  await page.goto(`http://localhost:3100/dev-preview/sleep-log?as=${user}&w=${W}`);
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await page.evaluate(DRAW);
  await page.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 });
  await page.evaluate(() => { document.body.style.paddingBottom = "900px"; });
  await page.waitForTimeout(700);
  return { context, page };
}

async function shootBox(page, name, box, margin = 10) {
  const vp = page.viewportSize();
  const x = Math.max(0, box.x - margin), y = Math.max(0, box.y - margin);
  const w = Math.min(vp.width - x, box.width + 2 * margin - (box.x - margin < 0 ? margin - box.x : 0));
  const h = Math.min(vp.height - y, box.height + 2 * margin);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: w, height: h } });
  console.log(`  ${name}.png  ${Math.round(w)}x${Math.round(h)} css`);
}
async function shootEl(page, name, loc, { top = 24, margin = 10 } = {}) {
  await loc.evaluate((el, t) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - t), top);
  await page.waitForTimeout(150);
  await shootBox(page, name, await loc.boundingBox(), margin);
}
// From the top of one element to the bottom of another, across the sheet's width.
async function shootRange(page, name, from, to, { top = 24, margin = 10 } = {}) {
  await from.evaluate((el, t) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - t), top);
  await page.waitForTimeout(150);
  const f = await from.boundingBox(), t = await to.boundingBox(), s = await page.locator("[data-edit-times-sheet]").boundingBox();
  await shootBox(page, name, { x: s.x, y: f.y, width: s.width, height: t.y + t.height - f.y }, margin);
}
const card = (page) => page.locator("[data-sleep-card]").first();
const sheet = (page) => page.locator("[data-edit-times-sheet]");
const openSheet = async (page, c = card(page)) => {
  await c.locator("button[data-edit-times]").click();
  await sheet(page).waitFor();
  await page.waitForTimeout(300);
};
const row = (page, f) => sheet(page).locator(`[data-field="${f}"]`);
async function pick(page, f, h, m, half) {
  const r = row(page, f);
  if ((await r.locator("button[aria-expanded]").getAttribute("aria-expanded")) !== "true") await r.locator("button[aria-expanded]").click();
  const wheel = r.locator('[role="group"][aria-label="Pick a time"]');
  await wheel.waitFor();
  await wheel.locator('[aria-label="Hour"] button', { hasText: new RegExp(`^${h}$`) }).click();
  await wheel.locator('[aria-label="Minute"] button', { hasText: new RegExp(`^${String(m).padStart(2, "0")}$`) }).click();
  await wheel.locator('[aria-label="AM or PM"] button', { hasText: half.toUpperCase() }).click();
}
const done = (page, f) => row(page, f).getByRole("button", { name: "Done" }).click();
const save = (page) => sheet(page).getByRole("button", { name: "Save times" });
const heading = (page, name) => sheet(page).getByRole("heading", { name, level: 4 });
const log = (m) => console.log(m);

// ---- the cards (03 to 06, 14 to 17, 21): same story as before, with Edit times in place of the old controls
if (want("03")) {
  log("03-just-started");
  const { context, page } = await scene({ seeds: [RUN_NOW], now: L(18, 23) });
  await shootEl(page, "03-just-started", card(page));
  await context.close();
}
if (want("04")) {
  log("04-running");
  const { context, page } = await scene({ seeds: [RUN_1P], now: L(19, 15) });
  const c = card(page);
  await badge(c.locator('[role="timer"]'), 1, { fx: 0, dx: 15 });
  await badge(c.getByRole("button", { name: "Pause Sleep" }), 2, { fx: 0, dx: 26 });
  await badge(c.getByRole("button", { name: "Stop Sleep" }), 3, { fx: 0, dx: 26 });
  await shootEl(page, "04-running", c);
  await context.close();
}
if (want("05")) {
  log("05-paused");
  const { context, page } = await scene({ seeds: [PAUSED_1P], now: L(19, 33) });
  const c = card(page);
  await badge(c.locator("button[aria-expanded]").first(), 1, { fx: 0, dx: -4 });
  await badge(c.getByRole("button", { name: "Resume Sleep" }), 2, { fx: 0, dx: 26 });
  await badge(c.getByRole("button", { name: "Stop Sleep" }), 3, { fx: 0, dx: 26 });
  await shootEl(page, "05-paused", c);
  await context.close();
}
if (want("06")) {
  log("06-finished");
  const { context, page } = await scene({ seeds: [FIN_2P], now: L(20, 10) });
  const c = card(page);
  await ring(c.locator("button[aria-expanded]").first(), 2);
  await ring(c.locator("button[data-edit-times]"), 1, 2);
  await ring(c.getByRole("button", { name: "Delete this sleep" }), 1, 2);
  await shootEl(page, "06-finished", c);
  await context.close();
}
if (want("14")) {
  log("14-card-header");
  const { context, page } = await scene({ seeds: [RUN_1P], now: L(19, 15) });
  const c = card(page);
  await badge(c.locator("button[data-edit-times]"), 1, { fx: 1, dx: 18 });
  await badge(c.getByRole("button", { name: "Joseph" }), 2, { fx: 0, fy: 0, dx: 3, dy: -2 });
  await badge(c.locator("label", { has: page.locator('input[aria-label="Sleep"]') }), 3, { fx: 1, fy: 0, dx: -10, dy: -4 });
  await badge(c.getByRole("button", { name: "Add a note…" }), 4, { fx: 1, dx: -23 });
  await shootEl(page, "14-card-header", c);
  await context.close();
}
if (want("15") || want("16")) {
  log("15-joseph-phone / 16-jen-phone");
  freshDb(DB);
  seedSleeps(DB, [RUN_NOW]);
  for (const [user, name] of [["joseph", "15-joseph-phone"], ["jen", "16-jen-phone"]]) {
    if (!want(name.slice(0, 2))) continue;
    const { context, page } = await scene({ now: L(20, 5), user, reuse: true });
    await shootEl(page, name, card(page));
    await context.close();
  }
}
if (want("17")) {
  log("17-conflict-toast");
  freshDb(DB);
  seedSleeps(DB, [RUN_NOW]);
  // A phone-height viewport: the toast is fixed to its bottom edge.
  const joseph = await scene({ now: L(20, 5), user: "joseph", reuse: true, height: 844 });
  const jen = await scene({ now: L(20, 5), user: "jen", reuse: true, height: 844 });
  await jen.page.locator("[data-sleep-card]").first().getByRole("button", { name: "Pause Sleep" }).click();
  await jen.page.waitForTimeout(800);
  const jc = card(joseph.page);
  await jc.getByRole("button", { name: "Pause Sleep" }).click();
  const toast = joseph.page.locator('div[role="status"][aria-live="polite"]').filter({ hasText: "already" });
  await toast.waitFor({ timeout: 10000 });
  await joseph.page.evaluate(() => window.scrollTo(0, document.querySelector("[data-sleep-card]").getBoundingClientRect().bottom + scrollY - 805));
  await joseph.page.waitForTimeout(300);
  const a = await jc.boundingBox(), b = await toast.boundingBox();
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  await shootBox(joseph.page, "17-conflict-toast", { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }, 10);
  await joseph.context.close();
  await jen.context.close();
}
if (want("21")) {
  log("21-delete-confirm");
  const { context, page } = await scene({ seeds: [FIN_2P], now: L(20, 10) });
  const c = card(page);
  await c.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 183));
  await page.waitForTimeout(150);
  await c.getByRole("button", { name: "Delete this sleep" }).click();
  const dlg = page.getByRole("alertdialog");
  await dlg.waitFor();
  await page.waitForTimeout(300);
  await shootBox(page, "21-delete-confirm", await dlg.boundingBox(), 28);
  await context.close();
}

// ---- the Edit times pages
if (want("08")) {
  log("08-edit-times");
  const { context, page } = await scene({ seeds: [RUN_1P], now: L(19, 15) });
  await openSheet(page);
  await badge(row(page, "ss").locator("button[aria-expanded]"), 1, { fx: 0, dx: -16 });
  await badge(sheet(page).getByRole("button", { name: "Remove pause" }), 2, { fx: 0, dx: -16 });
  await badge(sheet(page).getByRole("button", { name: "+ Add a pause" }), 3, { fx: 0, dx: 26 });
  await badge(save(page), 4, { fx: 0, dx: 26 });
  await shootEl(page, "08-edit-times", sheet(page), { top: 24, margin: 8 });
  await context.close();
}
if (want("09")) {
  log("09-wheel");
  const { context, page } = await scene({ seeds: [RUN_NOW], now: L(18, 50) });
  await openSheet(page);
  await pick(page, "ss", 6, 5, "pm");
  const r = row(page, "ss");
  const wheel = r.locator('[role="group"][aria-label="Pick a time"]');
  await badge(wheel.locator('[aria-label="Minute"]'), 1, { fx: 0.5, fy: 0.5, dx: 30 });
  await badge(wheel.getByRole("button", { name: "Done" }), 2, { fx: 0, dx: 26 });
  await shootRange(page, "09-wheel", heading(page, "Sleep"), wheel.getByRole("button", { name: "Done" }), { margin: 12 });
  await context.close();
}
if (want("10")) {
  log("10-add-pause");
  const { context, page } = await scene({ seeds: [NAP], now: L(16, 10) });
  await openSheet(page);
  await pick(page, "se", 3, 55, "pm");
  await done(page, "se");
  await sheet(page).getByRole("button", { name: "+ Add a pause" }).click();
  await pick(page, "p0s", 3, 20, "pm");
  await done(page, "p0s");
  await pick(page, "p0e", 3, 25, "pm");
  await done(page, "p0e");
  await page.waitForTimeout(300);
  await badge(sheet(page).getByRole("button", { name: "+ Add another pause" }), 1, { fx: 0, dx: 26 });
  await badge(sheet(page).locator('p[role="status"]').first(), 2, { fx: 1, dx: -16 });
  await badge(save(page), 3, { fx: 0, dx: 26 });
  await shootRange(page, "10-add-pause", sheet(page).locator('[data-block="new"]'), save(page), { margin: 12 });
  await context.close();
}
if (want("11")) {
  log("11-edit-error");
  const { context, page } = await scene({
    seeds: [{ stretches: [{ start: L(13, 0), end: L(13, 40) }] }, { stretches: [{ start: L(14, 0), end: L(14, 40) }] }],
    now: L(18, 0),
  });
  const c = page.locator("[data-sleep-card]").filter({ hasText: "1:00 pm" }).first();
  await openSheet(page, c);
  await pick(page, "se", 2, 15, "pm");
  await done(page, "se");
  await page.waitForTimeout(300);
  await ring(row(page, "se").locator("button[aria-expanded]"), 2);
  await shootRange(page, "11-edit-error", heading(page, "Sleep"), row(page, "se"), { margin: 12 });
  await context.close();
}
if (want("30")) {
  log("30-closed-itself");
  const { context, page } = await scene({
    seeds: [{ stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: L(19, 23) }], closedAt: null }],
    now: L(21, 30),
  });
  const c = card(page);
  await ring(c.locator("[data-auto-close-note]"), 2);
  await ring(c.locator("button[data-edit-times]"), 1, 2);
  await shootEl(page, "30-closed-itself", c);
  await context.close();
}
if (want("31")) {
  log("31-remove-in-sheet");
  const { context, page } = await scene({ seeds: [FIN_2P], now: L(20, 10) });
  await openSheet(page);
  await sheet(page).locator('[data-block="pause"]').first().getByRole("button", { name: "Remove pause" }).click();
  await page.waitForTimeout(300);
  const gone = sheet(page).locator("[data-block-removed]");
  await badge(gone.getByRole("button", { name: "Undo" }), 1, { fx: 0, dx: -16 });
  await badge(save(page), 2, { fx: 0, dx: 26 });
  await shootRange(page, "31-remove-in-sheet", gone, save(page), { margin: 12 });
  await context.close();
}
if (want("32")) {
  log("32-clear-ended");
  const { context, page } = await scene({ seeds: [NAP], now: L(16, 10) });
  await openSheet(page);
  await row(page, "se").locator("button[aria-expanded]").click();
  await row(page, "se").getByRole("button", { name: "Clear" }).click();
  await page.waitForTimeout(300);
  await badge(row(page, "se").locator("button[aria-expanded]"), 1, { fx: 0, dx: -16 });
  await badge(sheet(page).locator('p[role="status"]').first(), 2, { fx: 1, dx: -16 });
  await badge(save(page), 3, { fx: 0, dx: 26 });
  await shootRange(page, "32-clear-ended", sheet(page).getByRole("region", { name: "Sleep" }), save(page), { margin: 12 });
  await context.close();
}

await browser.close();
const bad = hits.filter((h) => h.kind === "unhandled" || h.kind === "error");
console.log(bad.length ? `PROBLEMS: ${JSON.stringify(bad.slice(0, 5))}` : "no unhandled requests");

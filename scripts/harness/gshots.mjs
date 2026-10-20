// User-guide screenshots for the Sleep tracker guide (JOS-83 refresh), taken from the real Log / Reports /
// Recently Deleted trees on the scratchpad harness (real SQL answering the browser's Supabase calls).
// Phone width 390 at 2x; the dev overlay hidden and animation frozen; badges and rings drawn into the page
// just before each shot, so every PNG is self-contained. Run: TZ=Europe/London node gshots.mjs [name-prefix ...]
import { mkdirSync } from "node:fs";
import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, hits, psql, asUser, q, BABY } from "./lib.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const OUT = `${SP}/gshots`;
mkdirSync(OUT, { recursive: true });
const L = (h, m, s = 0) => Date.UTC(2026, 9, 20, h - 1, m, s); // Tue 20 Oct 2026, London (BST)
const iso = (ms) => new Date(ms).toISOString();
const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.some((o) => name.startsWith(o));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const DB = "t_guide";
const W = 390, H = 844;

// ---------------------------------------------------------------- the story's sleeps
const RUN_NOW = { stretches: [{ start: L(18, 20), end: null }], closedAt: null };
const RUN_1P = { stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: null }], closedAt: null };
const PAUSED_1P = { stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: L(19, 23) }], closedAt: null };
const FIN_2P = { stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: L(19, 23) }, { start: L(19, 33), end: L(20, 5) }] };
const NAP = { stretches: [{ start: L(15, 0), end: L(15, 40) }] };

// ---------------------------------------------------------------- annotation (drawn into the page)
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
// A badge centred at a fraction of an element's box plus an offset (css px).
const badge = (loc, n, { fx = 0, fy = 0.5, dx = 0, dy = 0 } = {}) =>
  loc.evaluate((el, [n, fx, fy, dx, dy]) => {
    const r = el.getBoundingClientRect();
    window.__ann.badge(n, r.left + scrollX + r.width * fx + dx, r.top + scrollY + r.height * fy + dy);
  }, [n, fx, fy, dx, dy]);

// ---------------------------------------------------------------- scenes
async function scene({ seeds = [], now, user = "joseph", route = "sleep-log", query = "", wait, db = DB, reuse = false }) {
  if (!reuse) {
    freshDb(db);
    seedSleeps(db, seeds);
  }
  setClock(db, iso(now));
  const { context, page } = await newPhone(browser, { db, user, width: W, height: H, time: now });
  await page.goto(`http://localhost:3100/dev-preview/${route}?as=${user}&w=${W}${query}`);
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await page.evaluate(DRAW);
  await (wait ?? ((p) => p.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 })))(page);
  await page.evaluate(() => { document.body.style.paddingBottom = "900px"; }); // room to scroll a card up
  await page.waitForTimeout(700);
  return { context, page };
}

// Crop a box given in VIEWPORT css px, padded; the page is left where it is.
async function shootBox(page, name, box, margin = 10) {
  const vp = page.viewportSize();
  const x = Math.max(0, box.x - margin), y = Math.max(0, box.y - margin);
  const w = Math.min(vp.width - x, box.width + 2 * margin - (box.x - margin < 0 ? margin - box.x : 0));
  const h = Math.min(vp.height - y, box.height + 2 * margin);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: w, height: h } });
  console.log(`  ${name}.png  ${Math.round(w)}x${Math.round(h)} css`);
}
// Scroll so the target's top sits `top` px below the viewport top, then crop it.
async function shootEl(page, name, loc, { top = 24, margin = 10 } = {}) {
  await loc.evaluate((el, t) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - t), top);
  await page.waitForTimeout(150);
  await shootBox(page, name, await loc.boundingBox(), margin);
}
const card = (page) => page.locator("[data-sleep-card]").first();
const union = (a, b) => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};
const log = (m) => console.log(m);

// ================================================================ 01 Log a moment
if (want("01")) {
  log("01-log-a-moment");
  const { context, page } = await scene({ seeds: [], now: L(18, 20) });
  const b = page.getByRole("button", { name: "Log a moment" });
  await b.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 200));
  await ring(b, 2);
  const box = union(await b.boundingBox(), await page.getByRole("button", { name: "Edit", exact: true }).boundingBox());
  await shootBox(page, "01-log-a-moment", { x: 0, y: box.y, width: W, height: box.height }, 14);
  await context.close();
}

// ================================================================ 02 blank card, Sleep tile ringed
if (want("02")) {
  log("02-blank-card");
  const { context, page } = await scene({ seeds: [], now: L(18, 20) });
  await page.getByRole("button", { name: "Log a moment" }).click();
  await page.waitForTimeout(600);
  const blank = page.locator("div.shadow-card", { has: page.getByLabel("Delete this logged moment") }).first();
  await blank.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 24));
  await ring(blank.locator("label", { has: page.locator('input[aria-label="Sleep"]') }).locator(":scope > span"), 1);
  await shootEl(page, "02-blank-card", blank);
  await context.close();
}

// ================================================================ 03 just started
if (want("03")) {
  log("03-just-started");
  const { context, page } = await scene({ seeds: [RUN_NOW], now: L(18, 23) });
  await shootEl(page, "03-just-started", card(page));
  await context.close();
}

// ================================================================ 04 running, 1 pause (badges 1-3)
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

// ================================================================ 05 paused, 1 pause (badges 1-3)
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

// ================================================================ 06 finished, 2 pauses (rings: pauses, Reopen, Delete)
if (want("06")) {
  log("06-finished");
  const { context, page } = await scene({ seeds: [FIN_2P], now: L(20, 10) });
  const c = card(page);
  await ring(c.locator("button[aria-expanded]").first(), 2);
  await ring(c.getByRole("button", { name: "Reopen sleep" }), 1, 2);
  await ring(c.locator("[data-delete-sleep]"), 1, 2);
  await shootEl(page, "06-finished", c);
  await context.close();
}

// ================================================================ 07 under a minute: the Stop dialog
if (want("07")) {
  log("07-short-dialog");
  const { context, page } = await scene({ seeds: [RUN_NOW], now: L(18, 20, 30) });
  const c = card(page);
  await c.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 183));
  await page.waitForTimeout(150);
  await c.getByRole("button", { name: "Stop Sleep" }).click();
  const dlg = page.getByRole("alertdialog");
  await dlg.waitFor();
  await page.waitForTimeout(300);
  await shootBox(page, "07-short-dialog", await dlg.boundingBox(), 28);
  await context.close();
}

// ================================================================ 08 "Started earlier?" ringed
if (want("08")) {
  log("08-started-earlier");
  const { context, page } = await scene({ seeds: [RUN_NOW], now: L(18, 50) });
  const c = card(page);
  await ring(c.getByRole("button", { name: "Started earlier?" }), 4);
  await shootEl(page, "08-started-earlier", c);
  await context.close();
}

// ================================================================ 09 two ways, 10 the wheel
if (want("09") || want("10")) {
  log("09-two-ways / 10-wheel");
  const { context, page } = await scene({ seeds: [RUN_NOW], now: L(18, 50) });
  const c = card(page);
  await c.getByRole("button", { name: "Started earlier?" }).click();
  await page.waitForTimeout(500);
  const sub = c.locator("b", { hasText: "Sleep started…" }).locator("xpath=../..");
  const row1 = c.locator("button[aria-expanded]").filter({ hasText: "How long ago" });
  const row2 = c.locator("label", { has: page.locator('input[type="time"]') });
  const cardBox = await c.boundingBox();
  const edge = async (name, subBox) => shootBox(page, name, { x: cardBox.x - 1, y: subBox.y, width: cardBox.width + 2, height: subBox.height }, 0);
  if (want("09")) {
    await c.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY + 300));
    await page.waitForTimeout(150);
    await badge(row1, 1, { fx: 1, fy: 0, dx: -6 });
    await badge(row2, 2, { fx: 1, fy: 0, dx: -6 });
    const sb = await sub.boundingBox();
    await edge("09-two-ways", { x: 0, y: sb.y - 15, width: 0, height: sb.height + 28 });
  }
  if (want("10")) {
    await page.evaluate(() => document.querySelectorAll("[data-ann]").forEach((e) => e.remove()));
    await row1.click();
    await page.waitForTimeout(400);
    await c.getByRole("option", { name: "45 min ago", exact: true }).click();
    await page.waitForTimeout(900);
    const set = c.getByRole("button", { name: "Set", exact: true });
    const picked = await c.getByRole("option", { name: "45 min ago", exact: true }).getAttribute("aria-selected");
    log(`  45 min ago selected: ${picked}; summary: ${await c.locator("div", { hasText: /^6:05 pm · 45m ago$/ }).count()}`);
    await badge(c.getByRole("option", { name: "45 min ago", exact: true }), 1, { fx: 1, dx: -16 });
    await badge(set, 2, { fx: 0, dx: 26 });
    const sb = await sub.boundingBox();
    const setBox = await set.boundingBox();
    await edge("10-wheel", { x: 0, y: sb.y - 15, width: 0, height: setBox.y + setBox.height - sb.y + 37 });
  }
  await context.close();
}

// ================================================================ 11 no Reopen: the card says why
if (want("11")) {
  log("11-cant-reopen");
  const { context, page } = await scene({ seeds: [{ stretches: [{ start: L(13, 5), end: L(14, 40) }] }], now: L(18, 0) });
  const c = card(page);
  await ring(c.locator("[data-reopen-hint]"), 3);
  await shootEl(page, "11-cant-reopen", c);
  await context.close();
}

// ================================================================ 14 card header (badges 1-4)
if (want("14")) {
  log("14-card-header");
  const { context, page } = await scene({ seeds: [RUN_1P], now: L(19, 15) });
  const c = card(page);
  await badge(c.getByRole("button", { name: /^\d+:\d+ [ap]m$/ }).first(), 1, { fx: 1, dx: 23 });
  await badge(c.getByRole("button", { name: "Joseph" }), 2, { fx: 0, fy: 0, dx: 3, dy: -2 });
  await badge(c.locator("label", { has: page.locator('input[aria-label="Sleep"]') }), 3, { fx: 1, fy: 0, dx: -10, dy: -4 });
  await badge(c.getByRole("button", { name: "Add a note…" }), 4, { fx: 1, dx: -23 });
  await shootEl(page, "14-card-header", c);
  await context.close();
}

// ================================================================ 15, 16 two phones
if (want("15") || want("16")) {
  log("15-joseph-phone / 16-jen-phone");
  freshDb(DB);
  seedSleeps(DB, [{ stretches: [{ start: L(18, 20), end: null }], closedAt: null }]);
  for (const [user, name] of [["joseph", "15-joseph-phone"], ["jen", "16-jen-phone"]]) {
    if (!want(name.slice(0, 2))) continue;
    const { context, page } = await scene({ now: L(20, 5), user, reuse: true });
    await shootEl(page, name, card(page));
    await context.close();
  }
}

// ================================================================ 17 both tapped at once
if (want("17")) {
  log("17-conflict-toast");
  freshDb(DB);
  seedSleeps(DB, [{ stretches: [{ start: L(18, 20), end: null }], closedAt: null }]);
  const joseph = await scene({ now: L(20, 5), user: "joseph", reuse: true });
  const jen = await scene({ now: L(20, 5), user: "jen", reuse: true });
  await jen.page.locator("[data-sleep-card]").first().getByRole("button", { name: "Pause Sleep" }).click();
  await jen.page.waitForTimeout(800);
  const jc = card(joseph.page);
  await jc.getByRole("button", { name: "Pause Sleep" }).click();
  const toast = joseph.page.locator('div[role="status"][aria-live="polite"]').filter({ hasText: "already" });
  await toast.waitFor({ timeout: 10000 });
  await joseph.page.evaluate(() => window.scrollTo(0, document.querySelector("[data-sleep-card]").getBoundingClientRect().bottom + scrollY - 805));
  await joseph.page.waitForTimeout(300);
  const box = union(await jc.boundingBox(), await toast.boundingBox());
  log(`  toast: ${await toast.innerText()}`);
  await shootBox(joseph.page, "17-conflict-toast", box, 10);
  await joseph.context.close();
  await jen.context.close();
}

// ================================================================ 13 Recently Deleted + 22 a restore that is refused
if (want("13") || want("22")) {
  log("13-recently-deleted / 22-restore-refused");
  const openDeleted = async (now) => {
    const { context, page } = await newPhone(browser, { db: DB, user: "joseph", width: W, height: H, time: now });
    await page.goto("http://localhost:3100/dev-preview/sleep-deleted");
    await page.addStyleTag({ content: HIDE_DEV_UI });
    await page.evaluate(DRAW);
    await page.getByText("Recently Deleted", { exact: true }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(600);
    return { context, page };
  };
  const cropTop = async (page, name, loc, below = 16) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const b = await loc.boundingBox();
    await shootBox(page, name, { x: 0, y: 0, width: W, height: b.y + b.height + below }, 0);
  };
  // a sleep from 1:05 to 2:40 pm, deleted just now by Joseph
  freshDb(DB);
  setClock(DB, iso(L(13, 5)));
  seedSleeps(DB, [{ stretches: [{ start: L(13, 5), end: L(14, 40) }] }]);
  setClock(DB, iso(L(18, 0)));
  const id = psql(DB, "select id from public.sleeps");
  asUser(DB, "joseph", `select public.delete_sleep(${q(id)}, 1)`);
  if (want("13")) {
    const { context, page } = await openDeleted(L(18, 0));
    const restore = page.getByRole("button", { name: "Restore" });
    await ring(restore, 2);
    await cropTop(page, "13-recently-deleted", restore.locator("xpath=ancestor::div[contains(@class,'rounded')][1]"));
    await context.close();
  }
  if (want("22")) {
    // another sleep has since been logged over those times
    seedSleeps(DB, [{ stretches: [{ start: L(13, 30), end: L(14, 30) }] }]);
    const { context, page } = await openDeleted(L(18, 0));
    await page.getByRole("button", { name: "Restore" }).click();
    await page.waitForTimeout(900);
    const row = page.getByRole("button", { name: "Restore" }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
    await row.evaluate((el) => window.scrollTo(0, 0));
    await cropTop(page, "22-restore-refused", row);
    await context.close();
  }
}

// ================================================================ 19-21 the Last sleep tile, three states
if (want("19") || want("20") || want("21")) {
  log("19-tile-resting / 20-tile-sleeping / 21-tile-paused");
  const tile = (page) => page.locator('[data-tile="last-sleep"]');
  const run = async (name, seeds, now) => {
    const { context, page } = await scene({ seeds, now });
    await shootEl(page, name, tile(page), { top: 40 });
    log(`  ${name}: ${(await tile(page).innerText()).replace(/\s+/g, " ")}`);
    await context.close();
  };
  // the tile follows the same evening as the cards: 03 (just started, 6:23 pm), 05 (paused, 7:33 pm), 06 (finished, 8:10 pm)
  if (want("19")) await run("19-tile-finished", [NAP, FIN_2P], L(20, 10));
  if (want("20")) await run("20-tile-sleeping", [NAP, RUN_NOW], L(18, 23));
  if (want("21")) await run("21-tile-paused", [NAP, PAUSED_1P], L(19, 33));
}

// ================================================================ 23 delete a finished sleep: the confirm box
if (want("23")) {
  log("23-delete-confirm");
  const { context, page } = await scene({ seeds: [FIN_2P], now: L(20, 10) });
  const c = card(page);
  await c.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 183));
  await page.waitForTimeout(150);
  await c.locator("[data-delete-sleep]").click();
  const dlg = page.getByRole("alertdialog");
  await dlg.waitFor();
  await page.waitForTimeout(300);
  log(`  ${(await dlg.innerText()).replace(/\s+/g, " ")}`);
  await shootBox(page, "23-delete-confirm", await dlg.boundingBox(), 28);
  await context.close();
}

// ================================================================ 24-30 Reports > Sleep (Sat 17 Oct, 2:30 pm, the prototype's three weeks)
if (want("24") || want("25") || want("26") || want("27") || want("28") || want("29") || want("30")) {
  log("24..30 reports");
  const { mock, asOf, DAY0, MIN } = await import("./mock.mjs");
  const T = DAY0 + (14 * 60 + 30) * MIN;
  const db = "t_guide_reports";
  freshDb(db);
  seedSleeps(db, asOf(mock(), T));
  const { context, page } = await scene({ now: T, route: "sleep-reports", db, reuse: true, wait: (p) => p.getByText("Naps today").waitFor({ timeout: 30000 }) });
  const today = page.locator('[data-card="today"]');
  if (want("24")) {
    await badge(page.getByRole("button", { name: "Sleep", exact: true }), 1, { fx: 1, fy: 0.5, dx: -22 });
    await badge(today.locator("[data-sleep-pill]"), 2, { fx: 1, fy: 0.5, dx: -22 });
    await badge(today.getByText("2h 16m", { exact: true }).first(), 3, { fx: 0, fy: 0.5, dx: 154 });
    await badge(today.locator('[role="img"][aria-label^="Asleep"]'), 4, { fx: 14.5 / 24, fy: 0, dy: -17 });
    await page.evaluate(() => window.scrollTo(0, 120));
    await page.waitForTimeout(150);
    const tb = await page.locator('[aria-label="Report type"]').boundingBox();
    const cb = await today.boundingBox();
    await shootBox(page, "24-reports-today", { x: cb.x, y: tb.y, width: cb.width, height: cb.y + cb.height - tb.y }, 10);
    await page.evaluate(() => document.querySelectorAll("[data-ann]").forEach((e) => e.remove()));
  }
  if (want("25")) {
    const pat = page.locator('[data-card="pattern"]');
    await badge(pat.locator("div", { hasText: /^Fri 16 Oct · 14h 55m asleep/ }).last(), 1, { fx: 1, fy: 0, dx: -10, dy: 2 });
    await badge(pat.getByRole("button", { name: /^Fri 16 Oct/ }), 2, { fx: 0.55, fy: 0.5 });
    await badge(pat.getByRole("button", { name: /^Sat 17 Oct/ }), 3, { fx: 1, fy: 0.5, dx: -16 });
    await shootEl(page, "25-reports-pattern", pat, { top: 40 });
    await page.evaluate(() => document.querySelectorAll("[data-ann]").forEach((e) => e.remove()));
  }
  if (want("26")) {
    const r = page.locator('[aria-label="Date range"]');
    await r.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 200));
    const b = await r.boundingBox();
    await shootBox(page, "26-reports-ranges", { x: 0, y: b.y, width: W, height: b.height }, 10);
  }
  if (want("27")) await shootEl(page, "27-reports-averages", page.locator('[data-card="averages"]'), { top: 40 });
  if (want("28")) await shootEl(page, "28-reports-per-day", page.locator('[data-card="stacked"]'), { top: 40 });
  if (want("29")) await shootEl(page, "29-reports-longest", page.locator('[data-card="longest"]'), { top: 40 });
  if (want("30")) await shootEl(page, "30-reports-table", page.locator('[aria-label="Sleep summary by day"]'), { top: 40 });
  await context.close();
}

await browser.close();
const bad = hits.filter((h) => h.kind === "unhandled" || h.kind === "error");
console.log(bad.length ? `PROBLEMS: ${JSON.stringify(bad.slice(0, 5))}` : "no unhandled requests");

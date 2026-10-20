// Release-notes screenshots for v1.14.0 (JOS-83): clean, element-scoped, no annotations. Phone width 390 at 2x.
// Run: TZ=Europe/London node rnshots.mjs
import { mkdirSync } from "node:fs";
import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, hits, ENTRY_ROWS } from "./lib.mjs";
import { mock, asOf, DAY0, MIN } from "./mock.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const OUT = `${SP}/rn`;
mkdirSync(OUT, { recursive: true });
const L = (h, m, s = 0) => Date.UTC(2026, 9, 20, h - 1, m, s); // Tue 20 Oct 2026, London (BST)
const iso = (ms) => new Date(ms).toISOString();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const W = 390, H = 844, DB = "t_rn";

const NAP = { stretches: [{ start: L(15, 0), end: L(15, 40) }] };
const RUN_NOW = { stretches: [{ start: L(18, 20), end: null }], closedAt: null };
const FIN_2P = { stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: L(19, 23) }, { start: L(19, 33), end: L(20, 5) }] };

async function open({ route, query = "", now, db, wait }) {
  setClock(db, iso(now));
  const { context, page } = await newPhone(browser, { db, user: "joseph", width: W, height: H, time: now });
  await page.goto(`http://localhost:3100/dev-preview/${route}?w=${W}${query}`);
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await wait(page);
  await page.evaluate(() => { document.body.style.paddingBottom = "900px"; });
  await page.waitForTimeout(800);
  return { context, page };
}
async function crop(page, name, box, margin = 10) {
  const x = Math.max(0, box.x - margin), y = Math.max(0, box.y - margin);
  const w = Math.min(W - x, box.width + 2 * margin), h = Math.min(H - y, box.height + 2 * margin);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: w, height: h } });
  console.log(`${name}.png  ${Math.round(w)}x${Math.round(h)} css`);
}

// 1. Reports > Sleep: the tab bar and the Today card (Sat 17 Oct, 2:30 pm, the prototype's three weeks)
{
  const T = DAY0 + (14 * 60 + 30) * MIN;
  freshDb(DB); seedSleeps(DB, asOf(mock(), T));
  const { context, page } = await open({ route: "sleep-reports", now: T, db: DB, wait: (p) => p.getByText("Naps today").waitFor({ timeout: 30000 }) });
  await page.evaluate(() => window.scrollTo(0, 120));
  await page.waitForTimeout(150);
  const tb = await page.locator('[aria-label="Report type"]').boundingBox();
  const cb = await page.locator('[data-card="today"]').boundingBox();
  await crop(page, "rn-1-reports-today", { x: cb.x, y: tb.y, width: cb.width, height: cb.y + cb.height - tb.y });
  await context.close();
}

// 2. Log: the four tiles, the last one with its pill (asleep since 6:20 pm, it is 7:32 pm; a nap ended 3:40 pm)
{
  ENTRY_ROWS.length = 0;
  const row = (id, type, ts, extra = {}) => ({ id, baby_id: "00000000-0000-0000-0000-0000000000d1", logged_by: "00000000-0000-0000-0000-0000000000a1", type, timestamp: ts, notes: null, amount_ml: null, bottle: false, breast: false, breast_right_seconds: 0, breast_left_seconds: 0, breast_active_side: null, breast_active_started_at: null, breast_session_ended: false, created_at: ts, deleted_at: null, deleted_by: null, ...extra });
  ENTRY_ROWS.push(row("e1", "feed", "2026-10-20T16:45:00.000Z", { bottle: true, amount_ml: 120 }), row("e2", "poop", "2026-10-20T15:10:00.000Z"), row("e3", "pee", "2026-10-20T17:05:00.000Z"));
  freshDb(DB); seedSleeps(DB, [NAP, RUN_NOW]);
  const { context, page } = await open({ route: "sleep-log", query: "&entries=evening", now: L(19, 32), db: DB, wait: (p) => p.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 }) });
  const first = page.locator("p", { hasText: /^Last feed$/ }).locator("xpath=..");
  const last = page.locator('[data-tile="last-sleep"]');
  await first.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 40));
  await page.waitForTimeout(150);
  const a = await first.boundingBox(), b = await last.boundingBox();
  console.log("  tiles:", (await page.locator("div.shadow-card").allInnerTexts()).slice(0, 4).map((t) => t.replace(/\s+/g, " ")).join(" | "));
  await crop(page, "rn-2-log-tiles", { x: a.x, y: a.y, width: a.width, height: b.y + b.height - a.y });
  await context.close();
  ENTRY_ROWS.length = 0;
}

// 3. Delete sleep: the confirm box over a finished card (6:20 to 8:05 pm, two pauses)
{
  freshDb(DB); seedSleeps(DB, [FIN_2P]);
  const { context, page } = await open({ route: "sleep-log", now: L(20, 10), db: DB, wait: (p) => p.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 }) });
  const c = page.locator("[data-sleep-card]").first();
  await c.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 150));
  await page.waitForTimeout(150);
  await c.locator("[data-delete-sleep]").click();
  const dlg = page.getByRole("alertdialog");
  await dlg.waitFor();
  await page.waitForTimeout(300);
  const d = await dlg.boundingBox();
  console.log("  dialog:", (await dlg.innerText()).replace(/\s+/g, " "));
  const cardBox = await c.boundingBox();
  const top = d.y + d.height / 2 - 215;
  await crop(page, "rn-3-delete-sleep", { x: cardBox.x, y: top, width: cardBox.width, height: 430 }, 0);
  await context.close();
}

await browser.close();
const bad = hits.filter((h) => h.kind === "unhandled" || h.kind === "error");
console.log(bad.length ? `PROBLEMS: ${JSON.stringify(bad.slice(0, 5))}` : "no unhandled requests");

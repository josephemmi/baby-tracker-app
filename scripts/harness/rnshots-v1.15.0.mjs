// Release-notes screenshots for v1.15.0 (JOS-90, JOS-91, JOS-92): clean, element-scoped, no annotations.
// Phone width 390 at 2x. Run: TZ=Europe/London node rnshots-v1.15.0.mjs
import { mkdirSync } from "node:fs";
import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, hits } from "./lib.mjs";
import { mock, asOf, DAY0, MIN } from "./mock.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const OUT = `${SP}/rn115`;
mkdirSync(OUT, { recursive: true });
const L = (h, m, s = 0) => Date.UTC(2026, 9, 20, h - 1, m, s); // Tue 20 Oct 2026, London (BST)
const iso = (ms) => new Date(ms).toISOString();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const W = 390, H = 844, DB = "t_rn115";

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
async function scrollTo(loc, top = 40) {
  await loc.evaluate((el, t) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - t), top);
  await loc.page().waitForTimeout(150);
}
async function crop(page, name, box, margin = 10) {
  const x = Math.max(0, box.x - margin), y = Math.max(0, box.y - margin);
  const w = Math.min(W - x, box.width + 2 * margin), h = Math.min(H - y, box.height + 2 * margin);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: w, height: h } });
  console.log(`${name}.png  ${Math.round(w)}x${Math.round(h)} css`);
}

// 1. Reports > Sleep: the 24-hour pattern (bold title, "only logged sleeps" note) down through the Averages
//    heading and its own note (bold title, loggedNote), stopping before the nine stat cards.
{
  const T = DAY0 + (14 * 60 + 30) * MIN;
  freshDb(DB); seedSleeps(DB, asOf(mock(), T));
  const { context, page } = await open({ route: "sleep-reports", now: T, db: DB, wait: (p) => p.getByText("Naps today").waitFor({ timeout: 30000 }) });
  const pat = await page.locator('[data-card="pattern"]').boundingBox();
  const avgNote = await page.locator('[data-avg-logged]').boundingBox();
  await crop(page, "rn115-1-titles-and-notes", { x: pat.x, y: pat.y, width: pat.width, height: avgNote.y + avgNote.height - pat.y });
  await context.close();
}

// 2. Averages: the top row of renamed labels (JOS-90) — "Average time asleep per day" and "Average length
//    of night sleep" (was "Average sleep per day" / "Average night sleep"). The full nine-card grid is tall
//    and narrow at release-note size, so this crop stops after the first row, where the renamed labels are.
{
  const T = DAY0 + (14 * 60 + 30) * MIN;
  freshDb(DB); seedSleeps(DB, asOf(mock(), T));
  const { context, page } = await open({ route: "sleep-reports", now: T, db: DB, wait: (p) => p.getByText("Naps today").waitFor({ timeout: 30000 }) });
  const avg = page.locator('[data-card="averages"]');
  await scrollTo(avg);
  const top = await avg.boundingBox();
  const row1 = await page.getByText("Part of the daily total", { exact: true }).boundingBox();
  await crop(page, "rn115-2-averages", { x: top.x, y: top.y, width: top.width, height: row1.y + row1.height - top.y + 16 });
  await context.close();
}

// 3. A finished sleep card in Edit, with its tick box (JOS-92: sleeps join the bulk-delete selection).
{
  freshDb(DB); seedSleeps(DB, [FIN_2P]);
  const { context, page } = await open({ route: "sleep-log", now: L(20, 10), db: DB, wait: (p) => p.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 }) });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForTimeout(400);
  const c = page.locator("[data-sleep-card]").first();
  await c.locator('input[aria-label="Select sleep"]').check();
  await c.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 40));
  await page.waitForTimeout(150);
  const box = await c.boundingBox();
  await crop(page, "rn115-3-edit-tick-box", box);
  await context.close();
}

// 4. The confirm box counting both: three logged moments (the route's default entries) and one sleep.
{
  freshDb(DB); seedSleeps(DB, [FIN_2P]);
  const { context, page } = await open({ route: "sleep-log", now: L(20, 10), db: DB, wait: (p) => p.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 }) });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.waitForTimeout(400);
  const moments = page.locator('input[aria-label="Select card"]');
  const n = await moments.count();
  for (let i = 0; i < n; i++) await moments.nth(i).check();
  await page.locator("[data-sleep-card]").first().locator('input[aria-label="Select sleep"]').check();
  await page.getByRole("button", { name: /^Delete( \(\d+\))?$/ }).click();
  const dlg = page.getByRole("alertdialog");
  await dlg.waitFor();
  await page.waitForTimeout(300);
  console.log("  dialog:", (await dlg.innerText()).replace(/\s+/g, " "));
  await crop(page, "rn115-4-bulk-delete-confirm", await dlg.boundingBox(), 20);
  await context.close();
}

await browser.close();
const bad = hits.filter((h) => h.kind === "unhandled" || h.kind === "error");
console.log(bad.length ? `PROBLEMS: ${JSON.stringify(bad.slice(0, 5))}` : "no unhandled requests");

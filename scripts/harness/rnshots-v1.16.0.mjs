// Release-note shots for v1.16.0 (JOS-103): tight, element-scoped, no annotations. Route `sleep-log`.
// Run from the repo root with the dev server on :3100: TZ=Europe/London node scripts/harness/rnshots-v1.16.0.mjs
import { mkdirSync } from "node:fs";
import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, ENTRY_ROWS, USERS, BABY } from "./lib.mjs";
const OUT = `${process.env.HARNESS_OUT ?? "/tmp/harness-out"}/rn-v1.16.0`;
mkdirSync(OUT, { recursive: true });
const L = (h, m) => Date.UTC(2026, 9, 20, h - 1, m);
const iso = (ms) => new Date(ms).toISOString();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const entry = (id, type, timestamp, extra = {}) => ({ id, baby_id: BABY, logged_by: USERS.joseph, type, timestamp, notes: null, amount_ml: null, bottle: false, breast: false, breast_right_seconds: 0, breast_left_seconds: 0, breast_active_side: null, breast_active_started_at: null, breast_session_ended: false, created_at: timestamp, deleted_at: null, deleted_by: null, ...extra });
const ENTRY_SEED = [entry("e0000000-0000-0000-0000-000000000003", "poop", "2026-10-20T11:20:00.000Z"), entry("e0000000-0000-0000-0000-000000000002", "pee", "2026-10-20T10:10:00.000Z"), entry("e0000000-0000-0000-0000-000000000001", "feed", "2026-10-20T07:05:00.000Z", { bottle: true, amount_ml: 120 })];
async function scene(seeds, now) {
  freshDb("t_rn"); seedSleeps("t_rn", seeds); setClock("t_rn", iso(now));
  ENTRY_ROWS.length = 0; ENTRY_ROWS.push(...ENTRY_SEED.map((e) => ({ ...e })));
  const { context, page } = await newPhone(browser, { db: "t_rn", user: "joseph", width: 390, height: 1300, time: now });
  await page.goto("http://localhost:3100/dev-preview/sleep-log?as=joseph&w=390");
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await page.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  return { context, page };
}
const shoot = async (page, name, loc, box) => {
  if (!box) {
    await loc.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 24));
    await page.waitForTimeout(150);
  }
  const b = box ?? (await loc.boundingBox());
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height + 20 } });
  console.log(name, Math.round(b.width + 20), Math.round(b.height + 20));
};
const FIN_2P = { stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: L(19, 23) }, { start: L(19, 33), end: L(20, 5) }] };
{ const { context, page } = await scene([FIN_2P], L(20, 10)); await shoot(page, "1-card", page.locator("[data-sleep-card]").first()); await context.close(); }
{
  const { context, page } = await scene([FIN_2P], L(20, 10));
  const c = page.locator("[data-sleep-card]").first();
  await c.locator("button[data-edit-times]").click();
  const sheet = page.locator("[data-edit-times-sheet]");
  await sheet.waitFor(); await page.waitForTimeout(300);
  await sheet.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 24));
  await page.waitForTimeout(150);
  const a = await sheet.getByRole("heading", { name: "Sleep", level: 4 }).boundingBox();
  const last = await sheet.locator('[data-block="pause"]').first().boundingBox();
  const s = await sheet.boundingBox();
  await shoot(page, "2-sheet", sheet.getByRole("heading", { name: "Sleep", level: 4 }), { x: s.x, y: a.y - 4, width: s.width, height: last.y + last.height - a.y + 4 });
  await context.close();
}
{
  const { context, page } = await scene([{ stretches: [{ start: L(18, 20), end: L(18, 50) }, { start: L(18, 58), end: L(19, 23) }], closedAt: null }], L(21, 30));
  await shoot(page, "3-closed", page.locator("[data-sleep-card]").first());
  await context.close();
}
await browser.close();

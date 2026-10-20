import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, hits } from "./lib.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const MIN = 60000;
// Tue 20 Oct 2026, London (BST = UTC+1)
const L = (h, m) => Date.UTC(2026, 9, 20, h - 1, m);
const T = L(18, 33);
const scenarios = {
  idle: [{ stretches: [{ start: L(13, 0), end: L(13, 40) }] }],
  sleeping: [{ stretches: [{ start: L(13, 0), end: L(13, 40) }] }, { stretches: [{ start: L(17, 20), end: L(17, 50) }, { start: L(18, 5), end: null }], closedAt: null }],
  paused: [{ stretches: [{ start: L(13, 0), end: L(13, 40) }] }, { stretches: [{ start: L(17, 20), end: L(17, 50) }], closedAt: null }],
  none: [],
};
const only = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, sleeps] of Object.entries(scenarios)) {
  if (only && only !== name) continue;
  for (const width of [393, 768]) {
    const db = "t_log";
    freshDb(db); seedSleeps(db, sleeps); setClock(db, new Date(T).toISOString());
    const { context, page } = await newPhone(browser, { db, user: "joseph", width, time: T });
    await page.goto(`http://localhost:3100/dev-preview/sleep-log?w=${width}`);
    await page.addStyleTag({ content: HIDE_DEV_UI });
    await page.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    await page.locator('[data-tile="last-sleep"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SP}/shots/log-${name}-${width}.png`, fullPage: true });
    const tile = await page.locator('[data-tile="last-sleep"]').innerText();
    console.log(`${name} @${width}: tile = ${JSON.stringify(tile.replace(/\n/g, " | "))}`);
    await context.close();
  }
}
await browser.close();

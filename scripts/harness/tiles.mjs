// Last sleep tile layout options at real widths (JOS-83): the real header, tiles and Log a moment row on a temporary
// preview route, with each layout applied by CSS injected after load (no change to the component).
// Run: TZ=Europe/London node tiles.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const OUT = `${SP}/tiles`;
mkdirSync(OUT, { recursive: true });
const NOW = Date.UTC(2026, 9, 20, 18, 32); // 7:32 pm London
const G = "[data-variant] > .grid";
const VARIANTS = {
  before: `@media (min-width: 640px) { ${G} { grid-template-columns: repeat(3, minmax(0, 1fr)) !important } ${G} [data-tile="last-sleep"] { display: none !important } }`,
  A: ``,
  B: `@media (min-width: 640px) { ${G} { grid-template-columns: repeat(4, minmax(0, 1fr)) !important } }`,
  C: `@media (min-width: 640px) { ${G} { grid-template-columns: repeat(3, minmax(0, 1fr)) !important } ${G} [data-tile="last-sleep"] { grid-column: 1 / -1 !important } }`,
  E: `@media (min-width: 1024px) { ${G} { grid-template-columns: repeat(4, minmax(0, 1fr)) !important } }`,
};
const WIDTHS = [390, 640, 768, 1024];
const STATES = ["sleeping", "paused", "resting"];
const HIDE = `nextjs-portal { display: none !important } *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important }`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const facts = [];
for (const w of WIDTHS) {
  for (const [name, css] of Object.entries(VARIANTS)) {
    if (w === 390 && name !== "A") continue; // one column on a phone in every option; "A" stands for all
    for (const state of STATES) {
      const context = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, timezoneId: "Europe/London", locale: "en-GB" });
      await context.clock.install({ time: new Date(NOW) });
      const page = await context.newPage();
      await page.goto(`http://localhost:3100/dev-preview/tiles?w=${w}&state=${state}`);
      await page.addStyleTag({ content: HIDE + css });
      await page.locator('[data-tile="last-sleep"]').waitFor({ state: "attached", timeout: 30000 });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const grid = document.querySelector("[data-variant] > .grid");
        const tiles = [...grid.children].map((t) => { const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top + scrollY) }; });
        const g = grid.getBoundingClientRect();
        const pill = document.querySelector("[data-sleep-pill]");
        const pr0 = pill ? pill.getBoundingClientRect() : null;
        const pr = pr0 && pr0.width > 0 ? pr0 : null;
        const row = document.querySelector("[data-log-row]").getBoundingClientRect();
        const tile = document.querySelector('[data-tile="last-sleep"]').getBoundingClientRect();
        return { gridH: Math.round(g.height), tiles, pillH: pr ? Math.round(pr.height) : null, pillW: pr ? Math.round(pr.width) : null, rowBottom: Math.round(row.bottom + scrollY), sleepTileW: Math.round(tile.width), pageOverflow: document.documentElement.scrollWidth - innerWidth };
      });
      const height = Math.min(900, m.rowBottom + 24);
      await page.screenshot({ path: `${OUT}/${w}-${name}-${state}.png`, clip: { x: 0, y: 0, width: w, height } });
      facts.push({ w, variant: name, state, ...m, height });
      await context.close();
    }
  }
}
await browser.close();
writeFileSync(`${OUT}/facts.json`, JSON.stringify(facts, null, 1));
for (const f of facts.filter((f) => f.state === "sleeping")) console.log(`${f.w} ${f.variant}: grid ${f.gridH}px, sleep tile ${f.sleepTileW}px wide, pill ${f.pillW}x${f.pillH}${f.pillH > 40 ? " (WRAPS)" : ""}, page overflow ${f.pageOverflow}, shot ${f.height}px tall`);

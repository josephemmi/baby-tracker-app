// Round 2 of the Log tile layouts (JOS-83): ways to remove the empty space under Last pee on a tablet, and compact tiles
// for a phone. The real header, tiles and Log a moment row on the temporary preview route; each variant is CSS (and a
// little DOM moving for the strip) injected after load, so the component itself is untouched.
// Run: TZ=Europe/London node tiles2.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const OUT = `${SP}/tiles2`;
mkdirSync(OUT, { recursive: true });
const NOW = Date.UTC(2026, 9, 20, 18, 32); // 7:32 pm London
const G = "[data-variant] > .grid";
const T = `${G} > div:not([data-sleep-pill])`;
const SLEEP = `${G} > [data-tile="last-sleep"]`;
const PILL = `${SLEEP} > [data-sleep-pill]`;

// H: the pill moves up beside the label, at a smaller size, when the tile is wide enough for both (a container query on the
// tile, so it follows the tile's own width, not the screen's); in a narrower tile it stays under the value, as today.
// Absolutely placed, so the tile is exactly as tall with or without a pill.
const H = (top, right) => `
${SLEEP} { position: relative; container-type: inline-size; }
@container (min-width: 272px) {
  ${PILL} { position: absolute; top: ${top}px; right: ${right}px; margin: 0 !important; min-height: 24px !important; padding: 3px 11px 3px 24px !important; font-size: 12px !important; line-height: 1.2 !important; }
  ${PILL} > span[aria-hidden] { left: 9px !important; width: 8px !important; height: 8px !important; margin-top: -4px !important; }
}
`;
// Tighter tiles: less padding and gap, a smaller value.
const TIGHT = `
${G} { gap: 8px !important; }
${T} { padding: 12px !important; }
${T} > p:nth-child(2) { font-size: 20px !important; line-height: 1.3 !important; }
`;
// 2x2 on a phone: tight tiles, the detail on its own line under the value in every tile.
const TWO = `
${G} { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
${T} { padding: 12px !important; }
${T} > p:nth-child(2) { font-size: 20px !important; line-height: 1.3 !important; }
${T} > p:nth-child(2) > span { display: block; margin: 1px 0 0 0 !important; font-size: 13px !important; line-height: 1.3; }
`;
// One list card: label on the left, value to its right, hairlines between rows, the pill in a last row.
const LIST = `
${G} { display: block !important; border: 1px solid var(--color-line); border-radius: 10px; background: var(--color-paper-raised); box-shadow: var(--shadow-card); overflow: hidden; }
${T} { display: grid !important; grid-template-columns: 84px minmax(0, 1fr); column-gap: 8px; align-items: baseline; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; background: transparent !important; padding: 10px 14px !important; }
${T} + div { border-top: 1px solid var(--color-line) !important; }
${T} > p:first-child { grid-column: 1; grid-row: 1; }
${T} > p:nth-child(2) { grid-column: 2; grid-row: 1; font-size: 20px !important; line-height: 1.3 !important; }
${PILL} { grid-column: 1 / -1; grid-row: 2; margin: 8px 0 0 !important; }
`;

// DOM changes that CSS alone cannot make.
const STRIP = () => { // the pill leaves the tile and spans the whole grid, under the four tiles
  const grid = document.querySelector("[data-variant] > .grid");
  const pill = grid.querySelector("[data-sleep-pill]");
  if (pill) { pill.style.gridColumn = "1 / -1"; pill.style.margin = "0"; grid.appendChild(pill); }
};
const DETAILS = () => { // every tile gets a detail line: the clock time, and the amount for the feed
  const times = { "Last feed": "120 mL · 5:45 PM", "Last poo": "4:10 PM", "Last pee": "6:05 PM" };
  const grid = document.querySelector("[data-variant] > .grid");
  for (const tile of [...grid.children].filter((c) => !c.hasAttribute("data-sleep-pill"))) {
    const label = tile.querySelector("p").textContent.trim();
    const value = tile.querySelectorAll("p")[1];
    if (!times[label] || /Not logged/.test(value.textContent)) continue;
    let span = value.querySelector("span");
    if (!span) { span = document.createElement("span"); span.className = "ml-1 text-sm font-normal text-ink-soft"; value.appendChild(span); }
    span.textContent = times[label];
  }
  const pill = grid.querySelector("[data-sleep-pill]");
  if (pill) { pill.style.gridColumn = "1 / -1"; pill.style.margin = "0"; grid.appendChild(pill); }
};

const VARIANTS = {
  A: { css: "" },
  H: { css: H(10, 16) },
  S: { css: "", dom: STRIP },
  N: { css: `${G} { align-items: start !important; }` },
  P0: { css: "" },
  P1: { css: H(10, 16) },
  P2: { css: H(7, 12) + TIGHT },
  P3: { css: TWO, dom: DETAILS },
  P4: { css: LIST },
};
const RUNS = [
  ...["A", "H", "S", "N"].flatMap((v) => [640, 768, 1024].flatMap((w) => ["sleeping", "paused", "resting"].map((s) => ({ v, w, s })))),
  ...["P0", "P1", "P2", "P3", "P4"].flatMap((v) => ["sleeping", "paused", "resting", "none"].map((s) => ({ v, w: 390, s }))),
  ...[660, 680, 690, 700].map((w) => ({ v: "H", w, s: "sleeping" })),
  ...["P0", "P1", "P2", "P3", "P4"].flatMap((v) => ["sleeping", "none"].map((s) => ({ v, w: 320, s }))),
];
const HIDE = `nextjs-portal { display: none !important } *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important }`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const facts = [];
for (const { v, w, s } of RUNS) {
  const { css, dom } = VARIANTS[v];
  const context = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, timezoneId: "Europe/London", locale: "en-GB" });
  await context.clock.install({ time: new Date(NOW) });
  const page = await context.newPage();
  await page.goto(`http://localhost:3100/dev-preview/tiles?w=${w}&state=${s}`);
  await page.addStyleTag({ content: HIDE + css });
  await page.locator('[data-tile="last-sleep"]').waitFor({ state: "attached", timeout: 30000 });
  await page.waitForTimeout(400);
  if (dom) await page.evaluate(dom);
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const grid = document.querySelector("[data-variant] > .grid");
    const g = grid.getBoundingClientRect();
    const px = (n) => Math.round(n * 10) / 10;
    const tiles = [...grid.children].filter((c) => !c.hasAttribute("data-sleep-pill")).map((el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const kids = [...el.children].filter((c) => getComputedStyle(c).position !== "absolute");
      const bottom = Math.max(...kids.map((c) => c.getBoundingClientRect().bottom));
      const blank = r.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth) - bottom;
      const value = el.querySelectorAll("p")[1];
      const lh = value ? parseFloat(getComputedStyle(value).lineHeight) : 0;
      return { label: el.querySelector("p").textContent.trim(), x: px(r.left), y: px(r.top + scrollY), w: px(r.width), h: px(r.height), blank: Math.max(0, px(blank)), valueLines: value ? Math.round(value.getBoundingClientRect().height / lh) : 0, overflow: el.scrollWidth > el.clientWidth + 1 };
    });
    const pill = document.querySelector("[data-sleep-pill]");
    const pr0 = pill ? pill.getBoundingClientRect() : null;
    const pr = pr0 && pr0.width > 0 ? pr0 : null;
    const sleep = document.querySelector('[data-tile="last-sleep"]');
    const sr = sleep.getBoundingClientRect();
    const label = sleep.querySelector("p").getBoundingClientRect();
    const row = document.querySelector("[data-log-row]").getBoundingClientRect();
    return {
      gridH: px(g.height), tiles,
      pill: pr ? { w: px(pr.width), h: px(pr.height), beside: pr.top < label.bottom - 1 && pr.left >= label.right - 1, inTile: pr.top >= sr.top && pr.bottom <= sr.bottom, labelH: px(label.height) } : null,
      logY: px(row.top + scrollY), rowBottom: px(row.bottom + scrollY), pageOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  const height = Math.min(900, Math.round(m.rowBottom + 24));
  await page.screenshot({ path: `${OUT}/${w}-${v}-${s}.png`, clip: { x: 0, y: 0, width: w, height } });
  facts.push({ w, variant: v, state: s, ...m, height });
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/facts.json`, JSON.stringify(facts, null, 1));
for (const f of facts) {
  const hs = f.tiles.map((t) => t.h).join("/");
  const blank = f.tiles.map((t) => t.blank).join("/");
  const p = f.pill ? `pill ${f.pill.w}x${f.pill.h}${f.pill.beside ? " beside" : ""}${f.pill.inTile ? "" : " outside"}` : "no pill";
  const wrap = f.tiles.some((t) => t.valueLines > 1) ? " WRAP:" + f.tiles.map((t) => t.valueLines).join("") : "";
  const ov = f.tiles.some((t) => t.overflow) || f.pageOverflow > 0 ? ` OVERFLOW(page ${f.pageOverflow})` : "";
  console.log(`${f.w} ${f.variant} ${f.state}: grid ${f.gridH} tiles ${hs} blank ${blank} | ${p} | log at ${f.logY}${wrap}${ov}`);
}

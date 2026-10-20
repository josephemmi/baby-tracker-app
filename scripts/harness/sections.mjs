// The Sleep tab sections with the bigger titles and the "only logged sleeps" notes (JOS-91), at phone and tablet widths.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const HIDE = `nextjs-portal { display: none !important } *, *::before, *::after { animation: none !important; transition: none !important }`;
const plan = [["week", [320, 360, 390, 768]], ["full", [390]]];
for (const [set, widths] of plan) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, timezoneId: "Europe/London", locale: "en-GB", isMobile: w < 600 });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:3100/dev-preview/sleep-sections?w=${w}&set=${set}`);
    await page.addStyleTag({ content: HIDE });
    const sec = page.locator("[data-sections]");
    await sec.waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const heads = [...document.querySelectorAll("[data-sections] h2")].map((h) => {
        const cs = getComputedStyle(h);
        const lines = Math.round(h.getBoundingClientRect().height / parseFloat(cs.lineHeight));
        return { text: h.innerText, size: cs.fontSize, weight: cs.fontWeight, lines, y: Math.round(h.getBoundingClientRect().top + scrollY) };
      });
      const cards = [...document.querySelectorAll("[data-sections] > *")].map((c) => ({ card: c.getAttribute("data-card"), top: Math.round(c.getBoundingClientRect().top + scrollY), h: Math.round(c.getBoundingClientRect().height) }));
      const gaps = cards.slice(1).map((c, i) => c.top - (cards[i].top + cards[i].h));
      return { heads, gaps, pageOverflow: document.documentElement.scrollWidth - innerWidth, pattern: document.querySelector("[data-pattern-note]")?.textContent, logged: document.querySelector("[data-avg-logged]")?.textContent, period: document.querySelector("[data-avg-period]")?.textContent };
    });
    console.log(`${set} ${w}: page overflow ${info.pageOverflow}; section gaps ${info.gaps.join(", ")}`);
    for (const h of info.heads) console.log(`   h2 "${h.text}" ${h.size} w${h.weight} ${h.lines} line(s)`);
    if (w === 390 && set === "week") { console.log("   pattern note:", info.pattern); console.log("   logged note:", info.logged); console.log("   period note:", info.period); }
    await page.screenshot({ path: `${SP}/avg/sections-${set}-${w}.png`, fullPage: true });
    await ctx.close();
  }
}
await browser.close();

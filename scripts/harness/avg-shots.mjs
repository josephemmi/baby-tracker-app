// The Averages section with the new labels and the left-out days, at phone and tablet widths (JOS-90).
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const HIDE = `nextjs-portal { display: none !important } *, *::before, *::after { animation: none !important; transition: none !important }`;
for (const [set, widths] of [["week", [320, 360, 390, 768]], ["gaps", [390]], ["naps", [390]]]) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, timezoneId: "Europe/London", locale: "en-GB" });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:3100/dev-preview/sleep-averages?w=${w}&set=${set}`);
    await page.addStyleTag({ content: HIDE });
    const sec = page.locator('[data-card="averages"]');
    await sec.waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const s = document.querySelector('[data-card="averages"]');
      const cards = [...s.querySelectorAll(".grid > div")].map((c) => ({ label: c.querySelector("p").innerText.replace(/\s+/g, " "), value: c.querySelectorAll("p")[1].innerText, sub: c.querySelectorAll("p")[2]?.innerText ?? "", h: Math.round(c.getBoundingClientRect().height), overflow: c.scrollWidth > c.clientWidth + 1 }));
      return { note: s.querySelector("[data-avg-period]").innerText, cards, pageOverflow: document.documentElement.scrollWidth - innerWidth, footer: [...s.querySelectorAll("p")].pop().innerText };
    });
    await sec.screenshot({ path: `${SP}/avg/${set}-${w}.png` });
    console.log(`${set} ${w}: overflow ${info.pageOverflow}; note: ${info.note}`);
    if (set === "week" && w === 390) { for (const c of info.cards) console.log(`   ${c.label} | ${c.value}${c.sub ? " | " + c.sub : ""} | ${c.h}px${c.overflow ? " OVERFLOW" : ""}`); console.log("   footer:", info.footer); }
    if (set === "week" && w === 320) console.log("   card heights at 320:", info.cards.map((c) => c.h).join(", "), info.cards.some((c) => c.overflow) ? "OVERFLOW" : "no overflow");
    await ctx.close();
  }
}
await browser.close();

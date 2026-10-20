import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, w, h, scheme] of [["phone", 400, 900, "light"], ["desktop", 1200, 900, "light"], ["phone-dark", 400, 900, "dark"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`file://${SP}/tiles-page.html`);
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, "horizontal overflow:", overflow, "errors:", errors.length ? errors : "none");
  await page.screenshot({ path: `${SP}/tiles-page-${name}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();

// Exercises the tile layouts page: every control, every combination renders, no console errors, no horizontal overflow.
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log("FAIL:", msg); } };
for (const [name, w] of [["desktop", 1200], ["phone", 390]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`file://${SP}/tiles-page.html`);
  await page.waitForSelector("#view1 article");
  for (const width of ["640", "768", "1024"]) {
    await page.locator("#seg-width button", { hasText: new RegExp("^" + width) }).click();
    for (const state of ["Sleeping now", "Paused", "Resting"]) {
      await page.locator("#seg-state button", { hasText: state }).click();
      const n = await page.locator("#view1 article").count();
      check(n === 4, `${name} ${width} ${state}: ${n} cards`);
      const srcs = await page.locator("#view1 article img").evaluateAll((els) => els.map((e) => e.src.length));
      check(srcs.every((l) => l > 1000), `${name} ${width} ${state}: an image is missing`);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(ov === 0, `${name} ${width} ${state}: horizontal overflow ${ov}`);
    }
  }
  for (const state of ["Sleeping now", "Paused", "Resting", "Nothing logged"]) {
    await page.locator("#seg-state2 button", { hasText: state }).click();
    const n = await page.locator("#view2 article").count();
    check(n === 5, `${name} phone ${state}: ${n} cards`);
    const srcs = await page.locator("#view2 article img").evaluateAll((els) => els.map((e) => e.src.length));
    check(srcs.every((l) => l > 1000), `${name} phone ${state}: an image is missing`);
  }
  // overlays: A at 768 sleeping has one hatch; N has one; H none
  await page.locator("#seg-width button", { hasText: /^768/ }).click();
  await page.locator("#seg-state button", { hasText: "Sleeping now" }).click();
  const counts = await page.locator("#view1 article").evaluateAll((els) => els.map((e) => e.querySelectorAll(".hatch").length));
  check(JSON.stringify(counts) === "[1,0,0,1]", `hatch counts at 768 sleeping: ${JSON.stringify(counts)} (want A 1, H 0, S 0, N 1)`);
  await page.locator("#seg-hatch button", { hasText: "Hide" }).click();
  const hidden = await page.locator("#view1 .hatch").count();
  check(hidden === 0, `hatch hidden: ${hidden}`);
  await page.locator("#seg-hatch button", { hasText: "Show" }).click();
  await page.locator("#seg-scale button", { hasText: "True size" }).click();
  const imgW = await page.locator("#view1 article img").first().evaluate((e) => e.getBoundingClientRect().width);
  check(Math.round(imgW) === 768, `true size image width ${imgW}`);
  await page.locator("#seg-scale button", { hasText: "Fit" }).click();
  // N card close-up
  const nCard = page.locator("#view1 article").nth(3);
  await nCard.screenshot({ path: `${SP}/tiles-page-n-${name}.png` });
  const aCard640 = null;
  console.log(name, "errors:", errors.length ? errors : "none");
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} FAILURES` : "all page checks passed");

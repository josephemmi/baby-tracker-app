// The spec's check: "compare the app's numbers with the prototype's for the same data".
// Same generated sleeps, same moment, every range: the rendered text of the prototype's Option C and of the app.
import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI } from "./lib.mjs";
import { mock, asOf, DAY0, MIN } from "./mock.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const TIMES = [[375, "early morning 6:15 am"], [465, "morning 7:45 am"], [870, "afternoon 2:30 pm"], [1060, "late afternoon 5:40 pm"], [1260, "evening, paused 9:00 pm"], [1279, "evening, sleeping 9:19 pm"], [1380, "11:00 pm"]];
const RANGES = [["7d", "Last 7 days"], ["30d", "Last 30 days"], ["month", "Monthly"], ["year", "Yearly"], ["all", "All time"]];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const protoCtx = await browser.newContext({ viewport: { width: 393, height: 852 }, timezoneId: "Europe/London", locale: "en-GB" });
const proto = await protoCtx.newPage();
await proto.goto(`file://${SP}/drive-proto/prototype.html`);
await proto.evaluate(() => { document.querySelector("details.dock")?.remove(); });

async function protoSnap(pretend, range) {
  return proto.evaluate(([pretend, range]) => {
    const st = window.__proto.state; st.pretend = pretend; st.base = pretend; st.range = range; st.edits = []; st.sel = { stacked: null, longest: null, pattern: null };
    st.opt = "C"; st.tab = "sleep"; st.screen = "reports"; window.__proto.render();
    const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
    const q = (s) => document.querySelector(s), all = (s) => [...document.querySelectorAll(s)];
    return {
      pill: t(q(".today .spill span")), pillCap: t(q(".today .pillcap")),
      naps: t(q(".today .big")), napsCap: t(q('.today .caption:not(.pillcap)')),
      rows: all(".today .times li").map((li) => [...li.children].map(t)),
      avgPeriod: t(q("[data-avg-period]")),
      cards: all(".stat").map((c) => [t(c.querySelector(".eyebrow")), t(c.querySelector(".v")), t(c.querySelector(".caption"))]),
      patternReadout: t(q('[data-readout="pattern"]')), stackedReadout: t(q('[data-readout="stacked"]')), longestReadout: t(q('[data-readout="longest"]')),
      patternRows: all(".prow").length,
      table: all("table tbody tr").map((tr) => [...tr.children].map(t)),
      empty: t(q(".empty")),
    };
  }, [pretend, range]);
}

async function appSnap(page) {
  return page.evaluate(() => {
    const t = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
    const q = (s) => document.querySelector(s), all = (s) => [...document.querySelectorAll(s)];
    const readout = (card) => t(q(`[data-card="${card}"] [aria-live="polite"]`));
    return {
      pill: t(q('[data-card="today"] [data-sleep-pill]')), pillCap: t(q("[data-pill-caption]")),
      naps: t(q("[data-naps]")), napsCap: t(q("[data-naps-caption]")),
      rows: all('[data-card="today"] [data-row]').map((li) => [...li.children].map(t)),
      avgPeriod: t(q("[data-avg-period]")),
      cards: all('[data-card="averages"] .grid > div').map((c) => { const ps = c.querySelectorAll("p"); return [t(ps[0]), t(ps[1]), ps[2] ? t(ps[2]) : null]; }),
      patternReadout: readout("pattern"), stackedReadout: readout("stacked"), longestReadout: readout("longest"),
      patternRows: all('[data-card="pattern"] [data-row]').length,
      table: all('[aria-label="Sleep summary by day"] tbody tr').map((tr) => [...tr.children].map(t)),
      empty: t(all("b").find((b) => b.textContent.includes("No sleeps in this range"))?.parentElement),
    };
  });
}

let mismatches = 0, checks = 0;
function diff(label, a, b) {
  checks++;
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) { mismatches++; console.log(`✗ ${label}\n   proto: ${A}\n   app:   ${B}`); }
}

for (const [min, name] of TIMES) {
  const T = DAY0 + min * MIN;
  const db = "t_cmp";
  freshDb(db); seedSleeps(db, asOf(mock(), T)); setClock(db, new Date(T).toISOString());
  const { context, page } = await newPhone(browser, { db, user: "joseph", width: 393, time: T });
  await page.goto("http://localhost:3100/dev-preview/sleep-reports?w=393");
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await page.getByText("Naps today").waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  for (const [kind, label] of RANGES) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(250);
    if (kind === "month" || kind === "year") await page.waitForTimeout(150);
    const a = await appSnap(page);
    const p = await protoSnap(min, kind);
    const tag = `${name} / ${label}`;
    // Today card: same for every range
    for (const k of ["pill", "pillCap", "naps", "napsCap", "rows"]) diff(`${tag} · ${k}`, p[k], a[k]);
    if (p.empty) { diff(`${tag} · empty state`, norm(p.empty).replace(/^No sleeps in this range/, "No sleeps in this range "), norm(a.empty ?? "").replace(/^No sleeps in this range/, "No sleeps in this range ")); continue; }
    for (const k of ["avgPeriod", "cards", "patternReadout", "stackedReadout", "longestReadout", "patternRows", "table"]) diff(`${tag} · ${k}`, p[k], a[k]);
  }
  await context.close();
}
console.log(`\n${checks} comparisons, ${mismatches} differences`);
await browser.close();
process.exit(mismatches ? 1 : 0);

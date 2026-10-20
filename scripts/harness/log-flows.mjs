// Two simulated phones, one database (the real SQL functions): Delete sleep, first write wins, Delete then Reopen.
import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, hits, psql, USERS } from "./lib.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const L = (h, m, s = 0) => Date.UTC(2026, 9, 20, h - 1, m, s); // Tue 20 Oct 2026, London (BST)
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${msg}`); };
const eq = (a, b, msg) => ok(a === b, `${msg}${a === b ? "" : `\n     expected ${JSON.stringify(b)}\n     got      ${JSON.stringify(a)}`}`);

const db = "t_flows";
const reset = () => { freshDb(db); seedSleeps(db, [
  { stretches: [{ start: L(13, 0), end: L(13, 40) }] },          // A: a nap, 1:00 to 1:40 pm
  { stretches: [{ start: L(15, 0), end: L(15, 3) }] },           // B: started by mistake, 3:00 to 3:03 pm
]); setClock(db, new Date(L(15, 10)).toISOString()); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function phone(user) {
  const p = await newPhone(browser, { db, user, width: 393, time: L(15, 10) });
  await p.page.goto(`http://localhost:3100/dev-preview/sleep-log?as=${user}&w=393`);
  await p.page.addStyleTag({ content: HIDE_DEV_UI });
  await p.page.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 });
  await p.page.waitForTimeout(600);
  return p;
}
const tile = (page) => page.locator('[data-tile="last-sleep"]').innerText().then((t) => t.replace(/\s+/g, " ").trim());
const refresh = async (page) => { await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.waitForTimeout(700); };
const toast = (page) => page.locator('div[role="status"][aria-live="polite"]').innerText().then((t) => t.trim());
const finished = (page) => page.locator('[data-state="finished"]');

// ---------- 1. the confirm box and Delete sleep on a finished card ----------
reset();
let joseph = await phone("joseph");
eq(await tile(joseph.page), "LAST SLEEP 7m ago Slept 3m", "tile shows the newest finished sleep (B)");
eq(await finished(joseph.page).count(), 2, "two finished cards on Joseph's Log");
const cardB = finished(joseph.page).first();
ok(await cardB.locator("[data-delete-sleep]").isVisible(), "the newest finished card has a Delete sleep button");
const box = await cardB.locator("[data-delete-sleep]").boundingBox();
ok(box.height >= 44, `Delete sleep is at least 44 px tall (${box.height.toFixed(1)})`);
ok(await cardB.locator("button", { hasText: "Reopen sleep" }).count() === 1, "B (newest, inside 3 h) offers Reopen sleep");
const cardA = finished(joseph.page).nth(1);
ok(await cardA.locator("button", { hasText: "Reopen sleep" }).count() === 0, "A has no Reopen while B exists");
eq(await cardA.locator("[data-reopen-hint]").innerText(), "This sleep can't be reopened: a new sleep has started.", "A says why");
// order inside B's button column: Reopen above Delete
const order = await cardB.evaluate((el) => { const r = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reopen sleep"), d = el.querySelector("[data-delete-sleep]"); return r && d && (r.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) ? "Reopen sleep > Delete sleep" : "wrong order"; });
eq(order, "Reopen sleep > Delete sleep", "Reopen sleep comes before Delete sleep");

await cardB.locator("[data-delete-sleep]").click();
const dlg = joseph.page.getByRole("alertdialog");
await dlg.waitFor();
eq((await dlg.locator("#confirm-delete-title").innerText()).trim(), "Delete this sleep?", "confirm title");
eq((await dlg.locator("#confirm-delete-body").innerText()).trim(), "3:00 – 3:03 pm (3m). You can restore it from Recently Deleted.", "confirm body names the sleep");
eq((await dlg.getByRole("button").allInnerTexts()).join("|"), "Cancel|Delete sleep", "buttons: Cancel, Delete sleep");
eq(await joseph.page.evaluate(() => document.activeElement?.textContent?.trim()), "Cancel", "Cancel is selected first");
await joseph.page.screenshot({ path: `${SP}/shots/flow-confirm.png` });
await dlg.getByRole("button", { name: "Cancel" }).click();
eq(await dlg.count(), 0, "Cancel closes the box");
eq(await finished(joseph.page).count(), 2, "and nothing was deleted");

// ---------- 2. Delete sleep, then Reopen on the previous sleep ----------
setClock(db, new Date(L(15, 11)).toISOString());
await cardB.locator("[data-delete-sleep]").click();
await joseph.page.getByRole("alertdialog").getByRole("button", { name: "Delete sleep" }).click();
await joseph.page.waitForTimeout(800);
eq(await finished(joseph.page).count(), 1, "B left the Log");
// the server says 3:11 pm and A ended at 1:40 pm: the delete reply moved the phone's clock (it was a minute behind) and the tile redrew at once
eq(await tile(joseph.page), "LAST SLEEP 1h 31m ago Slept 40m", "tile falls back to A (the sleep before it), on the server's clock");
const cardA2 = finished(joseph.page).first();
ok(await cardA2.locator("button", { hasText: "Reopen sleep" }).count() === 1, "A can be reopened again (still inside 3 h of 1:40 pm)");
const row = psql(db, `select deleted_by is not null, last_action, rev from public.sleeps where started_at = '${new Date(L(15, 0)).toISOString()}'`);
eq(row, "t|delete|2", "B is soft-deleted in the database (by Joseph), one rev on");
setClock(db, new Date(L(15, 12)).toISOString());
await cardA2.locator("button", { hasText: "Reopen sleep" }).click();
await joseph.page.waitForTimeout(800);
eq(await joseph.page.locator('[data-state="paused"]').count(), 1, "Reopen worked: A is a paused card again");
// A is the only completed sleep and has just been reopened, so it is no longer complete: the tile has nothing to show
// but the pill (the model: it always shows the last COMPLETED sleep).
eq(await tile(joseph.page), "LAST SLEEP Not logged yet Paused · 40m", "reopened (the only sleep): the tile has no completed sleep, the pill says Paused · 40m");
await joseph.context.close();

// ---------- 3. Jen deletes first; Joseph's card has not refreshed yet ----------
reset();
joseph = await phone("joseph");
let jen = await phone("jen");
setClock(db, new Date(L(15, 11, 20)).toISOString());
await finished(jen.page).first().locator("[data-delete-sleep]").click();
await jen.page.getByRole("alertdialog").getByRole("button", { name: "Delete sleep" }).click();
await jen.page.waitForTimeout(800);
eq(await finished(jen.page).count(), 1, "Jen deleted B");
// Joseph still sees B (no refresh yet) and taps Delete sleep on it
eq(await finished(joseph.page).count(), 2, "Joseph's phone still shows B");
setClock(db, new Date(L(15, 11, 40)).toISOString());
await finished(joseph.page).first().locator("[data-delete-sleep]").click();
await joseph.page.getByRole("alertdialog").getByRole("button", { name: "Delete sleep" }).click();
await joseph.page.waitForTimeout(900);
eq(await toast(joseph.page), "Jen already deleted this sleep (3:11 pm).", "Joseph is told who got there first, and when");
await joseph.page.screenshot({ path: `${SP}/shots/flow-gone-toast.png` });
eq(await finished(joseph.page).count(), 1, "and the card is gone from his Log");
ok(/^LAST SLEEP 1h 3[0-2]m ago Slept 40m$/.test(await tile(joseph.page)), "tile fell back to A (its minutes follow the 30 s tick)");
await joseph.context.close(); await jen.context.close();

// ---------- 4. Jen deletes first, and Joseph's phone already refreshed while his confirm box is open ----------
reset();
joseph = await phone("joseph"); jen = await phone("jen");
await finished(joseph.page).first().locator("[data-delete-sleep]").click();
await joseph.page.getByRole("alertdialog").waitFor();
setClock(db, new Date(L(15, 11, 5)).toISOString());
await finished(jen.page).first().locator("[data-delete-sleep]").click();
await jen.page.getByRole("alertdialog").getByRole("button", { name: "Delete sleep" }).click();
await jen.page.waitForTimeout(800);
await refresh(joseph.page);                               // his poll lands: B disappears from under the open box
eq(await finished(joseph.page).count(), 1, "B vanished from Joseph's list while his box is open");
ok(await joseph.page.getByRole("alertdialog").isVisible(), "the box is still open, still saying what it said");
eq((await joseph.page.locator("#confirm-delete-body").innerText()).trim(), "3:00 – 3:03 pm (3m). You can restore it from Recently Deleted.", "with the same words");
setClock(db, new Date(L(15, 11, 30)).toISOString());
await joseph.page.getByRole("alertdialog").getByRole("button", { name: "Delete sleep" }).click();
await joseph.page.waitForTimeout(900);
eq(await toast(joseph.page), "Jen already deleted this sleep (3:11 pm).", "he still learns who and when");
await joseph.context.close(); await jen.context.close();

// ---------- 5. Jen reopens A... no: Jen changes B first, Joseph's Delete loses with her action named ----------
reset();
joseph = await phone("joseph"); jen = await phone("jen");
setClock(db, new Date(L(15, 11)).toISOString());
await finished(jen.page).first().locator("button", { hasText: "Reopen sleep" }).click();   // Jen reopens B
await jen.page.waitForTimeout(800);
setClock(db, new Date(L(15, 11, 30)).toISOString());
await finished(joseph.page).first().locator("[data-delete-sleep]").click();                 // Joseph deletes B on the version he saw
await joseph.page.getByRole("alertdialog").getByRole("button", { name: "Delete sleep" }).click();
await joseph.page.waitForTimeout(900);
eq(await toast(joseph.page), "Jen already reopened this sleep (3:03 pm).", "a delete on a stale card loses and names what Jen did");
eq(psql(db, `select deleted_at is null from public.sleeps where started_at = '${new Date(L(15, 0)).toISOString()}'`), "t", "B was not deleted");
await joseph.context.close(); await jen.context.close();

// ---------- 6. the x on a RUNNING card still works and keeps its older words ----------
reset(); psql(db, `update public.sleeps set closed_at = null, segments = '[{"start": "${new Date(L(15, 0)).toISOString()}", "end": null}]'::jsonb where started_at = '${new Date(L(15, 0)).toISOString()}'`);
joseph = await phone("joseph");
ok(await joseph.page.locator('[data-state="asleep"] [data-delete-sleep]').count() === 0, "a running card has no Delete sleep button");
await joseph.page.locator('[data-state="asleep"] button[aria-label="Delete this sleep"]').click();
const d2 = joseph.page.getByRole("alertdialog");
eq((await d2.locator("#confirm-delete-body").innerText()).trim(), "You can restore it from Recently Deleted in Timeline for 7 days.", "× on a running sleep: the plain words");
eq((await d2.getByRole("button").allInnerTexts()).join("|"), "Cancel|Delete", "× on a running sleep: Cancel|Delete");
await d2.getByRole("button", { name: "Cancel" }).click();
await joseph.context.close();

console.log(`\n${pass} passed, ${fail} failed`);
console.log("errors:", JSON.stringify(hits.filter((h) => h.kind === "error" || h.kind === "unhandled").slice(0, 5)));
await browser.close();
process.exit(fail ? 1 : 0);

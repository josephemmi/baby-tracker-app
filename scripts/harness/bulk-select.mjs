// JOS-92 on the harness: the Delete sleep button is gone, and sleep cards take part in Edit-mode bulk delete.
// Real SQL functions in a scratch Postgres, answering the browser's Supabase calls per simulated phone.
import { chromium, freshDb, seedSleeps, setClock, newPhone, installApi, HIDE_DEV_UI, hits, psql, asUser, ENTRY_ROWS, USERS, BABY } from "./lib.mjs";
const SP = (process.env.HARNESS_OUT ?? "/tmp/harness-out");
const L = (h, m, s = 0) => Date.UTC(2026, 9, 20, h - 1, m, s); // Tue 20 Oct 2026, London (BST)
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${msg}`); };
const eq = (a, b, msg) => ok(a === b, `${msg}${a === b ? "" : `\n     expected ${JSON.stringify(b)}\n     got      ${JSON.stringify(a)}`}`);
const iso = (ms) => new Date(ms).toISOString();

const db = "t_bulk";
// The same three entries the dev-preview route starts from (a refetch must give them back).
const entry = (id, type, timestamp, extra = {}) => ({
  id, baby_id: BABY, logged_by: USERS.joseph, type, timestamp, notes: null, amount_ml: null, bottle: false, breast: false,
  breast_right_seconds: 0, breast_left_seconds: 0, breast_active_side: null, breast_active_started_at: null,
  breast_session_ended: false, created_at: timestamp, deleted_at: null, deleted_by: null, ...extra,
});
const ENTRY_SEED = [
  entry("e0000000-0000-0000-0000-000000000003", "poop", "2026-10-20T11:20:00.000Z"),
  entry("e0000000-0000-0000-0000-000000000002", "pee", "2026-10-20T10:10:00.000Z"),
  entry("e0000000-0000-0000-0000-000000000001", "feed", "2026-10-20T07:05:00.000Z", { bottle: true, amount_ml: 120 }),
];
const PEE = "e0000000-0000-0000-0000-000000000002";

const SLEEPS = {
  N: { stretches: [{ start: Date.UTC(2026, 9, 19, 18, 30), end: Date.UTC(2026, 9, 20, 5, 50) }] }, // Mon 7:30 pm to Tue 6:50 am
  P1: { stretches: [{ start: L(9, 30), end: L(10, 15) }] },                                          // 9:30 to 10:15 am
  P2: { stretches: [{ start: L(13, 0), end: L(13, 40) }] },                                          // 1:00 to 1:40 pm
  R: { stretches: [{ start: L(15, 0), end: null }], closedAt: null },                                // running since 3:00 pm
};
const reset = ({ running = true } = {}) => {
  freshDb(db);
  seedSleeps(db, [SLEEPS.N, SLEEPS.P1, SLEEPS.P2, ...(running ? [SLEEPS.R] : [])]);
  setClock(db, iso(L(15, 10)));
  ENTRY_ROWS.length = 0; ENTRY_ROWS.push(...ENTRY_SEED.map((e) => ({ ...e })));
};
const ids = () => {
  const out = {};
  for (const [k, s] of Object.entries(SLEEPS)) {
    const r = psql(db, `select id from public.sleeps where started_at = '${iso(s.stretches[0].start)}'`);
    if (r) out[k] = r;
  }
  return out;
};
const state = (id) => psql(db, `select (deleted_at is not null) || '|' || coalesce(deleted_by::text,'-') || '|' || (closed_at is not null) || '|' || rev from public.sleeps where id = '${id}'`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const patches = [];
let rpcAbort = null; // (fn, nth) => boolean, set per scenario
async function phone(user, width = 393) {
  const p = await newPhone(browser, { db, user, width, time: L(15, 10) });
  // On top of the harness: soft-deleting entries really removes them from what a refetch returns; and a delete_sleep call can be dropped like a lost connection.
  let deleteCalls = 0;
  p.deleteCalls = () => deleteCalls;
  await p.context.route(/localhost:54321\/rest\/v1\/entries/, async (route) => {
    const req = route.request();
    if (req.method() === "PATCH") {
      const q = decodeURIComponent(new URL(req.url()).search);
      patches.push({ user, q, body: req.postData() });
      const m = /id=in\.\(([^)]*)\)/.exec(q);
      if (m) for (const id of m[1].split(",")) { const i = ENTRY_ROWS.findIndex((r) => r.id === id.replace(/"/g, "")); if (i >= 0) ENTRY_ROWS.splice(i, 1); }
    }
    return route.fallback();
  });
  await p.context.route(/localhost:54321\/rest\/v1\/rpc\/delete_sleep/, async (route) => {
    deleteCalls += 1;
    if (rpcAbort && rpcAbort(deleteCalls)) return route.abort("connectionfailed");
    return route.fallback();
  });
  await p.page.goto(`http://localhost:3100/dev-preview/sleep-log?as=${user}&w=${width}`);
  await p.page.addStyleTag({ content: HIDE_DEV_UI });
  await p.page.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 });
  await p.page.waitForTimeout(700);
  return p;
}
const refresh = async (page) => { await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await page.waitForTimeout(800); };
const toast = (page) => page.locator('div[role="status"][aria-live="polite"]').innerText().then((t) => t.trim());
const sleepCards = (page) => page.locator("[data-sleep-card]");
const card = (page, id) => page.locator(`[data-sleep-card="${id}"]`);
const tickSleep = (page, id) => card(page, id).locator('input[aria-label="Select sleep"]').check();
const edit = (page) => page.getByRole("button", { name: "Edit", exact: true }).click();
const toolbarDelete = (page) => page.getByRole("button", { name: /^Delete( \(\d+\))?$/ });
const box = (page) => page.getByRole("alertdialog");
const boxText = async (page) => ({ title: (await box(page).locator("#confirm-delete-title").innerText()).trim(), body: (await box(page).locator("#confirm-delete-body").innerText()).trim(), buttons: (await box(page).getByRole("button").allInnerTexts()).join("|") });

// ---------- 1. the button is gone, the cross stays, Edit shows a tick box ----------
reset();
let K = ids();
let joseph = await phone("joseph");
eq(await sleepCards(joseph.page).count(), 4, "four sleep cards on the Log (night, two naps, one running)");
eq(await joseph.page.locator("[data-delete-sleep]").count(), 0, "no Delete sleep button anywhere");
eq(await joseph.page.getByRole("button", { name: "Delete sleep", exact: true }).count(), 0, "and no button named Delete sleep");
eq(await joseph.page.getByRole("button", { name: "Delete this sleep" }).count(), 4, "every sleep card still has the × (Delete this sleep)");
eq(await joseph.page.locator('input[aria-label="Select sleep"], input[aria-label="Select card"]').count(), 0, "no tick boxes outside Edit mode");
const finishedCard = card(joseph.page, K.P2);
eq(await finishedCard.locator("[data-reopen-hint]").count(), 1, "a finished card says why it cannot be reopened, as before");

// the Sleep tile's notice on a finished card, and on a running one
// the tiles are labels around a checkbox: click the Sleep one inside the card
await finishedCard.locator("label", { hasText: "Sleep" }).first().click();
await joseph.page.waitForTimeout(250);
eq(await toast(joseph.page), "To delete this sleep, tap the × at the top of the card.", "the Sleep tile on a finished card points to the ×");
await card(joseph.page, K.R).locator("label", { hasText: "Sleep" }).first().click();
await joseph.page.waitForTimeout(250);
eq(await toast(joseph.page), "Use Pause Sleep or Stop Sleep below.", "and on a running card is as it was");

await edit(joseph.page);
eq(await joseph.page.locator('input[aria-label="Select sleep"]').count(), 4, "Edit shows a tick box on all four sleep cards");
eq(await joseph.page.locator('input[aria-label="Select card"]').count(), 3, "and on the three moment cards");
eq(await joseph.page.getByRole("button", { name: "Delete", exact: true }).isDisabled(), true, "Delete is disabled with nothing ticked");
eq(await joseph.page.getByRole("button", { name: "Delete this sleep" }).count(), 4, "the × stays in Edit mode, as on moment cards");
await joseph.page.screenshot({ path: `${SP}/shots/bulk-edit-mode.png`, fullPage: true });
await tickSleep(joseph.page, K.P1);
eq((await toolbarDelete(joseph.page).innerText()).trim(), "Delete (1)", "ticking a sleep counts it");
await joseph.page.locator('input[aria-label="Select card"]').nth(1).check();
eq((await toolbarDelete(joseph.page).innerText()).trim(), "Delete (2)", "a moment and a sleep count together");
await joseph.page.locator('input[aria-label="Select card"]').nth(1).uncheck();
await card(joseph.page, K.P1).locator('input[aria-label="Select sleep"]').uncheck();
eq(await joseph.page.getByRole("button", { name: "Delete", exact: true }).isDisabled(), true, "unticking everything disables Delete again");
await joseph.page.getByRole("button", { name: "Done", exact: true }).click();
eq(await joseph.page.locator('input[aria-label="Select sleep"], input[aria-label="Select card"]').count(), 0, "Done takes the tick boxes away");
await joseph.context.close();

// ---------- 2. a moment and a finished sleep, deleted together ----------
reset(); K = ids();
patches.length = 0;
joseph = await phone("joseph");
await edit(joseph.page);
await tickSleep(joseph.page, K.P2);
await joseph.page.locator('input[aria-label="Select card"]').nth(1).check(); // the pee
await toolbarDelete(joseph.page).click();
let b = await boxText(joseph.page);
eq(b.title, "Delete 1 logged moment and 1 sleep?", "the box counts both");
eq(b.body, "You can restore them from Recently Deleted in Timeline for 7 days.", "and says they can be restored");
eq(b.buttons, "Cancel|Delete", "Cancel and Delete");
await joseph.page.screenshot({ path: `${SP}/shots/bulk-box-mixed.png` });
await box(joseph.page).getByRole("button", { name: "Delete", exact: true }).click();
await joseph.page.waitForTimeout(1000);
eq(await box(joseph.page).count(), 0, "the box closes");
eq(await sleepCards(joseph.page).count(), 3, "the sleep left the Log");
eq(await joseph.page.locator('input[aria-label="Select card"]').count(), 0, "Edit mode ended (no tick boxes)");
eq(await joseph.page.getByRole("button", { name: "Edit", exact: true }).count(), 1, "the Edit button is back");
eq(state(K.P2), "true|" + USERS.joseph + "|true|2", "P2 is soft-deleted in the database, by Joseph");
ok(patches.some((p) => p.q.includes(PEE)), "and the pee entry was soft-deleted with it");
eq(hits.filter((h) => h.kind === "rpc" && h.fn === "delete_sleep").length >= 1, true, "through delete_sleep");
await joseph.context.close();

// ---------- 3. two sleeps, one of them still running ----------
reset(); K = ids();
joseph = await phone("joseph");
await edit(joseph.page);
await tickSleep(joseph.page, K.R);
await tickSleep(joseph.page, K.P1);
await toolbarDelete(joseph.page).click();
b = await boxText(joseph.page);
eq(b.title, "Delete 2 sleeps?", "two sleeps: the box counts sleeps");
eq(b.body, "You can restore them from Recently Deleted in Timeline for 7 days. A sleep that is still going will be stopped.", "and says the one still going is stopped");
await joseph.page.screenshot({ path: `${SP}/shots/bulk-box-running.png` });
await box(joseph.page).getByRole("button", { name: "Delete", exact: true }).click();
await joseph.page.waitForTimeout(1200);
eq(await sleepCards(joseph.page).count(), 2, "both left the Log");
eq(state(K.R), "true|" + USERS.joseph + "|true|2", "the running sleep was stopped and deleted (closed, soft-deleted)");
eq(state(K.P1), "true|" + USERS.joseph + "|true|2", "and the nap");
await joseph.context.close();

// ---------- 4. Cancel keeps the ticks; one sleep only reads in the singular ----------
reset(); K = ids();
joseph = await phone("joseph");
await edit(joseph.page);
await tickSleep(joseph.page, K.P2);
await toolbarDelete(joseph.page).click();
b = await boxText(joseph.page);
eq(b.title, "Delete 1 sleep?", "one sleep: singular");
eq(b.body, "You can restore it from Recently Deleted in Timeline for 7 days.", "and 'it'");
await box(joseph.page).getByRole("button", { name: "Cancel" }).click();
eq(await box(joseph.page).count(), 0, "Cancel closes the box");
eq((await toolbarDelete(joseph.page).innerText()).trim(), "Delete (1)", "the tick is still there");
eq(await card(joseph.page, K.P2).locator('input[aria-label="Select sleep"]').isChecked(), true, "on the card");
eq(state(K.P2), "false|-|true|1", "nothing was deleted");
await joseph.context.close();

// ---------- 5. moments only: the box reads as it always did ----------
reset(); K = ids(); patches.length = 0; hits.length = 0;
joseph = await phone("joseph");
await edit(joseph.page);
await joseph.page.locator('input[aria-label="Select card"]').nth(0).check();
await joseph.page.locator('input[aria-label="Select card"]').nth(1).check();
await toolbarDelete(joseph.page).click();
b = await boxText(joseph.page);
eq(b.title, "Delete 2 logged moments?", "two moments: the old title");
eq(b.body, "You can restore them from Recently Deleted in Timeline for 7 days.", "the old words");
await box(joseph.page).getByRole("button", { name: "Delete", exact: true }).click();
await joseph.page.waitForTimeout(900);
eq(await joseph.page.locator('input[aria-label="Select card"]').count(), 0, "done and out of Edit mode");
eq(await sleepCards(joseph.page).count(), 4, "no sleep touched");
eq(hits.filter((h) => h.kind === "rpc" && h.fn === "delete_sleep").length, 0, "no delete_sleep call");
await joseph.context.close();

// ---------- 6. the other parent got to one of them first ----------
reset(); K = ids();
joseph = await phone("joseph");
setClock(db, iso(L(15, 12)));
const rrev = psql(db, `select rev from public.sleeps where id = '${K.R}'`);
asUser(db, "jen", `select public.pause_sleep('${K.R}'::uuid, ${rrev})`);          // Jen pauses the running sleep
await edit(joseph.page);
await tickSleep(joseph.page, K.R);
await tickSleep(joseph.page, K.P1);
await toolbarDelete(joseph.page).click();
await box(joseph.page).getByRole("button", { name: "Delete", exact: true }).click();
await joseph.page.waitForTimeout(1300);
eq(state(K.P1), "true|" + USERS.joseph + "|true|2", "the nap was deleted");
eq(psql(db, `select deleted_at is null from public.sleeps where id = '${K.R}'`), "t", "the sleep Jen paused was not");
const t6 = await toast(joseph.page);
ok(/^Jen already paused this sleep \(3:1\d pm\)\.$/.test(t6), `Joseph is told who got there first: "${t6}"`);
eq(await joseph.page.locator('[data-state="paused"]').count(), 1, "and that card now shows as paused, as Jen left it");
await joseph.page.screenshot({ path: `${SP}/shots/bulk-conflict.png` });
await joseph.context.close();

// ---------- 7. two of them changed under him: the count, then the first answer ----------
reset({ running: false }); K = ids();
joseph = await phone("joseph");
psql(db, `update public.sleeps set rev = rev + 1, last_by = '${USERS.jen}', last_action = 'reopen', last_at = '${iso(L(15, 11))}' where id in ('${K.P1}', '${K.P2}')`);
await edit(joseph.page);
await tickSleep(joseph.page, K.P1);
await tickSleep(joseph.page, K.P2);
await tickSleep(joseph.page, K.N);
await toolbarDelete(joseph.page).click();
await box(joseph.page).getByRole("button", { name: "Delete", exact: true }).click();
await joseph.page.waitForTimeout(1500);
const t7 = await toast(joseph.page);
ok(/^2 sleeps weren't deleted\. Jen already reopened this sleep \(/.test(t7), `two stayed, so a count then the first answer: "${t7}"`);
eq(state(K.N).startsWith("true"), true, "the third (untouched) sleep was still deleted");
eq(psql(db, `select count(*) from public.sleeps where deleted_at is null`), "2", "two sleeps remain");
await joseph.context.close();

// ---------- 8. the connection drops after the first: the rest are not tried ----------
reset({ running: false }); K = ids();
joseph = await phone("joseph");
rpcAbort = (n) => n >= 2;
await edit(joseph.page);
await tickSleep(joseph.page, K.P1);
await tickSleep(joseph.page, K.P2);
await tickSleep(joseph.page, K.N);
await toolbarDelete(joseph.page).click();
await box(joseph.page).getByRole("button", { name: "Delete", exact: true }).click();
await joseph.page.waitForTimeout(1500);
eq(joseph.deleteCalls(), 2, "after the call that failed, the remaining one was not sent");
const t8 = await toast(joseph.page);
eq(t8, "2 sleeps weren't deleted. Couldn't reach the server. Try again.", "the toast counts the failed one and the one never tried");
eq(psql(db, `select count(*) from public.sleeps where deleted_at is not null`), "1", "exactly one was deleted");
rpcAbort = null;
await joseph.context.close();

// ---------- 9. a tick on a sleep the other parent deleted is dropped from the count ----------
reset(); K = ids();
joseph = await phone("joseph");
let jen = await phone("jen");
await edit(joseph.page);
await tickSleep(joseph.page, K.P1);
await tickSleep(joseph.page, K.P2);
eq((await toolbarDelete(joseph.page).innerText()).trim(), "Delete (2)", "two ticked");
setClock(db, iso(L(15, 14)));
await card(jen.page, K.P1).getByRole("button", { name: "Delete this sleep" }).click();
await box(jen.page).getByRole("button", { name: /^Delete/ }).click();
await jen.page.waitForTimeout(900);
await refresh(joseph.page);
eq(await sleepCards(joseph.page).count(), 3, "P1 left Joseph's Log when his phone refreshed");
eq((await toolbarDelete(joseph.page).innerText()).trim(), "Delete (1)", "and is no longer counted");
await toolbarDelete(joseph.page).click();
eq((await boxText(joseph.page)).title, "Delete 1 sleep?", "nor asked about");
await box(joseph.page).getByRole("button", { name: "Cancel" }).click();
await joseph.context.close(); await jen.context.close();

// ---------- 10. the × on a finished card is unchanged ----------
reset({ running: false }); K = ids();
joseph = await phone("joseph");
await card(joseph.page, K.P2).getByRole("button", { name: "Delete this sleep" }).click();
b = await boxText(joseph.page);
eq(b.title, "Delete this sleep?", "× on a finished sleep: title");
eq(b.body, "1:00 – 1:40 pm (40m). You can restore it from Recently Deleted.", "names the sleep");
eq(b.buttons, "Cancel|Delete sleep", "Cancel|Delete sleep");
await box(joseph.page).getByRole("button", { name: "Delete sleep" }).click();
await joseph.page.waitForTimeout(800);
eq(await sleepCards(joseph.page).count(), 2, "and it goes (three sleeps before, two after)");
await joseph.context.close();

// ---------- 11. widths: the header with a tick box, a day prefix and the who-pill ----------
for (const w of [320, 360, 393, 768, 1024]) {
  reset({ running: w !== 320 }); K = ids();
  const p = await phone("joseph", w);
  await edit(p.page);
  await p.page.waitForTimeout(300);
  const m = await p.page.evaluate((nightId) => {
    const c = document.querySelector(`[data-sleep-card="${nightId}"]`);
    const header = c.querySelector(".pr-7");
    const hb = header.getBoundingClientRect();
    const kids = [...header.children].map((k) => k.getBoundingClientRect());
    const cb = c.querySelector('input[type="checkbox"]').getBoundingClientRect();
    const timeEl = header.querySelector("span.font-bold, button.font-bold");
    return {
      cardW: Math.round(c.getBoundingClientRect().width),
      headerH: Math.round(hb.height),
      headerOverflow: header.scrollWidth - header.clientWidth,
      leftRight: Math.round(kids[0].right), pillLeft: Math.round(kids[1].left),
      cbLeft: Math.round(cb.left - hb.left), cbSize: Math.round(cb.width),
      timeText: timeEl?.textContent, dayPrefix: header.querySelector(".text-ink-soft")?.textContent ?? null,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  }, K.N);
  console.log(`   ${w}px: card ${m.cardW}, header ${m.headerH}px tall, header overflow ${m.headerOverflow}, left cluster ends ${m.leftRight} / pill starts ${m.pillLeft}, tick box ${m.cbSize}px at ${m.cbLeft}, "${m.dayPrefix ?? ""} ${m.timeText}", page overflow ${m.pageOverflow}`);
  ok(m.headerOverflow <= 0 && m.leftRight <= m.pillLeft && m.pageOverflow <= 0, `${w}px: the header fits (no overlap, no sideways scroll)`);
  if ([320, 393, 768].includes(w)) await p.page.screenshot({ path: `${SP}/shots/bulk-edit-${w}.png`, fullPage: true });
  if (w >= 768) {
    // the wide layout: tick one of the stacked cards and delete it
    await tickSleep(p.page, K.P2);
    await toolbarDelete(p.page).click();
    eq((await boxText(p.page)).title, "Delete 1 sleep?", `${w}px: the stacked sleep cards take part too`);
    await box(p.page).getByRole("button", { name: "Delete", exact: true }).click();
    await p.page.waitForTimeout(900);
    eq(state(K.P2).startsWith("true"), true, `${w}px: and it was deleted`);
  }
  await p.context.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
console.log("errors:", JSON.stringify(hits.filter((h) => h.kind === "error" || h.kind === "unhandled").slice(0, 5)));
await browser.close();
process.exit(fail ? 1 : 0);

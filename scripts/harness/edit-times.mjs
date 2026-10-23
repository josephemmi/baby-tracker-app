// JOS-103 on the harness: the Edit times sheet, the 12-hour wheel, and the rules, against the REAL SQL
// (edit_sleep_times) in a scratch Postgres, with the real component tree (route `sleep-log`) in Chromium.
// A phone set to British English, whose own time fields show 24-hour times: nothing in the sheet may.
// Run from the repo root with the dev server on :3100 (see README.md).
import { chromium, freshDb, seedSleeps, setClock, newPhone, HIDE_DEV_UI, psql, ENTRY_ROWS, USERS, BABY } from "./lib.mjs";
const OUT = process.env.HARNESS_OUT ?? "/tmp/harness-out";
const SHOTS = process.env.SHOTS === "1";
// Wed 21 Oct 2026, London (BST = UTC+1)
const L = (h, m = 0, s = 0, day = 21) => Date.UTC(2026, 9, day, h - 1, m, s);
let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${msg}`); };
const eq = (a, b, msg) => ok(a === b, `${msg}${a === b ? "" : `\n     expected ${JSON.stringify(b)}\n     got      ${JSON.stringify(a)}`}`);
const iso = (ms) => new Date(ms).toISOString();
const db = "t_edit";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const sleepsOf = () => JSON.parse(psql(db, "select coalesce(jsonb_agg(to_jsonb(s) order by started_at), '[]') from public.sleeps s where deleted_at is null"));
const rowOf = (id) => JSON.parse(psql(db, `select to_jsonb(s) from public.sleeps s where id = '${id}'`));
// Stretches as [start, end] pairs (jsonb does not keep key order) and instants as ISO text.
const pairs = (row) => JSON.stringify(row.segments.map((g) => [g.start, g.end]));
const want = (list) => JSON.stringify(list.map(([a, b]) => [iso(a), b == null ? null : iso(b)]));
const at = (v) => (v == null ? null : new Date(v).toISOString());
const idAt = (ms) => psql(db, `select id from public.sleeps where started_at = '${iso(ms)}' and deleted_at is null`);

// The three entries the dev-preview route starts from. A refetch must give them back: if it answered with
// none the day groups would change under the card, which remounts it and closes an open sheet (a harness
// artefact, not the app).
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

function reset(sleeps, now) {
  freshDb(db);
  seedSleeps(db, sleeps);
  setClock(db, iso(now));
  ENTRY_ROWS.length = 0;
  ENTRY_ROWS.push(...ENTRY_SEED.map((e) => ({ ...e })));
}

async function phone(user, now, width = 390) {
  const p = await newPhone(browser, { db, user, width, time: now });
  await p.page.goto(`http://localhost:3100/dev-preview/sleep-log?as=${user}&w=${width}`);
  await p.page.addStyleTag({ content: HIDE_DEV_UI });
  await p.page.getByText("Last sleep", { exact: true }).waitFor({ timeout: 30000 });
  await p.page.waitForTimeout(700);
  return p;
}
const card = (page, id) => page.locator(`[data-sleep-card="${id}"]`);
const sheet = (page) => page.locator("[data-edit-times-sheet]");
const openSheet = async (page, id) => {
  await card(page, id).locator("button[data-edit-times]").click();
  await sheet(page).waitFor();
};
const field = (page, f) => sheet(page).locator(`[data-field="${f}"]`);
const timeText = async (page, f) => (await field(page, f).locator("button[aria-expanded]").innerText()).trim();
const errText = async (page, f) => (await field(page, f).locator('p[role="alert"]').innerText()).trim();
const dateText = async (page, f) => (await field(page, f).locator("[data-date]").innerText()).trim();
const summary = (page) => sheet(page).locator('p[role="status"]').first().innerText().then((t) => t.trim());
const noteLine = (page) => sheet(page).locator('p[role="status"]').last().innerText().then((t) => t.trim());
const saveBtn = (page) => sheet(page).getByRole("button", { name: "Save times" });
const toast = (page) => page.locator('div[role="status"][aria-live="polite"]').innerText().then((t) => t.trim());
const shot = async (page, name, el) => { if (!SHOTS) return; await (el ?? page).screenshot({ path: `${OUT}/shots/edit-${name}.png` }); };

// Set a field through the wheel: open the row, tap the hour, the minute and AM/PM, tap Done.
async function setTime(page, f, h, m, half) {
  const row = field(page, f);
  if ((await row.locator("button[aria-expanded]").getAttribute("aria-expanded")) !== "true") await row.locator("button[aria-expanded]").click();
  const wheel = row.locator('[role="group"][aria-label="Pick a time"]');
  await wheel.waitFor();
  await wheel.locator('[aria-label="Hour"] button', { hasText: new RegExp(`^${h}$`) }).click();
  await wheel.locator('[aria-label="Minute"] button', { hasText: new RegExp(`^${String(m).padStart(2, "0")}$`) }).click();
  await wheel.locator('[aria-label="AM or PM"] button', { hasText: half.toUpperCase() }).click();
  await wheel.getByRole("button", { name: "Done" }).click();
}

// ---------- 1. the controls, on running, paused and finished cards; no old controls; no native time field ----------
{
  const now = L(19, 30);
  reset([
    { stretches: [{ start: L(8, 0), end: L(9, 0) }] },                                                       // finished nap
    { stretches: [{ start: L(17, 40), end: L(18, 20) }, { start: L(18, 40), end: null }], closedAt: null },  // running, one pause
  ], now);
  const p = await phone("joseph", now);
  const cards = p.page.locator("[data-sleep-card]");
  eq(await cards.count(), 2, "1 two sleep cards");
  for (const c of await cards.all()) {
    const state = await c.getAttribute("data-state");
    const editControls = await c.getByRole("button", { name: "Edit times" }).count();
    eq(editControls, 1, `1 the ${state} card has exactly one Edit times control`);
    for (const gone of ["Started earlier?", "Woke earlier?", "Reopen sleep", "Continue sleep", "Cancel pause", "Delete sleep"]) {
      eq(await c.getByText(gone).count(), 0, `1 the ${state} card has no "${gone}"`);
    }
    eq(await c.locator('input[type="time"]').count(), 0, `1 the ${state} card has no native time field`);
  }
  // the control is a link on a running card and a button on a finished one
  const running = p.page.locator('[data-sleep-card][data-state="asleep"] button[data-edit-times]');
  eq(await running.evaluate((el) => getComputedStyle(el).textDecorationLine), "underline", "1 a link on the running card");
  const finished = p.page.locator('[data-sleep-card][data-state="finished"] button[data-edit-times]');
  eq(await finished.evaluate((el) => getComputedStyle(el).borderRadius !== "0px"), true, "1 a button on the finished card");
  // the old start-time button in the card header is plain text now
  eq(await p.page.locator('[data-sleep-card][data-state="asleep"] button', { hasText: /^5:40 pm$/ }).count(), 0, "1 the start time in the header is not a control");
  await p.context.close();
}


// ---------- 2. the sheet: structure, 12-hour times, dates, layout at 320, 360 and 390 ----------
for (const width of [390, 360, 320]) {
  const now = L(10, 5);
  reset([{ stretches: [{ start: L(8, 0), end: L(8, 20) }, { start: L(8, 30), end: L(9, 0) }] }], now);
  const p = await phone("joseph", now, width);
  const id = idAt(L(8, 0));
  await openSheet(p.page, id);
  const s = sheet(p.page);
  if (width === 390) {
    eq((await s.locator("h3").first().innerText()).trim(), "Edit times", "2 title");
    ok((await s.innerText()).includes("Tap a time to change it. The date follows the sleep. Nothing saves until you tap Save."), "2 the one-line help");
    eq(await s.locator("[data-block]").count(), 1, "2 one block for the one pause, none empty");
    eq(await s.locator('[data-block="new"]').count(), 0, "2 no blank pause block when the sheet opens");
    eq(await timeText(p.page, "ss"), "8:00 am", "2 Sleep started");
    eq(await timeText(p.page, "se"), "9:00 am", "2 Sleep ended");
    eq(await timeText(p.page, "p0s"), "8:20 am", "2 Pause 1 started");
    eq(await timeText(p.page, "p0e"), "8:30 am", "2 Pause 1 ended");
    for (const f of ["ss", "se", "p0s", "p0e"]) eq(await dateText(p.page, f), "Wed 21 Oct", `2 ${f} shows its date, though it is on the sleep's own day`);
    ok((await s.innerText()).includes("Leave empty while he is still asleep"), "2 the Ended hint");
    eq(await saveBtn(p.page).isDisabled(), true, "2 Save is disabled until something changes");
    eq(await s.locator('input[type="time"]').count(), 0, "2 no native time input in the sheet");
    const texts = await s.locator("button[aria-expanded]").allInnerTexts();
    ok(texts.every((x) => /^\d{1,2}:\d{2} (am|pm)$/.test(x.trim())), `2 every time reads 12-hour am/pm on a phone set to 24-hour time (${texts.join(", ")})`);
    // layout: label and date start at the same top edge as the time box; the date sits inside the box's height
    for (const f of ["ss", "se", "p0s"]) {
      const row = field(p.page, f);
      const box = await row.locator("button[aria-expanded]").boundingBox();
      const label = await row.locator("[data-label]").boundingBox();
      const date = await row.locator("[data-date]").boundingBox();
      ok(Math.abs(label.y - box.y) <= 1.5, `2 ${f}: label top ${label.y.toFixed(1)} = time box top ${box.y.toFixed(1)}`);
      if (f !== "se") ok(date.y + date.height <= box.y + box.height + 1, `2 ${f}: the date sits inside the box's height (${(date.y + date.height).toFixed(1)} <= ${(box.y + box.height).toFixed(1)})`);
      ok(box.width >= 95.5 && box.height >= 43.5, `2 ${f}: time box at least 96 x 44 (${box.width.toFixed(0)} x ${box.height.toFixed(0)})`);
      const css = await row.locator("button[aria-expanded]").evaluate((el) => { const c = getComputedStyle(el); return `${c.fontSize}|${c.fontWeight}|${c.textAlign}|${c.fontVariantNumeric}|${c.paddingLeft}`; });
      ok(css.startsWith("18px|700|right|") && css.includes("tabular-nums") && css.endsWith("|12px"), `2 ${f}: 18px bold, right-aligned, tabular, 12px padding (${css})`);
    }
    // dividers only between sections: none inside a block
    const borders = await s.locator("section[aria-label]").evaluateAll((els) => els.map((e) => `${getComputedStyle(e).borderTopWidth}`));
    ok(borders[0] === "0px" && borders.slice(1).every((b) => b !== "0px"), `2 divider between sections only (${borders.join(",")})`);
    const inner = await s.locator("[data-field]").evaluateAll((els) => els.map((e) => getComputedStyle(e).borderTopWidth + getComputedStyle(e).borderBottomWidth));
    ok(inner.every((b) => b === "0px0px"), "2 no dividers between rows inside a block");
    await shot(p.page, "sheet-390", s);
  }
  await field(p.page, "se").locator("button[aria-expanded]").click();
  await field(p.page, "se").locator('[role="group"][aria-label="Pick a time"]').waitFor();
  const overflow = await p.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, sheet: document.querySelector("[data-edit-times-sheet]").scrollWidth, sheetBox: document.querySelector("[data-edit-times-sheet]").clientWidth }));
  ok(overflow.doc <= overflow.win && overflow.sheet <= overflow.sheetBox, `2 no horizontal scroll at ${width} px with the wheel open (page ${overflow.doc}/${overflow.win}, sheet ${overflow.sheet}/${overflow.sheetBox})`);
  if (width === 320) await shot(p.page, "wheel-320", sheet(p.page));
  await p.context.close();
}

// ---------- 3. the whole row is the tap target; one wheel at a time; the wheel itself ----------
{
  const now = L(10, 5);
  reset([{ stretches: [{ start: L(8, 0), end: L(9, 0) }] }], now);
  const p = await phone("joseph", now);
  const id = idAt(L(8, 0));
  await openSheet(p.page, id);
  const open = async (f) => (await field(p.page, f).locator("button[aria-expanded]").getAttribute("aria-expanded")) === "true";
  const wheels = () => sheet(p.page).locator('[role="group"][aria-label="Pick a time"]').count();
  const row = field(p.page, "ss");
  const rb = await row.boundingBox();
  const labelB = await row.locator("[data-label]").boundingBox();
  const dateB = await row.locator("[data-date]").boundingBox();
  const boxB = await row.locator("button[aria-expanded]").boundingBox();
  const spots = {
    label: [labelB.x + 4, labelB.y + 4],
    date: [dateB.x + 4, dateB.y + dateB.height / 2],
    box: [boxB.x + boxB.width / 2, boxB.y + boxB.height / 2],
    "empty space": [labelB.x + labelB.width + (boxB.x - labelB.x - labelB.width) / 2 + 20, boxB.y + boxB.height - 3],
  };
  for (const [where, [x, y]] of Object.entries(spots)) {
    await p.page.mouse.click(x, y);
    ok(await open("ss"), `3 a tap on the ${where} opens the wheel`);
    await p.page.mouse.click(x, y);
    ok(!(await open("ss")), `3 a second tap on the ${where} closes it`);
  }
  await row.locator("button[aria-expanded]").click();
  eq(await wheels(), 1, "3 one wheel");
  await field(p.page, "se").locator("button[aria-expanded]").click();
  eq(await wheels(), 1, "3 opening another row closes the first: still one wheel");
  ok(!(await open("ss")) && (await open("se")), "3 and it is the second row that is open");
  const w = field(p.page, "se").locator('[role="group"][aria-label="Pick a time"]');
  for (const g of ["Hour", "Minute", "AM or PM"]) eq(await w.locator(`[role="group"][aria-label="${g}"]`).count(), 1, `3 the wheel has a ${g} column`);
  ok((await w.getByRole("button", { name: "Clear" }).count()) === 1 && (await w.getByRole("button", { name: "Done" }).count()) === 1, "3 and Clear and Done");
  const pressed = async (g) => w.locator(`[aria-label="${g}"] button[aria-pressed="true"]`).innerText().then((t) => t.trim());
  eq(`${await pressed("Hour")}:${await pressed("Minute")} ${await pressed("AM or PM")}`, "9:00 AM", "3 a field with a time opens on that time");
  // a tap on a value changes the field live
  await w.locator('[aria-label="Hour"] button', { hasText: /^10$/ }).click();
  eq(await timeText(p.page, "se"), "10:00 am", "3 choosing an hour updates the field at once");
  // wheels must not scroll the page or lose a tap: scroll the minute column like a finger would
  await w.locator('[aria-label="Minute"]').evaluate((el) => { el.scrollTop = 45 * 34; });
  await p.page.waitForTimeout(400);
  eq(await timeText(p.page, "se"), "10:45 am", "3 scrolling the minute column to 45 picks 45");
  await w.locator('[aria-label="AM or PM"]').evaluate((el) => { el.scrollTop = 34; });
  await p.page.waitForTimeout(400);
  eq(await timeText(p.page, "se"), "10:45 pm", "3 scrolling to PM picks PM");
  // Escape closes the wheel first, then the sheet
  await p.page.keyboard.press("Escape");
  eq(await wheels(), 0, "3 Escape closes the wheel");
  eq(await sheet(p.page).count(), 1, "3 and leaves the sheet open");
  eq(await timeText(p.page, "se"), "10:45 pm", "3 and keeps what was chosen");
  await p.page.keyboard.press("Escape");
  eq(await sheet(p.page).count(), 0, "3 the next Escape closes the sheet");
  ok(await card(p.page, id).locator("button[data-edit-times]").evaluate((el) => el === document.activeElement), "3 and focus is back on Edit times");
  eq(psql(db, `select rev from public.sleeps where id = '${id}'`), "1", "3 nothing was saved");
  // Clear empties the field; an empty field opens on the sleep's start time
  await openSheet(p.page, id);
  await field(p.page, "se").locator("button[aria-expanded]").click();
  await field(p.page, "se").getByRole("button", { name: "Clear" }).click();
  eq(await timeText(p.page, "se"), "Not set", "3 Clear leaves the field Not set");
  eq(await wheels(), 0, "3 and closes the wheel");
  await field(p.page, "se").locator("button[aria-expanded]").click();
  const w2 = field(p.page, "se").locator('[role="group"][aria-label="Pick a time"]');
  const sel = async (g) => w2.locator(`[aria-label="${g}"] button[aria-pressed="true"]`).innerText().then((t) => t.trim());
  eq(`${await sel("Hour")}:${await sel("Minute")} ${await sel("AM or PM")}`, "8:00 AM", "3 an empty field opens on the sleep's start time");
  eq(await timeText(p.page, "se"), "Not set", "3 without filling the field until something is chosen");
  await p.context.close();
}


// ---------- 4. a nap stopped too early: end 9:45, then a pause 9:00 to 9:05 ----------
{
  const now = L(10, 5);
  reset([{ stretches: [{ start: L(8, 0), end: L(9, 0) }] }], now);
  const p = await phone("joseph", now);
  const id = idAt(L(8, 0));
  await openSheet(p.page, id);
  ok(await sheet(p.page).locator("button[aria-expanded]").first().evaluate((el) => el === document.activeElement), "4 focus moves to the first time when the sheet opens");
  eq(await card(p.page, id).locator("button[data-edit-times]").count(), 0, "4 the Edit times control gives way to the sheet");
  eq(await card(p.page, id).getByRole("button", { name: "Delete this sleep" }).count(), 1, "4 the × is still there");
  await setTime(p.page, "se", 9, 45, "am");
  eq(await summary(p.page), "Slept 1 h 45 min · 0 pauses · woke 9:45 am", "4 the live summary");
  eq(await saveBtn(p.page).isDisabled(), false, "4 Save is enabled");
  await shot(p.page, "nap-edited", sheet(p.page));
  await saveBtn(p.page).click();
  await sheet(p.page).waitFor({ state: "detached" });
  eq(await toast(p.page), "Saved. Jen sees it live.", "4 saved, and the other parent's name is in the toast");
  const row = rowOf(id);
  eq(pairs(row), want([[L(8, 0), L(9, 45)]]), "4 stored as 8:00 to 9:45");
  eq(`${row.rev}|${row.last_action}|${row.last_by === "00000000-0000-0000-0000-0000000000a1"}|${at(row.closed_at)}`, `2|edit|true|${iso(L(9, 45))}`, "4 rev, action, who, closed");
  ok(await card(p.page, id).locator("[data-sleep-actions] button").first().evaluate((el) => el === document.activeElement), "4 focus goes to the first action on the card");
  eq(await card(p.page, id).locator('[role="timer"]').getAttribute("aria-label"), "1 hour 45 minutes", "4 the card reads 01 h 45 m");
  await openSheet(p.page, id);
  await sheet(p.page).getByRole("button", { name: "+ Add a pause" }).click();
  eq(await sheet(p.page).locator('[data-block="new"]').count(), 1, "4 + Add a pause adds one blank block");
  ok((await sheet(p.page).innerText()).includes("New pause") && (await sheet(p.page).getByRole("button", { name: "+ Add another pause" }).count()) === 1, "4 titled New pause, and the button now reads + Add another pause");
  eq((await sheet(p.page).locator('[data-block="new"]').innerText()).split("Optional").length - 1, 2, "4 both rows are Optional");
  eq(await timeText(p.page, "p0s"), "Not set", "4 an empty field reads Not set");
  eq(await saveBtn(p.page).isDisabled(), true, "4 an empty new block changes nothing");
  await setTime(p.page, "p0s", 9, 0, "am");
  await setTime(p.page, "p0e", 9, 5, "am");
  eq(await dateText(p.page, "p0s"), "Wed 21 Oct", "4 a new field's date follows the sleep");
  eq(await summary(p.page), "Slept 1 h 40 min · 1 pause · woke 9:45 am", "4 asleep 1 h 40 min, 1 pause");
  await saveBtn(p.page).click();
  await sheet(p.page).waitFor({ state: "detached" });
  eq(pairs(rowOf(id)), want([[L(8, 0), L(9, 0)], [L(9, 5), L(9, 45)]]), "4 two stretches stored");
  eq(await card(p.page, id).getByRole("button", { name: /1 pause/ }).count(), 1, "4 the card says 1 pause");
  eq(await card(p.page, id).locator('[role="timer"]').getAttribute("aria-label"), "1 hour 40 minutes", "4 and 1 h 40 min asleep");
  await p.context.close();
}

// ---------- 5. the night that closed itself at 1:00 am ----------
{
  const now = L(8, 0);
  reset([{ stretches: [{ start: L(21, 0, 0, 20), end: L(23, 10, 0, 20) }, { start: L(23, 25, 0, 20), end: L(1, 0) }], closedAt: null }], now);
  const p = await phone("joseph", now);
  const id = idAt(L(21, 0, 0, 20));
  const c = card(p.page, id);
  eq(await c.getAttribute("data-state"), "finished", "5 it closed itself");
  eq((await c.locator("[data-auto-close-note]").innerText()).trim(), "Closed automatically after 2 h paused. If he went back to sleep, tap Edit times.", "5 the card says so, in the spec's words");
  await shot(p.page, "autoclosed-card", c);
  await openSheet(p.page, id);
  eq(await timeText(p.page, "ss"), "9:00 pm", "5 Sleep started 9:00 pm");
  eq(await dateText(p.page, "ss"), "Tue 20 Oct", "5 on Tuesday");
  eq(await timeText(p.page, "se"), "1:00 am", "5 Sleep ended 1:00 am");
  eq(await dateText(p.page, "se"), "Wed 21 Oct", "5 on Wednesday");
  await setTime(p.page, "se", 7, 10, "am");
  eq(await dateText(p.page, "se"), "Wed 21 Oct", "5 7:10 am is read as that same morning, the nearest to the old time");
  await sheet(p.page).getByRole("button", { name: "+ Add a pause" }).click();
  await setTime(p.page, "p1s", 1, 0, "am");
  await setTime(p.page, "p1e", 1, 30, "am");
  eq(await dateText(p.page, "p1s"), "Wed 21 Oct", "5 the new pause's date follows the sleep (the first 1:00 am after it started)");
  eq(await dateText(p.page, "p1e"), "Wed 21 Oct", "5 and its end follows its start");
  eq(await summary(p.page), "Slept 9 h 25 min · 2 pauses · woke 7:10 am", "5 the summary");
  await shot(p.page, "night-edited", sheet(p.page));
  await saveBtn(p.page).click();
  await sheet(p.page).waitFor({ state: "detached" });
  const row = rowOf(id);
  eq(pairs(row), want([[L(21, 0, 0, 20), L(23, 10, 0, 20)], [L(23, 25, 0, 20), L(1, 0)], [L(1, 30), L(7, 10)]]), "5 stored as three stretches ending 7:10");
  eq(await c.locator("[data-auto-close-note]").count(), 0, "5 any edit clears the note");
  eq(row.last_action, "edit", "5 and the row says a person edited");
  await p.context.close();
}

// ---------- 6. the rules block, with the right words under the right field; nothing is adjusted ----------
{
  const now = L(10, 30);
  reset([{ stretches: [{ start: L(8, 0), end: L(9, 0) }] }, { stretches: [{ start: L(9, 30), end: L(10, 0) }] }], now);
  const p = await phone("joseph", now);
  const id = idAt(L(8, 0));
  await openSheet(p.page, id);
  await setTime(p.page, "se", 9, 45, "am");
  eq(await errText(p.page, "se"), "That overlaps the sleep from 9:30 am to 10:00 am.", "6 overlap, under Ended");
  eq(await timeText(p.page, "se"), "9:45 am", "6 nothing was adjusted");
  eq(await saveBtn(p.page).isDisabled(), true, "6 Save stays disabled");
  eq(await field(p.page, "se").locator("button[aria-expanded]").getAttribute("aria-invalid"), "true", "6 the field is aria-invalid");
  eq(await field(p.page, "se").locator('p[role="alert"]').count(), 1, "6 and the message is a role=alert under it");
  await shot(p.page, "overlap-error", sheet(p.page));
  await setTime(p.page, "se", 7, 0, "am");
  eq(await errText(p.page, "se"), "Sleep ended must be after sleep started (8:00 am).", "6 ended before started");
  await setTime(p.page, "se", 11, 0, "am");
  eq(await errText(p.page, "se"), "Sleep ended can't be in the future.", "6 in the future");
  await setTime(p.page, "se", 9, 0, "am");
  eq(await errText(p.page, "se"), "", "6 back to the original: no message");
  eq(await saveBtn(p.page).isDisabled(), true, "6 and nothing to save");
  const add = () => sheet(p.page).getByRole("button", { name: /^\+ Add (a|another) pause$/ }).click();
  await add();
  await setTime(p.page, "p0s", 8, 0, "am");
  eq(await errText(p.page, "p0s"), "New pause started must be after sleep started (8:00 am).", "6 a pause starting with the sleep");
  await setTime(p.page, "p0s", 8, 30, "am");
  await setTime(p.page, "p0e", 8, 40, "am");
  await add();
  eq(await sheet(p.page).locator('[data-block="new"]').count(), 2, "6 a second tap adds a second block");
  ok((await sheet(p.page).innerText()).includes("New pause 1") && (await sheet(p.page).innerText()).includes("New pause 2"), "6 named New pause 1 and New pause 2");
  await setTime(p.page, "p1s", 8, 35, "am");
  await setTime(p.page, "p1e", 8, 50, "am");
  eq(await errText(p.page, "p1s"), "New pause 2 overlaps new pause 1 (8:30 am to 8:40 am).", "6 two new pauses that overlap");
  await setTime(p.page, "p1s", 8, 40, "am");
  eq(await errText(p.page, "p1s"), "Leave at least 1 minute of sleep between new pause 1 and new pause 2.", "6 touching pauses");
  await add();
  await setTime(p.page, "p2e", 8, 55, "am");
  eq(await errText(p.page, "p2s"), "Fill in when the pause started first.", "6 an end without a start");
  await sheet(p.page).locator('[data-block="new"]').nth(2).getByRole("button", { name: "Remove" }).click();
  eq(await sheet(p.page).locator('[data-block="new"]').count(), 2, "6 Remove on a new block drops it at once");
  await setTime(p.page, "p1s", 8, 41, "am");
  eq(await saveBtn(p.page).isDisabled(), false, "6 everything fits: Save is enabled");
  await add(); // a blank block is ignored on save
  await saveBtn(p.page).click();
  await sheet(p.page).waitFor({ state: "detached" });
  eq(rowOf(id).segments.length, 3, "6 two pauses saved, the blank block ignored");
  await p.context.close();
}

// ---------- 7. Remove pause only marks it; Undo; Cancel; Save ----------
{
  const now = L(10, 5);
  reset([{ stretches: [{ start: L(8, 0), end: L(8, 20) }, { start: L(8, 30), end: L(8, 50) }, { start: L(9, 0), end: L(9, 30) }] }], now);
  const p = await phone("joseph", now);
  const id = idAt(L(8, 0));
  await openSheet(p.page, id);
  eq(await sheet(p.page).locator('[data-block="pause"]').count(), 2, "7 two pause blocks");
  const remove = (i) => sheet(p.page).locator('[data-block="pause"]').nth(i).getByRole("button", { name: "Remove pause" }).click();
  await remove(0);
  const gone = sheet(p.page).locator("[data-block-removed]");
  eq(await gone.count(), 1, "7 the block is marked");
  ok((await gone.innerText()).includes("8:20 am to 8:30 am will be removed when you save."), "7 'will be removed when you save'");
  eq(await gone.locator("h4").evaluate((el) => getComputedStyle(el).textDecorationLine), "line-through", "7 its title is struck through");
  eq(await gone.locator("button[aria-expanded]").count(), 0, "7 its rows are not shown");
  eq(await saveBtn(p.page).isDisabled(), false, "7 Save is enabled");
  eq(rowOf(id).rev, 1, "7 nothing has changed yet");
  await gone.getByRole("button", { name: "Undo" }).click();
  eq(await sheet(p.page).locator("[data-block-removed]").count(), 0, "7 Undo brings it back");
  eq(await saveBtn(p.page).isDisabled(), true, "7 and nothing is changed");
  await remove(0);
  await sheet(p.page).getByRole("button", { name: "Cancel" }).click();
  await sheet(p.page).waitFor({ state: "detached" });
  eq(rowOf(id).segments.length, 3, "7 Cancel discards it");
  ok(await card(p.page, id).locator("button[data-edit-times]").evaluate((el) => el === document.activeElement), "7 and focus goes back to Edit times");
  await openSheet(p.page, id);
  eq(await sheet(p.page).locator("[data-block-removed]").count(), 0, "7 a reopened sheet starts clean");
  await remove(0);
  await saveBtn(p.page).click();
  await sheet(p.page).waitFor({ state: "detached" });
  eq(pairs(rowOf(id)), want([[L(8, 0), L(8, 50)], [L(9, 0), L(9, 30)]]), "7 Save applies it: the stretches either side join");
  eq(rowOf(id).closed_at !== null, true, "7 and the sleep stays finished");
  await p.context.close();
}

// ---------- 8. clearing a finished sleep's Ended and saving makes it run again ----------
{
  const now = L(10, 5);
  reset([{ stretches: [{ start: L(8, 0), end: L(9, 0) }] }], now);
  const p = await phone("joseph", now);
  const id = idAt(L(8, 0));
  await openSheet(p.page, id);
  await field(p.page, "se").locator("button[aria-expanded]").click();
  await field(p.page, "se").getByRole("button", { name: "Clear" }).click();
  eq(await summary(p.page), "Asleep 2 h 5 min · 0 pauses · still sleeping", "8 the summary");
  await saveBtn(p.page).click();
  await sheet(p.page).waitFor({ state: "detached" });
  const row = rowOf(id);
  eq(`${row.closed_at}|${pairs(row)}`, `null|${want([[L(8, 0), null]])}`, "8 running again: open, one stretch, no pause");
  eq(await card(p.page, id).getAttribute("data-state"), "asleep", "8 the card reads Sleeping");
  ok((await p.page.locator('[data-sleep-pill="asleep"]').count()) > 0, "8 and the Last sleep pill follows (Sleeping now)");
  await p.context.close();
}

// ---------- 9. first write wins ----------
{
  const now = L(10, 5);
  reset([{ stretches: [{ start: L(8, 0), end: L(9, 0) }] }], now);
  const jen = await phone("jen", now);
  const joseph = await phone("joseph", now);
  const id = idAt(L(8, 0));
  await openSheet(jen.page, id);
  await setTime(jen.page, "se", 9, 30, "am");
  await openSheet(joseph.page, id);
  await setTime(joseph.page, "se", 9, 20, "am");
  setClock(db, iso(L(10, 6)));
  await saveBtn(joseph.page).click();
  await sheet(joseph.page).waitFor({ state: "detached" });
  // Jen's phone hears about it (a refocus refetches): the warning appears, the sheet stays usable
  await jen.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await jen.page.waitForTimeout(900);
  eq(await noteLine(jen.page), "Joseph changed this sleep at 10:06 am. If you save now you will be told, and the latest times will be shown.", "9 the other parent's open sheet is warned, in the spec's words");
  eq(await timeText(jen.page, "se"), "9:30 am", "9 and keeps her draft");
  await saveBtn(jen.page).click();
  await jen.page.waitForTimeout(500);
  eq(await sheet(jen.page).count(), 1, "9 a save on a stale sheet does not close it");
  eq(await noteLine(jen.page), "Joseph already changed this sleep (10:06 am). Nothing was saved. The latest times are shown: check them and save again.", "9 and says who and when");
  eq(await timeText(jen.page, "se"), "9:20 am", "9 the latest times are shown");
  eq(await saveBtn(jen.page).isDisabled(), true, "9 Jen's change is dropped: nothing to save");
  eq(at(rowOf(id).closed_at), iso(L(9, 20)), "9 the database has Joseph's");
  eq(rowOf(id).rev, 2, "9 and one edit");
  await jen.context.close();
  await joseph.context.close();
}
// ...and when her phone has not heard yet, the database says no and the sheet reloads the same way
{
  const now = L(10, 5);
  reset([{ stretches: [{ start: L(8, 0), end: L(9, 0) }] }], now);
  const jen = await phone("jen", now);
  const joseph = await phone("joseph", now);
  const id = idAt(L(8, 0));
  await openSheet(jen.page, id);
  await setTime(jen.page, "se", 9, 30, "am");
  await jen.context.route(/rest\/v1\/rpc\/get_sleeps/, (r) => r.abort("connectionfailed"));
  await openSheet(joseph.page, id);
  await setTime(joseph.page, "se", 9, 20, "am");
  setClock(db, iso(L(10, 7)));
  await saveBtn(joseph.page).click();
  await sheet(joseph.page).waitFor({ state: "detached" });
  eq(await sheet(jen.page).locator("p[role=status]").last().innerText().then((x) => x.trim()), "", "9b Jen's phone has not heard: no warning");
  await saveBtn(jen.page).click();
  await jen.page.waitForTimeout(900);
  eq(await noteLine(jen.page), "Joseph already changed this sleep (10:07 am). Nothing was saved. The latest times are shown: check them and save again.", "9b the database refuses the stale save, and the sheet reloads");
  eq(await timeText(jen.page, "se"), "9:20 am", "9b with the latest times");
  eq(rowOf(id).rev, 2, "9b nothing of Jen's was written");
  await jen.context.close();
  await joseph.context.close();
}

// ---------- 10. auto-close at 2 h: 1 h 55 min stays paused, 2 h closes, any edit clears the note ----------
{
  const t0 = L(10, 25); // 1 h 55 min after the pause began at 8:30
  reset([{ stretches: [{ start: L(8, 0), end: L(8, 30) }], closedAt: null }], t0);
  const p = await phone("joseph", t0);
  const id = idAt(L(8, 0));
  eq(await card(p.page, id).getAttribute("data-state"), "paused", "10 1 h 55 min paused: still paused");
  setClock(db, iso(L(10, 29, 59)));
  await p.page.clock.fastForward(4 * 60 * 1000 + 59 * 1000);
  await p.page.waitForTimeout(1500);
  eq(await card(p.page, id).getAttribute("data-state"), "paused", "10 1 h 59 min 59 s: still paused");
  setClock(db, iso(L(10, 30)));
  await p.page.clock.fastForward(1000);
  await p.page.waitForTimeout(1500);
  eq(await card(p.page, id).getAttribute("data-state"), "finished", "10 at 2 h it has closed itself");
  eq(await card(p.page, id).locator("[data-auto-close-note]").count(), 1, "10 with the note");
  ok((await card(p.page, id).innerText()).includes("8:30 am"), "10 and the wake time is the moment the pause began");
  await openSheet(p.page, id);
  await setTime(p.page, "se", 9, 0, "am");
  await saveBtn(p.page).click();
  await sheet(p.page).waitFor({ state: "detached" });
  eq(await card(p.page, id).locator("[data-auto-close-note]").count(), 0, "10 an edit clears the note");
  await p.context.close();
}

// ---------- 11. the pause list's Remove works on a finished card; and is out of the way while the sheet is open ----------
{
  const now = L(10, 5);
  reset([{ stretches: [{ start: L(8, 0), end: L(8, 20) }, { start: L(8, 30), end: L(9, 0) }] }], now);
  const p = await phone("joseph", now);
  const id = idAt(L(8, 0));
  const c = card(p.page, id);
  await c.getByRole("button", { name: /1 pause/ }).click();
  eq(await c.locator("button[data-pause-remove]").count(), 1, "11 a finished card offers Remove on its pause");
  ok(!(await c.innerText()).includes("Reopen"), "11 and no longer talks about Reopen");
  await openSheet(p.page, id);
  eq(await c.locator("button[data-pause-remove]").count(), 0, "11 not while the Edit times sheet is open");
  await sheet(p.page).getByRole("button", { name: "Cancel" }).click();
  await c.locator("button[data-pause-remove]").click();
  await p.page.getByRole("alertdialog").getByRole("button", { name: "Remove pause" }).click();
  await p.page.waitForTimeout(800);
  eq(pairs(rowOf(id)), want([[L(8, 0), L(9, 0)]]), "11 the pause is gone and the sleep keeps its start and end");
  eq(rowOf(id).closed_at !== null, true, "11 and stays finished");
  await p.context.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

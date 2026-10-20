import { describe, expect, it } from "vitest";
import { MIN, SleepError, type Sleep, type SleepWorld } from "@/lib/sleep";
import {
  WHEEL_MINUTES,
  agoLabel,
  agoOutOfRange,
  bulkDeletePrompt,
  bulkSleepFailure,
  durationLabel,
  clockLabel,
  createZone,
  defaultAgo,
  deleteSleepPrompt,
  describeRestoreRefusal,
  describeSleepError,
  joinTimes,
  judgePick,
  listPauses,
  pauseCountLabel,
  pauseLength,
  REMOVE_NEEDS_REOPEN,
  removePauseBody,
  removePauseLabel,
  reopenHint,
  sleepSelectKey,
  timerDigits,
  timerSpoken,
  type Pick,
} from "@/lib/sleep-format";

const london = createZone("Europe/London");
const newYork = createZone("America/New_York");

// Fri 16 Oct 2026, 6:20 pm in London (BST).
const NOW = Date.parse("2026-10-16T17:20:00Z");
const at = (minutesFromNow: number) => NOW + minutesFromNow * MIN;

function sleep(stretches: Array<[number, number | null]>, over: Partial<Sleep> = {}): Sleep {
  return {
    id: "s",
    by: "joseph",
    stretches: stretches.map(([start, end]) => ({ start, end })),
    closedAt: null,
    rev: 1,
    last: { by: "joseph", action: "start", at: stretches[0][0] },
    notes: null,
    ...over,
  };
}

const world = (sleeps: Sleep[], now = NOW): SleepWorld => ({ now, sleeps });
const names = (id: string | null) => ({ joseph: "Joseph", jen: "Jen" })[id ?? ""] ?? "Someone";

describe("12-hour times in the device's zone", () => {
  it("formats am/pm, never 24-hour", () => {
    expect(london.fmtTime(Date.parse("2026-10-16T17:05:00Z"))).toBe("6:05 pm");
    expect(london.fmtTime(Date.parse("2026-10-16T08:09:00Z"))).toBe("9:09 am");
    expect(london.fmtTime(Date.parse("2026-10-16T23:00:00Z"))).toBe("12:00 am"); // midnight BST
    expect(london.fmtTime(Date.parse("2026-10-16T11:00:00Z"))).toBe("12:00 pm");
    expect(london.fmtTime(Date.parse("2026-10-16T23:05:00Z"))).toBe("12:05 am");
    expect(london.fmtTime(Date.parse("2026-10-16T13:30:00Z"))).not.toMatch(/1[3-9]|2[0-3]:/);
  });

  it("follows the zone it was built with", () => {
    const t = Date.parse("2026-10-16T17:05:00Z");
    expect(london.fmtTime(t)).toBe("6:05 pm");
    expect(newYork.fmtTime(t)).toBe("1:05 pm");
  });

  it("formats the day and the local calendar day key", () => {
    expect(london.fmtDay(NOW)).toBe("Fri 16 Oct");
    // 11:30 pm UTC on the 16th is already the 17th in London (BST)
    expect(london.dayKey(Date.parse("2026-10-16T23:30:00Z"))).toBe("2026-10-17");
    expect(newYork.dayKey(Date.parse("2026-10-16T23:30:00Z"))).toBe("2026-10-16");
  });

  it("leaves off the day for today and adds it for any other day", () => {
    expect(london.fmtStamp(at(-30), NOW)).toBe("5:50 pm");
    expect(london.fmtStamp(at(-24 * 60), NOW)).toBe("Thu 15 Oct 6:20 pm");
  });

  it("labels a picked time as 12-hour", () => {
    expect(clockLabel("18:05")).toBe("6:05 pm");
    expect(clockLabel("00:30")).toBe("12:30 am");
    expect(clockLabel("12:00")).toBe("12:00 pm");
  });
});

describe("reading a time-only entry", () => {
  it("reads a time earlier today as today", () => {
    expect(london.fromClockInput("17:35", NOW)).toBe(Date.parse("2026-10-16T16:35:00Z"));
  });

  it("reads a time later than now as yesterday", () => {
    // 12:05 am on the 17th (BST); 11:40 pm means last night
    const now = Date.parse("2026-10-16T23:05:00Z");
    expect(london.fromClockInput("23:40", now)).toBe(Date.parse("2026-10-16T22:40:00Z"));
  });

  it("accepts the current minute", () => {
    expect(london.fromClockInput("18:20", NOW)).toBe(NOW);
  });

  it("rejects anything that is not HH:MM", () => {
    expect(london.fromClockInput("", NOW)).toBeNaN();
    expect(london.fromClockInput("25:00", NOW)).toBeNaN();
    expect(london.fromClockInput("12:61", NOW)).toBeNaN();
    expect(london.fromClockInput("noon", NOW)).toBeNaN();
  });

  it("takes the latest reading not in the future when the clocks go back", () => {
    // BST ends Sun 25 Oct 2026: 02:00 BST becomes 01:00 GMT, so 01:30 happens twice
    // (00:30Z = 01:30 BST, then 01:30Z = 01:30 GMT).
    const secondTime = Date.parse("2026-10-25T01:45:00Z"); // 01:45 GMT
    expect(london.fromClockInput("01:30", secondTime)).toBe(Date.parse("2026-10-25T01:30:00Z"));
    const firstTime = Date.parse("2026-10-25T00:45:00Z"); // 01:45 BST, first pass
    expect(london.fromClockInput("01:30", firstTime)).toBe(Date.parse("2026-10-25T00:30:00Z"));
  });

  it("skips a clock time that does not exist when the clocks go forward", () => {
    // 01:30 on Sun 29 Mar 2026 never happens in London; yesterday's does.
    const now = Date.parse("2026-03-29T12:00:00Z");
    expect(london.fromClockInput("01:30", now)).toBe(Date.parse("2026-03-28T01:30:00Z"));
  });

  it("works in zones other than London", () => {
    // 1:05 pm in New York on the 16th is 17:05Z
    expect(newYork.fromClockInput("13:05", Date.parse("2026-10-16T20:00:00Z"))).toBe(
      Date.parse("2026-10-16T17:05:00Z"),
    );
  });
});

describe("durations", () => {
  it("shows the big timer as two digits of hours and minutes", () => {
    expect(timerDigits(95 * MIN)).toEqual({ hours: "01", minutes: "35" });
    expect(timerDigits(0)).toEqual({ hours: "00", minutes: "00" });
    expect(timerDigits(59 * MIN + 59_999)).toEqual({ hours: "00", minutes: "59" });
    expect(timerDigits(10 * 60 * MIN + 5 * MIN)).toEqual({ hours: "10", minutes: "05" });
    expect(timerDigits(-5000)).toEqual({ hours: "00", minutes: "00" });
  });

  it("says the timer aloud", () => {
    expect(timerSpoken(95 * MIN)).toBe("1 hour 35 minutes");
    expect(timerSpoken(2 * 60 * MIN + MIN)).toBe("2 hours 1 minute");
  });

  it("writes the awake length", () => {
    expect(durationLabel(12 * MIN)).toBe("12 min");
    expect(durationLabel(65 * MIN)).toBe("1 h 5 min");
    expect(durationLabel(120 * MIN)).toBe("2 h");
  });
});

describe("the how-long-ago wheel", () => {
  it("has 36 rows, 5 minutes to 3 hours in 5-minute steps", () => {
    expect(WHEEL_MINUTES).toHaveLength(36);
    expect(WHEEL_MINUTES[0]).toBe(5);
    expect(WHEEL_MINUTES[35]).toBe(180);
    WHEEL_MINUTES.forEach((m, i) => expect(m).toBe((i + 1) * 5));
  });

  it("labels the rows", () => {
    expect(agoLabel(5)).toBe("5 min ago");
    expect(agoLabel(60)).toBe("1 hr ago");
    expect(agoLabel(75)).toBe("1 hr 15 min ago");
    expect(agoLabel(180)).toBe("3 hr ago");
  });

  it("selects 15 minutes when it opens", () => {
    const s = sleep([[at(-10), null]]);
    expect(defaultAgo(world([s]), s, "start")).toBe(15);
  });

  it("greys out rows that start before the previous sleep ended", () => {
    const prev = sleep([[at(-120), at(-40)]], { id: "p", closedAt: at(-40) });
    const s = sleep([[at(-10), null]]);
    const w = world([prev, s]);
    expect(agoOutOfRange(w, s, "start", 35)).toBe(false);
    expect(agoOutOfRange(w, s, "start", 40)).toBe(false); // exactly at the previous wake
    expect(agoOutOfRange(w, s, "start", 45)).toBe(true);
    expect(agoOutOfRange(w, s, "start", 180)).toBe(true);
  });

  it("falls back to the first allowed row when 15 minutes is not allowed", () => {
    const prev = sleep([[at(-120), at(-12)]], { id: "p", closedAt: at(-12) });
    const s = sleep([[at(-5), null]]);
    expect(defaultAgo(world([prev, s]), s, "start")).toBe(10);
  });
});

describe("the preview line under the picker", () => {
  const running = sleep([[at(-10), null]]);
  const pick = (over: Partial<Pick>): Pick => ({
    field: "start",
    mode: null,
    ago: null,
    time: "",
    ...over,
  });

  it("is empty until something is chosen", () => {
    expect(judgePick(world([running]), running, pick({}), london)).toEqual({
      kind: "idle",
      text: "",
      ms: NaN,
    });
  });

  it("previews a how-long-ago choice", () => {
    const j = judgePick(world([running]), running, pick({ mode: "ago", ago: 5 }), london);
    expect(j.kind).toBe("ok");
    expect(j.text).toBe("6:15 pm · 5m ago");
    expect(j.ms).toBe(at(-5));
  });

  it("previews a picked time", () => {
    const j = judgePick(world([running]), running, pick({ mode: "time", time: "18:12" }), london);
    expect(j.kind).toBe("ok");
    expect(j.text).toBe("6:12 pm · 8m ago");
  });

  it("warns, and offers Save anyway, past 3 hours", () => {
    const old = sleep([[at(-10), null]]);
    const j = judgePick(world([old]), old, pick({ mode: "time", time: "14:00" }), london);
    expect(j.kind).toBe("warn");
    expect(j.text).toBe("2:00 pm · 4h 20m ago · long ago, is that right?");
  });

  it("calls yesterday's time yesterday", () => {
    const now = Date.parse("2026-10-16T23:05:00Z"); // 12:05 am London on the 17th
    const s = sleep([[now - 10 * MIN, null]]);
    const j = judgePick(world([s], now), s, pick({ mode: "time", time: "23:40" }), london);
    expect(j.text.startsWith("yesterday 11:40 pm")).toBe(true);
    expect(j.kind).toBe("ok");
  });

  it("refuses a start before the previous sleep ended, and says when that was", () => {
    const prev = sleep([[at(-120), at(-40)]], { id: "p", closedAt: at(-40) });
    const j = judgePick(
      world([prev, running]),
      running,
      pick({ mode: "ago", ago: 60 }),
      london,
    );
    expect(j).toMatchObject({ kind: "err", text: "Before the last sleep ended (5:40 pm)." });
  });

  it("refuses a start after the sleep's first stretch ended", () => {
    const paused = sleep([[at(-60), at(-20)]]);
    const j = judgePick(world([paused]), paused, pick({ mode: "ago", ago: 10 }), london);
    expect(j).toMatchObject({ kind: "err", text: "That is after the sleep ended (6:00 pm)." });
  });

  it("refuses a wake time before the stretch began", () => {
    const paused = sleep([[at(-60), at(-20)]]);
    const j = judgePick(
      world([paused]),
      paused,
      pick({ field: "end", mode: "ago", ago: 90 }),
      london,
    );
    expect(j).toMatchObject({ kind: "err", text: "Before the sleep started." });
  });

  it("refuses an unreadable time", () => {
    const j = judgePick(world([running]), running, pick({ mode: "time", time: "" }), london);
    expect(j).toMatchObject({ kind: "err", text: "That is not a valid time." });
  });
});

describe("what the other parent did, in words", () => {
  const describe_ = (err: SleepError) => describeSleepError(err, london, NOW, names);

  it("says who got there first and when", () => {
    const err = new SleepError("stale", { by: "jen", action: "pause", at: Date.parse("2026-10-16T17:08:00Z") });
    expect(describe_(err)).toBe("Jen already paused this sleep (6:08 pm).");
  });

  it("covers every action", () => {
    const said = (action: "start" | "resume" | "finish" | "reopen" | "edit" | "delete") =>
      describe_(new SleepError("stale", { by: "jen", action, at: NOW }));
    expect(said("start")).toBe("Jen already started this sleep (6:20 pm).");
    expect(said("resume")).toBe("Jen already put this sleep back on (6:20 pm).");
    expect(said("finish")).toBe("Jen already finished this sleep (6:20 pm).");
    expect(said("reopen")).toBe("Jen already reopened this sleep (6:20 pm).");
    expect(said("edit")).toBe("Jen already edited this sleep (6:20 pm).");
    expect(said("delete")).toBe("Jen already deleted this sleep (6:20 pm).");
  });

  it("explains an auto-close", () => {
    const err = new SleepError("autoclosed", { at: Date.parse("2026-10-16T17:00:00Z") });
    expect(describe_(err)).toBe("This sleep closed itself after 3 h paused (at 6:00 pm).");
  });

  it("tells a second starter that a sleep is already running", () => {
    const running = sleep([[Date.parse("2026-10-16T16:35:00Z"), null]], { by: "jen" });
    const err = new SleepError("already-open", { other: running });
    expect(describe_(err)).toBe("Jen already has a sleep running (started 5:35 pm).");
  });

  it("names the sleep an edit would overlap", () => {
    const other = sleep(
      [[Date.parse("2026-10-16T12:05:00Z"), Date.parse("2026-10-16T13:40:00Z")]],
      { closedAt: Date.parse("2026-10-16T13:40:00Z") },
    );
    expect(describe_(new SleepError("overlap", { other }))).toBe(
      "That overlaps the sleep from 1:05 pm to 2:40 pm.",
    );
  });

  it("explains a refused pause and a deleted sleep", () => {
    expect(describe_(new SleepError("short"))).toBe(
      "Pause needs a minute of sleep first. Stop Sleep works any time.",
    );
    expect(describe_(new SleepError("gone"))).toBe("That sleep was deleted.");
  });

  it("explains why a sleep can not be reopened, in the same words as the card", () => {
    expect(describe_(new SleepError("no-reopen", { reason: "newer" }))).toBe(
      "This sleep can't be reopened: a new sleep has started.",
    );
    expect(describe_(new SleepError("no-reopen", { reason: "autoclosed" }))).toBe(
      "This sleep can't be reopened: it closed itself after 3 hours paused.",
    );
    expect(describe_(new SleepError("no-reopen", { reason: "expired" }))).toBe(
      "This sleep can't be reopened: it ended more than 3 hours ago.",
    );
  });
});

describe("reopenHint: the line under a finished card with no Reopen button", () => {
  it("gives one sentence per reason, always starting the same way", () => {
    expect(reopenHint("newer")).toBe("This sleep can't be reopened: a new sleep has started.");
    expect(reopenHint("expired")).toBe("This sleep can't be reopened: it ended more than 3 hours ago.");
    expect(reopenHint("autoclosed")).toBe(
      "This sleep can't be reopened: it closed itself after 3 hours paused.",
    );
    expect(reopenHint("not-finished")).toBe("This sleep can't be reopened: it is still running.");
  });
});

describe("the pause list", () => {
  // Saturday night: 9:00 pm to 8:34 am in London (BST), paused 9:06 to 9:08
  // pm and 2:10 to 2:43 am — 2 min and 33 min, 35 in all.
  const T = (clock: string) => Date.parse(`2026-10-${clock}:00Z`);
  const night = sleep(
    [
      [T("16T20:00"), T("16T20:06")],
      [T("16T20:08"), T("17T01:10")],
      [T("17T01:43"), T("17T07:34")],
    ],
    { closedAt: T("17T07:34") },
  );

  it("lists every pause in time order, with the stretch before it as its index", () => {
    const list = listPauses(night, T("17T07:40"));
    expect(list.rows).toEqual([
      { index: 0, start: T("16T20:06"), end: T("16T20:08") },
      { index: 1, start: T("17T01:10"), end: T("17T01:43") },
    ]);
    expect(list.open).toBeNull();
    expect(list.totalMs).toBe(35 * MIN);
    expect(pauseLength(list.totalMs)).toBe("35 min");
  });

  it("has no pauses on a sleep that has not been paused", () => {
    expect(listPauses(sleep([[at(-30), null]]), NOW)).toEqual({ rows: [], open: null, totalMs: 0 });
  });

  it("shows the pause in progress on a paused sleep, and counts it in the total", () => {
    const paused = sleep([
      [at(-100), at(-60)],
      [at(-52), at(-12)],
    ]);
    const list = listPauses(paused, NOW);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toEqual({ index: 0, start: at(-60), end: at(-52) });
    expect(list.open).toEqual({ start: at(-12), ms: 12 * MIN });
    expect(list.totalMs).toBe(20 * MIN);
  });

  it("counts a paused sleep's first pause too, though no row exists for it yet", () => {
    const list = listPauses(sleep([[at(-60), at(-10)]]), NOW);
    expect(list.rows).toEqual([]);
    expect(list.open?.ms).toBe(10 * MIN);
    expect(list.totalMs).toBe(10 * MIN);
  });

  it("shows no pause in progress on a running sleep, or on one that closed itself", () => {
    expect(listPauses(sleep([[at(-100), at(-60)], [at(-50), null]]), NOW).open).toBeNull();
    const auto = sleep([[at(-400), at(-250)]]);
    expect(listPauses(auto, NOW).open).toBeNull();
  });

  it("writes a length in whole minutes, rounded down like the timer", () => {
    expect(pauseLength(0)).toBe("under 1 min");
    expect(pauseLength(59_999)).toBe("under 1 min");
    expect(pauseLength(MIN)).toBe("1 min");
    expect(pauseLength(MIN + 59_999)).toBe("1 min");
    expect(pauseLength(33 * MIN)).toBe("33 min");
    expect(pauseLength(65 * MIN)).toBe("1 h 5 min");
    expect(pauseLength(120 * MIN)).toBe("2 h");
  });

  it("counts pauses in words", () => {
    expect(pauseCountLabel(1)).toBe("1 pause");
    expect(pauseCountLabel(2)).toBe("2 pauses");
  });

  it("names the Remove button and the confirm box for the pause in the device's zone", () => {
    const first = listPauses(night, T("17T07:40")).rows[0];
    expect(removePauseLabel(london, first)).toBe("Remove pause from 9:06 pm to 9:08 pm");
    expect(removePauseBody(london, first)).toBe(
      "9:06 pm to 9:08 pm (2 min). That time will count as sleep again.",
    );
  });

  it("tells a finished card how to remove a pause", () => {
    expect(REMOVE_NEEDS_REOPEN).toBe("To remove a pause, tap Reopen sleep first.");
  });

  it("explains a pause that has gone", () => {
    expect(describeSleepError(new SleepError("no-pause"), london, NOW, names)).toBe(
      "That pause is not there any more.",
    );
  });
});

describe("joinTimes: a range with one am/pm when both ends share it", () => {
  it("drops the first am/pm when it matches", () => {
    expect(joinTimes("3:46 pm", "4:26 pm")).toBe("3:46 – 4:26 pm");
    expect(joinTimes("9:35 am", "10:50 am")).toBe("9:35 – 10:50 am");
  });

  it("keeps both when they differ, including across noon and midnight", () => {
    expect(joinTimes("7:25 pm", "6:51 am")).toBe("7:25 pm – 6:51 am");
    expect(joinTimes("11:50 am", "12:30 pm")).toBe("11:50 am – 12:30 pm");
    expect(joinTimes("11:40 pm", "12:10 am")).toBe("11:40 pm – 12:10 am");
  });
});

describe("deleteSleepPrompt: the confirm box for Delete sleep", () => {
  // Thu 16 Oct 2026, London (BST): 3:46 to 4:26 pm is 14:46 to 15:26 UTC.
  const T = (clock: string) => Date.parse(`2026-10-16T${clock}:00Z`);
  const afterwards = T("16:00");

  it("names a finished sleep by its times and the time asleep", () => {
    const nap = sleep([[T("14:46"), T("15:26")]], { closedAt: T("15:26") });
    expect(deleteSleepPrompt(nap, afterwards, london)).toEqual({
      title: "Delete this sleep?",
      body: "3:46 – 4:26 pm (40m). You can restore it from Recently Deleted.",
      confirmLabel: "Delete sleep",
    });
  });

  it("counts the time asleep, not the time from first start to wake", () => {
    // 6:00 to 6:30 pm and 6:40 to 7:10 pm: out for ten minutes in between.
    const paused = sleep(
      [
        [T("17:00"), T("17:30")],
        [T("17:40"), T("18:10")],
      ],
      { closedAt: T("18:10") },
    );
    expect(deleteSleepPrompt(paused, T("18:20"), london).body).toBe(
      "6:00 – 7:10 pm (1h). You can restore it from Recently Deleted.",
    );
  });

  it("writes both ends when they are on different sides of noon or midnight", () => {
    const night = sleep([[T("18:25"), Date.parse("2026-10-17T05:51:00Z")]], {
      closedAt: Date.parse("2026-10-17T05:51:00Z"),
    });
    expect(deleteSleepPrompt(night, Date.parse("2026-10-17T06:00:00Z"), london).body).toBe(
      "7:25 pm – 6:51 am (11h 26m). You can restore it from Recently Deleted.",
    );
  });

  it("ends a sleep that closed itself after 3 h paused at its last wake", () => {
    const auto = sleep([[T("14:00"), T("14:40")]]);
    expect(deleteSleepPrompt(auto, T("19:00"), london).body).toBe(
      "3:00 – 3:40 pm (40m). You can restore it from Recently Deleted.",
    );
  });

  it("keeps the plain wording for a sleep still going", () => {
    const running = sleep([[T("14:46"), null]]);
    expect(deleteSleepPrompt(running, afterwards, london)).toEqual({
      title: "Delete this sleep?",
      body: "You can restore it from Recently Deleted in Timeline for 7 days.",
      confirmLabel: "Delete",
    });
  });
});

describe("bulkDeletePrompt: the confirm box for Delete (n) in Edit mode (JOS-92)", () => {
  it("reads as it always did for moments alone", () => {
    expect(bulkDeletePrompt({ moments: 1, sleeps: 0, going: 0 })).toEqual({
      title: "Delete 1 logged moment?",
      body: "You can restore it from Recently Deleted in Timeline for 7 days.",
    });
    expect(bulkDeletePrompt({ moments: 3, sleeps: 0, going: 0 })).toEqual({
      title: "Delete 3 logged moments?",
      body: "You can restore them from Recently Deleted in Timeline for 7 days.",
    });
  });

  it("counts sleeps the same way", () => {
    expect(bulkDeletePrompt({ moments: 0, sleeps: 1, going: 0 })).toEqual({
      title: "Delete 1 sleep?",
      body: "You can restore it from Recently Deleted in Timeline for 7 days.",
    });
    expect(bulkDeletePrompt({ moments: 0, sleeps: 2, going: 0 })).toEqual({
      title: "Delete 2 sleeps?",
      body: "You can restore them from Recently Deleted in Timeline for 7 days.",
    });
  });

  it("names both when moments and sleeps are ticked together, and says 'them' for any two", () => {
    expect(bulkDeletePrompt({ moments: 3, sleeps: 1, going: 0 })).toEqual({
      title: "Delete 3 logged moments and 1 sleep?",
      body: "You can restore them from Recently Deleted in Timeline for 7 days.",
    });
    expect(bulkDeletePrompt({ moments: 1, sleeps: 1, going: 0 }).title).toBe(
      "Delete 1 logged moment and 1 sleep?",
    );
  });

  it("says a sleep that is still going will be stopped", () => {
    expect(bulkDeletePrompt({ moments: 0, sleeps: 1, going: 1 }).body).toBe(
      "You can restore it from Recently Deleted in Timeline for 7 days. A sleep that is still going will be stopped.",
    );
    expect(bulkDeletePrompt({ moments: 2, sleeps: 2, going: 1 }).body).toBe(
      "You can restore them from Recently Deleted in Timeline for 7 days. A sleep that is still going will be stopped.",
    );
  });
});

describe("bulkSleepFailure: what is said when some ticked sleeps did not go (JOS-92)", () => {
  it("gives the answer's own words for one", () => {
    expect(bulkSleepFailure(1, "Jen already paused this sleep (6:08 pm).")).toBe(
      "Jen already paused this sleep (6:08 pm).",
    );
  });

  it("leads with a count for more than one, then the first answer's words", () => {
    expect(bulkSleepFailure(2, "Couldn't reach the server. Try again.")).toBe(
      "2 sleeps weren't deleted. Couldn't reach the server. Try again.",
    );
  });

  it("has words of its own when the answer had none", () => {
    expect(bulkSleepFailure(1, null)).toBe("Couldn't delete that sleep.");
    expect(bulkSleepFailure(3, null)).toBe("3 sleeps weren't deleted. Couldn't delete that sleep.");
  });
});

describe("sleepSelectKey: a sleep in Edit mode's selection (JOS-92)", () => {
  it("is prefixed, so a sleep can never be mistaken for a moment", () => {
    expect(sleepSelectKey("0b1f")).toBe("sleep:0b1f");
    expect(sleepSelectKey("a")).not.toBe(sleepSelectKey("b"));
  });
});

describe("describeRestoreRefusal: why a sleep can't come back from Recently Deleted", () => {
  const refuse = (err: SleepError) => describeRestoreRefusal(err, london, NOW, names);

  it("names the sleep it would overlap, in the restore's own words", () => {
    const other = sleep(
      [[Date.parse("2026-10-16T12:05:00Z"), Date.parse("2026-10-16T13:40:00Z")]],
      { closedAt: Date.parse("2026-10-16T13:40:00Z") },
    );
    expect(refuse(new SleepError("overlap", { other }))).toBe(
      "This sleep can't be restored: it would overlap the sleep from 1:05 pm to 2:40 pm.",
    );
  });

  it("measures a running sleep it would overlap up to now", () => {
    const running = sleep([[Date.parse("2026-10-16T16:35:00Z"), null]]);
    expect(refuse(new SleepError("overlap", { other: running }))).toBe(
      "This sleep can't be restored: it would overlap the sleep from 5:35 pm to 6:20 pm.",
    );
  });

  it("still says something plain when the other sleep is not known", () => {
    expect(refuse(new SleepError("overlap"))).toBe(
      "This sleep can't be restored: it would overlap another sleep.",
    );
  });

  it("refuses a second running sleep", () => {
    expect(refuse(new SleepError("already-open"))).toBe(
      "This sleep can't be restored: a sleep is already running.",
    );
  });

  it("leaves every other reason in the words it already has", () => {
    expect(refuse(new SleepError("future"))).toBe("That time is in the future.");
  });
});

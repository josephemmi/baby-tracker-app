import { describe, expect, it } from "vitest";
import { MIN, SleepError, type Sleep, type SleepWorld } from "@/lib/sleep";
import {
  WHEEL_MINUTES,
  agoLabel,
  agoOutOfRange,
  durationLabel,
  clockLabel,
  createZone,
  defaultAgo,
  describeSleepError,
  judgePick,
  reopenHint,
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
    const said = (action: "start" | "resume" | "finish" | "reopen" | "edit") =>
      describe_(new SleepError("stale", { by: "jen", action, at: NOW }));
    expect(said("start")).toBe("Jen already started this sleep (6:20 pm).");
    expect(said("resume")).toBe("Jen already put this sleep back on (6:20 pm).");
    expect(said("finish")).toBe("Jen already finished this sleep (6:20 pm).");
    expect(said("reopen")).toBe("Jen already reopened this sleep (6:20 pm).");
    expect(said("edit")).toBe("Jen already edited this sleep (6:20 pm).");
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

import { describe, expect, it } from "vitest";
import { MIN, SleepError, type Sleep } from "@/lib/sleep";
import {
  bulkDeletePrompt,
  bulkSleepFailure,
  durationLabel,
  createZone,
  deleteSleepPrompt,
  describeRestoreRefusal,
  describeSleepError,
  joinTimes,
  listPauses,
  pauseCountLabel,
  pauseLength,
  removePauseBody,
  removePauseLabel,
  sleepSelectKey,
  timerDigits,
  timerSpoken,
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

  it("reads the wall clock of an instant as minutes since local midnight", () => {
    expect(london.clockOf(Date.parse("2026-10-16T17:05:00Z"))).toBe(18 * 60 + 5);
    expect(london.clockOf(Date.parse("2026-10-16T23:00:00Z"))).toBe(0); // midnight BST
    expect(london.clockOf(Date.parse("2026-10-16T23:05:00Z"))).toBe(5);
    expect(newYork.clockOf(Date.parse("2026-10-16T17:05:00Z"))).toBe(13 * 60 + 5);
  });
});

describe("atClock: an instant from a day and a wall-clock time (JOS-103)", () => {
  const MIN_OF = (h: number, m: number) => h * 60 + m;

  it("lands on the local day of the instant, moved by whole days", () => {
    const base = Date.parse("2026-10-16T17:20:00Z"); // 6:20 pm London
    expect(london.atClock(base, 0, MIN_OF(9, 30))).toBe(Date.parse("2026-10-16T08:30:00Z"));
    expect(london.atClock(base, 1, MIN_OF(9, 30))).toBe(Date.parse("2026-10-17T08:30:00Z"));
    expect(london.atClock(base, -1, MIN_OF(23, 59))).toBe(Date.parse("2026-10-15T22:59:00Z"));
  });

  it("uses the LOCAL day: 11:30 pm UTC is already the 17th in London", () => {
    const base = Date.parse("2026-10-16T23:30:00Z");
    expect(london.atClock(base, 0, MIN_OF(7, 10))).toBe(Date.parse("2026-10-17T06:10:00Z"));
  });

  it("steps across a month and a year end", () => {
    expect(london.atClock(Date.parse("2026-10-31T12:00:00Z"), 1, MIN_OF(8, 0))).toBe(
      Date.parse("2026-11-01T08:00:00Z"),
    );
    expect(london.atClock(Date.parse("2026-12-31T12:00:00Z"), 1, MIN_OF(8, 0))).toBe(
      Date.parse("2027-01-01T08:00:00Z"),
    );
  });

  it("reads 12:00 am as the start of the day and 12:30 am just after it", () => {
    const base = Date.parse("2026-10-16T17:20:00Z");
    expect(london.atClock(base, 0, 0)).toBe(Date.parse("2026-10-15T23:00:00Z"));
    expect(london.atClock(base, 0, 30)).toBe(Date.parse("2026-10-15T23:30:00Z"));
  });

  it("takes the reading nearest the reference when the clocks go back and a time happens twice", () => {
    // BST ends Sun 25 Oct 2026: 01:30 is 00:30Z (BST) and again 01:30Z (GMT).
    const early = Date.parse("2026-10-25T00:40:00Z");
    expect(london.atClock(early, 0, MIN_OF(1, 30))).toBe(Date.parse("2026-10-25T00:30:00Z"));
    const late = Date.parse("2026-10-25T01:40:00Z");
    expect(london.atClock(late, 0, MIN_OF(1, 30))).toBe(Date.parse("2026-10-25T01:30:00Z"));
  });

  it("does not throw for a time that does not exist when the clocks go forward", () => {
    // 01:30 on Sun 29 Mar 2026 never happens in London: it reads as 02:30 BST.
    const base = Date.parse("2026-03-29T12:00:00Z");
    const got = london.atClock(base, 0, MIN_OF(1, 30));
    expect(Number.isFinite(got)).toBe(true);
    expect(got).toBe(Date.parse("2026-03-29T01:30:00Z"));
    expect(london.fmtTime(got)).toBe("2:30 am");
  });

  it("works in zones other than London", () => {
    const base = Date.parse("2026-10-16T20:00:00Z");
    expect(newYork.atClock(base, 0, MIN_OF(13, 5))).toBe(Date.parse("2026-10-16T17:05:00Z"));
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
    expect(describe_(err)).toBe("This sleep closed itself after 2 h paused (at 6:00 pm).");
  });

  it("says what a database refusal of an edit means", () => {
    expect(describe_(new SleepError("times", { rule: "pause-gap" }))).toBe(
      "Leave at least 1 minute of sleep between two pauses.",
    );
    expect(describe_(new SleepError("times", { rule: "open-not-last" }))).toBe(
      "Only the last pause can still be going.",
    );
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

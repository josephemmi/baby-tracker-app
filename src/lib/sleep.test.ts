import { describe, expect, it } from "vitest";
import {
  AUTO_CLOSE_MS,
  HOUR,
  MIN,
  SleepError,
  asleepMs,
  closedAtOf,
  endedAt,
  filedAt,
  finishSleep,
  firstStart,
  interleaveByTime,
  isAutoClosed,
  latestSleep,
  openSleep,
  pauseSleep,
  pausesOf,
  removePause,
  removeSleep,
  resumeSleep,
  spanMs,
  startSleep,
  stateOf,
  underMinute,
  type Sleep,
  type SleepErrorCode,
  type SleepWorld,
  type Stretch,
} from "@/lib/sleep";
import { editSleepTimes, toModel } from "@/lib/sleep-edit";
import { listPauses, timerDigits } from "@/lib/sleep-format";

// Fri 16 Oct 2026, 6:20 pm in London (BST, UTC+1).
const NOW = Date.parse("2026-10-16T17:20:00Z");
const at = (minutesFromNow: number) => NOW + minutesFromNow * MIN;

let n = 0;
function sleep(
  stretches: Array<[number, number | null]>,
  over: Partial<Sleep> = {},
): Sleep {
  n += 1;
  const segs: Stretch[] = stretches.map(([start, end]) => ({ start, end }));
  return {
    id: `s${n}`,
    by: "joseph",
    stretches: segs,
    closedAt: null,
    rev: 1,
    last: { by: "joseph", action: "start", at: segs[0].start },
    notes: null,
    ...over,
  };
}

const world = (sleeps: Sleep[] = [], now = NOW): SleepWorld => ({ now, sleeps });

function code(fn: () => unknown): SleepErrorCode {
  try {
    fn();
  } catch (e) {
    if (e instanceof SleepError) return e.code;
    throw e;
  }
  throw new Error("expected a SleepError, but nothing was thrown");
}

function fails(fn: () => unknown): SleepError {
  try {
    fn();
  } catch (e) {
    if (e instanceof SleepError) return e;
    throw e;
  }
  throw new Error("expected a SleepError, but nothing was thrown");
}

describe("state derivation", () => {
  it("is asleep while the last stretch is open", () => {
    expect(stateOf(sleep([[at(-30), null]]), NOW)).toBe("asleep");
  });

  it("is paused once the last stretch ends", () => {
    expect(stateOf(sleep([[at(-60), at(-10)]]), NOW)).toBe("paused");
  });

  it("closes itself after AUTO_CLOSE_MS paused (2 h): 1 h 55 min stays paused, 2 h is finished", () => {
    expect(AUTO_CLOSE_MS).toBe(2 * HOUR);
    const s = sleep([[at(-300), at(-120)]]);
    expect(stateOf(s, NOW - 1)).toBe("paused");
    expect(stateOf(s, NOW)).toBe("finished");
    const near = sleep([[at(-300), at(-115)]]);
    expect(stateOf(near, NOW)).toBe("paused");
  });

  it("is finished whenever closedAt is set", () => {
    const s = sleep([[at(-60), at(-10)]], { closedAt: at(-10) });
    expect(stateOf(s, NOW)).toBe("finished");
  });

  it("auto-closes at the last wake, derived rather than stored", () => {
    const s = sleep([[at(-400), at(-200)]]);
    expect(isAutoClosed(s, NOW)).toBe(true);
    expect(closedAtOf(s, NOW)).toBe(at(-200));
    // a close a person made is not "auto"
    const stored = sleep([[at(-400), at(-200)]], { closedAt: at(-200) });
    expect(isAutoClosed(stored, NOW)).toBe(false);
    expect(closedAtOf(stored, NOW)).toBe(at(-200));
    // one the app wrote when the next sleep started still is, until an edit
    const written = sleep([[at(-400), at(-200)]], {
      closedAt: at(-200),
      last: { by: null, action: "autoclose", at: at(-80) },
    });
    expect(isAutoClosed(written, NOW)).toBe(true);
    expect(closedAtOf(written, NOW)).toBe(at(-200));
  });

  it("counts an open stretch up to now and sums the stretches", () => {
    const s = sleep([
      [at(-120), at(-60)],
      [at(-30), null],
    ]);
    expect(asleepMs(s, NOW)).toBe(90 * MIN);
  });

  it("does not grow while paused", () => {
    const s = sleep([[at(-60), at(-30)]]);
    expect(asleepMs(s, NOW)).toBe(30 * MIN);
    expect(asleepMs(s, NOW + HOUR)).toBe(30 * MIN);
  });

  it("measures the span from first start to close, pauses included", () => {
    const s = sleep([
      [at(-120), at(-100)],
      [at(-60), at(-10)],
    ]);
    expect(spanMs(s, NOW)).toBe(110 * MIN);
    expect(spanMs(sleep([[at(-30), null]]), NOW)).toBe(30 * MIN);
  });

  it("counts pauses as stretches minus one", () => {
    expect(pausesOf(sleep([[at(-60), null]]))).toBe(0);
    expect(
      pausesOf(
        sleep([
          [at(-100), at(-90)],
          [at(-80), at(-70)],
          [at(-60), null],
        ]),
      ),
    ).toBe(2);
  });

  it("picks the open sleep and the latest sleep", () => {
    const old = sleep([[at(-600), at(-540)]], { closedAt: at(-540) });
    const open = sleep([[at(-30), null]]);
    expect(openSleep([old, open], NOW)).toBe(open);
    expect(openSleep([old], NOW)).toBeNull();
    expect(latestSleep([old, open])).toBe(open);
    expect(latestSleep([])).toBeNull();
  });
});

describe("the timer comes from stored times, never counted", () => {
  it("reads 01 h 35 m the moment a phone locked for 95 minutes wakes", () => {
    const started = startSleep(world(), "joseph", NOW, "a");
    const s = started.sleeps[0];
    // no ticks in between: only the clock jumps
    const wake = NOW + 95 * MIN;
    expect(asleepMs(s, wake)).toBe(95 * MIN);
    expect(timerDigits(asleepMs(s, wake))).toEqual({ hours: "01", minutes: "35" });
  });

  it("gives two phones the same answer from the same stored times", () => {
    const s = sleep([[at(-95), null]]);
    expect(asleepMs(s, NOW)).toBe(asleepMs({ ...s }, NOW));
  });
});

describe("start", () => {
  it("starts an open sleep now, rev 1, remembering who and when", () => {
    const w = startSleep(world(), "jen", NOW, "a");
    expect(w.sleeps).toHaveLength(1);
    expect(w.sleeps[0]).toMatchObject({
      id: "a",
      by: "jen",
      closedAt: null,
      rev: 1,
      stretches: [{ start: NOW, end: null }],
      last: { by: "jen", action: "start", at: NOW },
    });
  });

  it("refuses a start in the future", () => {
    expect(code(() => startSleep(world(), "joseph", NOW + 1))).toBe("future");
  });

  it("allows only one open sleep: asleep blocks a second", () => {
    const running = sleep([[at(-30), null]]);
    const err = fails(() => startSleep(world([running]), "jen", NOW));
    expect(err.code).toBe("already-open");
    expect(err.data.other).toBe(running);
  });

  it("allows only one open sleep: paused blocks a second", () => {
    const paused = sleep([[at(-60), at(-20)]]);
    expect(code(() => startSleep(world([paused]), "jen", NOW))).toBe("already-open");
  });

  it("allows a new sleep once the last one is finished", () => {
    const done = sleep([[at(-120), at(-60)]], { closedAt: at(-60) });
    const w = startSleep(world([done]), "jen", NOW, "b");
    expect(w.sleeps.map((s) => s.id)).toEqual([done.id, "b"]);
  });

  it("closes a sleep that auto-closed, at its last wake, in the same step", () => {
    const stale = sleep([[at(-400), at(-250)]]);
    const w = startSleep(world([stale]), "jen", NOW, "b");
    expect(w.sleeps[0].closedAt).toBe(at(-250));
    expect(w.sleeps[0].rev).toBe(stale.rev);
    expect(w.sleeps[0].last).toEqual({ by: null, action: "autoclose", at: at(-250) + AUTO_CLOSE_MS });
    expect(isAutoClosed(w.sleeps[0], NOW)).toBe(true);
    expect(stateOf(w.sleeps[0], NOW)).toBe("finished");
    expect(w.sleeps[1]).toMatchObject({ id: "b", closedAt: null });
  });

  it("refuses a start that overlaps a finished sleep", () => {
    const done = sleep([[at(-120), at(-30)]], { closedAt: at(-30) });
    const err = fails(() => startSleep(world([done]), "jen", at(-60)));
    expect(err.code).toBe("overlap");
    expect(err.data.other).toBe(done);
  });
});

describe("pause needs a minute of sleep", () => {
  const running = () => sleep([[at(-30), null]]);

  it("refuses to pause before the stretch is a minute old", () => {
    const s = sleep([[NOW - 59_999, null]]);
    const err = fails(() => pauseSleep(world([s]), "joseph", s.id, NOW));
    expect(err.code).toBe("short");
    expect(err.data.stretchStart).toBe(s.stretches[0].start);
  });

  it("allows a pause at exactly one minute", () => {
    const s = sleep([[NOW - MIN, null]]);
    const w = pauseSleep(world([s]), "joseph", s.id, NOW);
    expect(stateOf(w.sleeps[0], NOW)).toBe("paused");
  });

  it("ends the stretch and records who paused and when", () => {
    const s = running();
    const w = pauseSleep(world([s]), "jen", s.id, NOW);
    expect(w.sleeps[0].stretches[0].end).toBe(NOW);
    expect(w.sleeps[0].rev).toBe(2);
    expect(w.sleeps[0].last).toEqual({ by: "jen", action: "pause", at: NOW });
  });

  it("measures the minute from the current stretch, not the whole sleep", () => {
    const s = sleep([
      [at(-120), at(-60)],
      [NOW - 30_000, null],
    ]);
    expect(code(() => pauseSleep(world([s]), "joseph", s.id, NOW))).toBe("short");
  });

  it("refuses a pause in the future", () => {
    const s = running();
    expect(code(() => pauseSleep(world([s]), "joseph", s.id, NOW + 1))).toBe("future");
  });

  it("refuses to pause what is already paused", () => {
    const s = sleep([[at(-60), at(-20)]]);
    expect(code(() => pauseSleep(world([s]), "jen", s.id, NOW))).toBe("stale");
  });
});

describe("resume", () => {
  it("adds a stretch, so the pause is counted", () => {
    const s = sleep([[at(-60), at(-20)]]);
    const w = resumeSleep(world([s]), "joseph", s.id, NOW);
    expect(w.sleeps[0].stretches).toEqual([
      { start: at(-60), end: at(-20) },
      { start: NOW, end: null },
    ]);
    expect(pausesOf(w.sleeps[0])).toBe(1);
    expect(w.sleeps[0].last.action).toBe("resume");
  });

  it("refuses to resume before the pause began", () => {
    const s = sleep([[at(-60), at(-20)]]);
    const err = fails(() => resumeSleep(world([s]), "joseph", s.id, at(-30)));
    expect(err.code).toBe("before-wake");
    expect(err.data.limit).toBe(at(-20));
  });

  it("refuses to resume a sleep that is already running", () => {
    const s = sleep([[at(-60), null]]);
    expect(code(() => resumeSleep(world([s]), "jen", s.id, NOW))).toBe("stale");
  });

  it("explains an auto-close instead of resuming", () => {
    const s = sleep([[at(-400), at(-250)]]);
    const err = fails(() => resumeSleep(world([s]), "jen", s.id, NOW));
    expect(err.code).toBe("autoclosed");
    expect(err.data.at).toBe(at(-250) + AUTO_CLOSE_MS);
  });
});

describe("stop works at any time", () => {
  it("stops a sleep a second in, with no minimum", () => {
    const s = sleep([[NOW - 1000, null]]);
    const w = finishSleep(world([s]), "joseph", s.id, NOW);
    expect(stateOf(w.sleeps[0], NOW)).toBe("finished");
    expect(w.sleeps[0].closedAt).toBe(NOW);
    expect(w.sleeps[0].stretches[0].end).toBe(NOW);
    expect(w.sleeps[0].last).toEqual({ by: "joseph", action: "finish", at: NOW });
  });

  it("is rejected only when the time is before the stretch began", () => {
    const s = sleep([[at(-30), null]]);
    const err = fails(() => finishSleep(world([s]), "joseph", s.id, at(-31)));
    expect(err.code).toBe("inverted");
    expect(err.data.stretchStart).toBe(at(-30));
  });

  it("closes a paused sleep at the last wake, whatever the tap time", () => {
    const s = sleep([[at(-60), at(-25)]]);
    const w = finishSleep(world([s]), "jen", s.id, NOW);
    expect(w.sleeps[0].closedAt).toBe(at(-25));
    expect(asleepMs(w.sleeps[0], NOW)).toBe(35 * MIN);
  });

  it("can be done by either parent", () => {
    const s = sleep([[at(-30), null]], { by: "joseph" });
    const w = finishSleep(world([s]), "jen", s.id, NOW);
    expect(w.sleeps[0].last.by).toBe("jen");
  });

  it("refuses to stop what is already finished", () => {
    const s = sleep([[at(-60), at(-20)]], { closedAt: at(-20) });
    expect(code(() => finishSleep(world([s]), "jen", s.id, NOW))).toBe("stale");
  });

  it("explains an auto-close instead of stopping", () => {
    const s = sleep([[at(-400), at(-250)]]);
    expect(code(() => finishSleep(world([s]), "jen", s.id, NOW))).toBe("autoclosed");
  });
});

describe("the under-a-minute rule is about the whole sleep", () => {
  it("is under a minute for a fresh sleep", () => {
    expect(underMinute(sleep([[NOW - 30_000, null]]), NOW)).toBe(true);
    expect(underMinute(sleep([[NOW - 59_999, null]]), NOW)).toBe(true);
  });

  it("is not under a minute at exactly one minute", () => {
    expect(underMinute(sleep([[NOW - MIN, null]]), NOW)).toBe(false);
  });

  it("is not triggered by a fresh stretch after a long sleep", () => {
    const s = sleep([
      [at(-120), at(-60)],
      [NOW - 5000, null],
    ]);
    expect(underMinute(s, NOW)).toBe(false);
  });

  it("applies to a paused sleep too", () => {
    expect(underMinute(sleep([[NOW - 50_000, NOW - 10_000]]), NOW)).toBe(true);
    expect(underMinute(sleep([[at(-30), at(-20)]]), NOW)).toBe(false);
  });
});

describe("two parents: first write wins", () => {
  it("tells the second parent what the first did, and when", () => {
    const s = sleep([[at(-30), null]]);
    const w = world([s]);
    const afterJoseph = pauseSleep(w, "joseph", s.id, NOW, 1);
    // Jen was looking at rev 1 as well
    const err = fails(() => pauseSleep(afterJoseph, "jen", s.id, NOW, 1));
    expect(err.code).toBe("stale");
    expect(err.data).toEqual({ by: "joseph", action: "pause", at: NOW });
  });

  it("lets only one of two simultaneous stops through", () => {
    const s = sleep([[at(-30), null]]);
    const afterJoseph = finishSleep(world([s]), "joseph", s.id, NOW, 1);
    const err = fails(() => finishSleep(afterJoseph, "jen", s.id, NOW, 1));
    expect(err.code).toBe("stale");
    expect(err.data.action).toBe("finish");
  });

  it("rejects a stale action even when the state happens to match again", () => {
    const s = sleep([[at(-30), null]]);
    // Jen pauses and resumes: asleep again, but two revs later
    let w = pauseSleep(world([s]), "jen", s.id, at(-10), 1);
    w = resumeSleep(w, "jen", s.id, at(-5), 2);
    expect(stateOf(w.sleeps[0], NOW)).toBe("asleep");
    const err = fails(() => pauseSleep(w, "joseph", s.id, NOW, 1));
    expect(err.code).toBe("stale");
    expect(err.data.action).toBe("resume");
  });

  it("applies when the user's rev is current", () => {
    const s = sleep([[at(-30), null]]);
    const w = pauseSleep(world([s]), "joseph", s.id, NOW, 1);
    const resumed = resumeSleep(w, "jen", s.id, NOW, 2);
    expect(resumed.sleeps[0].rev).toBe(3);
  });

  it("rejects an edit made on an out-of-date rev", () => {
    const s = sleep([[at(-30), null]]);
    const earlier = (minutes: number) => ({ ...toModel(s, NOW), start: at(-minutes) });
    const afterJen = editSleepTimes(world([s]), "jen", s.id, earlier(40), 1);
    const err = fails(() => editSleepTimes(afterJen, "joseph", s.id, earlier(50), 1));
    expect(err.code).toBe("stale");
    expect(err.data.action).toBe("edit");
  });

  it("answers 'gone' for a sleep the other parent deleted", () => {
    const s = sleep([[at(-30), null]]);
    const w = removeSleep(world([s]), "jen", s.id, 1);
    expect(w.sleeps).toHaveLength(0);
    expect(code(() => pauseSleep(w, "joseph", s.id, NOW))).toBe("gone");
    expect(code(() => finishSleep(w, "joseph", s.id, NOW))).toBe("gone");
    expect(code(() => removeSleep(w, "joseph", s.id))).toBe("gone");
  });

  it("refuses to delete a sleep that changed under you", () => {
    const s = sleep([[at(-30), null]]);
    const paused = pauseSleep(world([s]), "jen", s.id, NOW, 1);
    expect(code(() => removeSleep(paused, "joseph", s.id, 1))).toBe("stale");
  });
});

describe("the writes never mutate the world they are given", () => {
  it("returns a new world and leaves the old one untouched", () => {
    const s = sleep([[at(-30), null]]);
    const before = world([s]);
    const snapshot = JSON.stringify(before);
    pauseSleep(before, "joseph", s.id, NOW);
    finishSleep(before, "joseph", s.id, NOW);
    editSleepTimes(before, "joseph", s.id, { ...toModel(s, NOW), start: at(-40) }, 1);
    removeSleep(before, "joseph", s.id);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("endedAt: which day a finished sleep belongs to", () => {
  it("is the close, so an overnight sleep belongs to the morning it ended", () => {
    const night = sleep([[Date.parse("2026-10-15T22:00:00Z"), Date.parse("2026-10-16T05:00:00Z")]], {
      closedAt: Date.parse("2026-10-16T05:00:00Z"),
    });
    expect(endedAt(night, NOW)).toBe(Date.parse("2026-10-16T05:00:00Z"));
  });

  it("is the last wake for a paused sleep, and the close for an auto-closed one", () => {
    expect(endedAt(sleep([[at(-60), at(-20)]]), NOW)).toBe(at(-20));
    expect(endedAt(sleep([[at(-600), at(-400)]]), NOW)).toBe(at(-400));
  });

  it("is the start while the sleep is still running", () => {
    expect(endedAt(sleep([[at(-30), null]]), NOW)).toBe(at(-30));
  });
});

describe("filedAt: Home puts a sleep that is going under Today, and leaves it where it began", () => {
  it("is now for a running or paused sleep, whenever it started", () => {
    expect(filedAt(sleep([[at(-30), null]]), NOW)).toBe(NOW);
    expect(filedAt(sleep([[Date.parse("2026-10-15T22:00:00Z"), null]]), NOW)).toBe(NOW);
    expect(filedAt(sleep([[at(-60), at(-20)]]), NOW)).toBe(NOW);
  });

  it("is the close once the sleep is finished, or the last wake once it has closed itself", () => {
    expect(filedAt(sleep([[at(-60), at(-20)]], { closedAt: at(-20) }), NOW)).toBe(at(-20));
    expect(filedAt(sleep([[at(-600), at(-400)]]), NOW)).toBe(at(-400));
  });

  it("changes nothing about order: a reopened morning sleep still reads between the moments around it", () => {
    // 9:15–10:06 (London) reopened at 3 pm, with a feed at 8:30 and a nappy at 11:20 either side.
    const morning = sleep([[Date.parse("2026-10-16T08:15:00Z"), null]], { rev: 3 });
    const items = interleaveByTime(
      [{ timestamp: "2026-10-16T10:20:00Z" }, { timestamp: "2026-10-16T07:30:00Z" }],
      [morning],
    ).map((i) => (i.kind === "sleep" ? "sleep" : i.moment.timestamp.slice(11, 16)));
    expect(items).toEqual(["10:20", "sleep", "07:30"]);
    expect(filedAt(morning, Date.parse("2026-10-16T14:00:00Z"))).toBe(Date.parse("2026-10-16T14:00:00Z"));
  });
});

describe("interleaveByTime", () => {
  const moment = (iso: string) => ({ timestamp: iso });
  const label = (items: ReturnType<typeof interleaveByTime>) =>
    items.map((i) => (i.kind === "moment" ? i.moment.timestamp.slice(11, 16) : `sleep@${new Date(firstStart(i.sleep)).toISOString().slice(11, 16)}`));

  it("reads a day's moments and sleeps as one log, newest first", () => {
    const moments = [moment("2026-10-16T16:01:00Z"), moment("2026-10-16T12:20:00Z"), moment("2026-10-15T17:30:00Z")];
    const sleeps = [
      sleep([[Date.parse("2026-10-16T13:05:00Z"), Date.parse("2026-10-16T14:40:00Z")]]),
      sleep([[Date.parse("2026-10-16T09:10:00Z"), Date.parse("2026-10-16T10:05:00Z")]]),
    ];
    expect(label(interleaveByTime(moments, sleeps))).toEqual([
      "16:01",
      "sleep@13:05",
      "12:20",
      "sleep@09:10",
      "17:30",
    ]);
  });

  it("copes with either list being empty", () => {
    expect(interleaveByTime([], [])).toEqual([]);
    expect(label(interleaveByTime([moment("2026-10-16T16:01:00Z")], []))).toEqual(["16:01"]);
    const s = sleep([[NOW, null]]);
    expect(interleaveByTime([], [s])).toEqual([{ kind: "sleep", sleep: s }]);
  });

  it("puts a sleep before a moment at the same instant", () => {
    const s = sleep([[Date.parse("2026-10-16T12:00:00Z"), null]]);
    const items = interleaveByTime([moment("2026-10-16T12:00:00Z")], [s]);
    expect(items.map((i) => i.kind)).toEqual(["sleep", "moment"]);
  });
});

// The same story, step for step, as scenario 17 in supabase/tests/sleeps.sql:
// the SQL function is authoritative and these pin down that the TypeScript
// rules agree with it (JOS-78). What can't be mirrored here is the household
// check and signed-out callers — those are the database's, scenario 17e.
// Since JOS-103 a pause can be removed in every state, finished included.
describe("remove a pause (scenario 17)", () => {
  const T = (clock: string) => Date.parse(`2026-10-${clock}:00Z`);
  const JOSEPH = "joseph";
  const JEN = "jen";

  // Saturday night as it was on Joseph's screenshot: pauses of 2 and 33 min.
  const night = () =>
    sleep(
      [
        [T("16T21:00"), T("16T21:06")],
        [T("16T21:08"), T("17T02:10")],
        [T("17T02:43"), T("17T08:34")],
      ],
      {
        closedAt: T("17T08:34"),
        rev: 6,
        last: { by: JOSEPH, action: "finish", at: T("17T08:34") },
      },
    );
  const finishedNight = () => {
    const s = night();
    return { s, w: world([s], T("17T08:40")) };
  };

  it("17a works on a finished sleep, which stays finished with the same start and end", () => {
    const { s, w } = finishedNight();
    const after = removePause(w, JEN, s.id, 0, 6);
    const got = after.sleeps[0];
    expect(got.rev).toBe(7);
    expect(got.closedAt).toBe(T("17T08:34"));
    expect(stateOf(got, w.now)).toBe("finished");
    expect(firstStart(got)).toBe(T("16T21:00"));
  });

  it("17a a stale rev is a conflict naming what happened since", () => {
    const { s, w } = finishedNight();
    const after = removePause(w, JOSEPH, s.id, 0, 6);
    const err = fails(() => removePause({ ...after, now: T("17T08:41") }, JEN, s.id, 0, 6));
    expect(err.code).toBe("stale");
    expect(err.data.action).toBe("edit");
  });

  it("17a a pause that is not there is no-pause, for every kind of bad index", () => {
    const { s, w } = finishedNight();
    for (const index of [2, 3, -1, 1.5, Number.NaN, null as unknown as number]) {
      expect(code(() => removePause(w, JEN, s.id, index, 6))).toBe("no-pause");
    }
    expect(w.sleeps[0].rev).toBe(6);
  });

  it("17a removes the first (2 min) pause: the stretches join, the 33 min pause stays", () => {
    const { s, w } = finishedNight();
    const after = removePause({ ...w, now: T("17T08:41") }, JEN, s.id, 0, 6);
    const got = after.sleeps[0];
    expect(got.stretches).toEqual([
      { start: T("16T21:00"), end: T("17T02:10") },
      { start: T("17T02:43"), end: T("17T08:34") },
    ]);
    expect(got.rev).toBe(7);
    expect(got.last).toEqual({ by: JEN, action: "edit", at: T("17T08:41") });
    expect(firstStart(got)).toBe(T("16T21:00"));
    // repeating the same call is a conflict, not a second removal
    expect(code(() => removePause(after, JEN, s.id, 0, 6))).toBe("stale");
  });

  it("17a removes the last remaining pause: one stretch, no pauses, then nothing left", () => {
    const { s, w } = finishedNight();
    const first = removePause({ ...w, now: T("17T08:41") }, JEN, s.id, 0, 6);
    const second = removePause({ ...first, now: T("17T08:42") }, JOSEPH, s.id, 0, 7);
    expect(second.sleeps[0].stretches).toEqual([{ start: T("16T21:00"), end: T("17T08:34") }]);
    expect(second.sleeps[0].last.by).toBe(JOSEPH);
    expect(pausesOf(second.sleeps[0])).toBe(0);
    expect(code(() => removePause(second, JOSEPH, s.id, 0, 8))).toBe("no-pause");
  });

  it("17b works on a running sleep, and the open stretch keeps running", () => {
    const s = sleep([[T("17T10:00"), T("17T10:30")], [T("17T10:40"), null]], { rev: 3 });
    const w = world([s], T("17T10:41"));
    const after = removePause(w, JOSEPH, s.id, 0, 3);
    expect(after.sleeps[0].stretches).toEqual([{ start: T("17T10:00"), end: null }]);
    expect(stateOf(after.sleeps[0], w.now)).toBe("asleep");
    expect(after.sleeps[0].rev).toBe(4);
    // it can pause again afterwards
    const paused = pauseSleep({ ...after, now: T("17T10:45") }, JOSEPH, s.id, T("17T10:45"), 4);
    expect(stateOf(paused.sleeps[0], T("17T10:45"))).toBe("paused");
  });

  it("17b the pause in progress is not removable, only Resume ends it", () => {
    const s = sleep([[T("17T10:00"), T("17T10:45")]], { rev: 4 });
    const w = world([s], T("17T10:46"));
    expect(code(() => removePause(w, JOSEPH, s.id, 0, 4))).toBe("no-pause");
    expect(code(() => removePause(w, JOSEPH, s.id, 1, 4))).toBe("no-pause");
  });

  it("17c an earlier pause goes while the sleep stays paused, and it can resume", () => {
    const s = sleep(
      [
        [T("17T12:00"), T("17T12:10")],
        [T("17T12:18"), T("17T12:40")],
      ],
      { rev: 4 },
    );
    const w = world([s], T("17T12:52"));
    const after = removePause(w, JOSEPH, s.id, 0, 4);
    expect(after.sleeps[0].stretches).toEqual([{ start: T("17T12:00"), end: T("17T12:40") }]);
    expect(stateOf(after.sleeps[0], w.now)).toBe("paused");
    const resumed = resumeSleep(after, JOSEPH, s.id, w.now, 5);
    expect(stateOf(resumed.sleeps[0], w.now)).toBe("asleep");
  });

  it("17d refuses to swallow another sleep that sits inside the pause", () => {
    const a = sleep(
      [
        [T("18T01:00"), T("18T01:20")],
        [T("18T02:00"), T("18T03:00")],
      ],
      { rev: 7 },
    );
    const b = sleep([[T("18T01:30"), T("18T01:45")]], { closedAt: T("18T01:45") });
    const w = world([a, b], T("18T03:30"));
    const err = fails(() => removePause(w, JOSEPH, a.id, 0, 7));
    expect(err.code).toBe("overlap");
    expect(err.data.other?.id).toBe(b.id);
    expect(w.sleeps[0].stretches).toHaveLength(2);
  });

  it("17e a deleted or unknown sleep is gone", () => {
    const s = sleep([[T("19T01:00"), T("19T01:20")], [T("19T02:00"), T("19T03:00")]], { rev: 2 });
    const deleted = removeSleep(world([s], T("19T03:30")), JOSEPH, s.id, 2);
    expect(code(() => removePause(deleted, JOSEPH, s.id, 0, 2))).toBe("gone");
    expect(code(() => removePause(deleted, JOSEPH, "nobody", 0, 1))).toBe("gone");
  });

  it("17f the time adds up: removing a pause moves exactly its length into 'asleep'", () => {
    const { s, w: start } = finishedNight();
    let w = start;
    const before = asleepMs(w.sleeps[0], w.now);
    expect(before).toBe((10 * 60 + 59) * MIN);
    expect(timerDigits(before)).toEqual({ hours: "10", minutes: "59" });
    w = removePause({ ...w, now: T("17T08:41") }, JEN, s.id, 0, 6);
    const after = asleepMs(w.sleeps[0], w.now);
    expect(after).toBe(before + 2 * MIN);
    expect(timerDigits(after)).toEqual({ hours: "11", minutes: "01" });
    expect(w.sleeps[0].closedAt).toBe(T("17T08:34"));
  });

  it("17g a sleep that closed itself after 2 h paused loses a pause the same way, and is closed for good, no longer marked as the app's", () => {
    const s = sleep(
      [
        [T("22T21:00"), T("22T21:30")],
        [T("22T21:40"), T("22T22:10")],
      ],
      { rev: 4 },
    );
    const w = world([s], T("23T01:11"));
    expect(s.closedAt).toBeNull();
    expect(isAutoClosed(s, w.now)).toBe(true);
    const after = removePause(w, JOSEPH, s.id, 0, 4);
    const got = after.sleeps[0];
    expect(got.stretches).toEqual([{ start: T("22T21:00"), end: T("22T22:10") }]);
    expect(got.closedAt).toBe(T("22T22:10"));
    expect(isAutoClosed(got, w.now)).toBe(false);
    expect(got.last.action).toBe("edit");
  });

  it("two parents: the second to remove a pause is told what the first did", () => {
    const s = sleep(
      [
        [at(-300), at(-250)],
        [at(-240), at(-100)],
        [at(-90), at(-10)],
      ],
      { rev: 5 },
    );
    const afterJen = removePause(world([s]), JEN, s.id, 0, 5);
    const err = fails(() => removePause(afterJen, JOSEPH, s.id, 1, 5));
    expect(err.code).toBe("stale");
    expect(err.data).toEqual({ by: JEN, action: "edit", at: NOW });
  });

  it("leaves the world it was given, and every other sleep, untouched", () => {
    const a = sleep([[at(-300), at(-250)], [at(-240), at(-100)]], { rev: 3 });
    const b = sleep([[at(-60), at(-30)]], { closedAt: at(-30) });
    const before = world([a, b]);
    const snapshot = JSON.stringify(before);
    const after = removePause(before, JOSEPH, a.id, 0);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after.sleeps[1]).toBe(b);
  });
});

// A seeded random walk over a sleep's whole life. Whatever happens, the rules
// below must hold after every step; a failure prints the seed and step.
describe("remove a pause: properties that hold however a sleep got there", () => {
  function rng(seed: number) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Where the sleep ends for the sum: now while it is going, else its close.
  const spanEnd = (s: Sleep, now: number) =>
    stateOf(s, now) === "finished" ? (closedAtOf(s, now) as number) : now;

  it("never moves the start or the wake and always adds up, whatever state the sleep is in", () => {
    let removals = 0;
    let removedFromFinished = 0;
    let steps = 0;

    for (let seed = 1; seed <= 60; seed++) {
      const next = rng(seed);
      let w = startSleep(world([], Date.parse("2026-10-16T20:00:00Z")), "joseph", Date.parse("2026-10-16T20:00:00Z"), "r");

      for (let step = 0; step < 100; step++) {
        steps += 1;
        const label = `seed ${seed} step ${step}`;
        // Mostly short gaps, now and then past the 2 h auto-close.
        w = { ...w, now: w.now + Math.ceil(next() * (next() < 0.04 ? 240 : 30)) * MIN };
        // A sleep that is over is sometimes followed by a new one, so the walk
        // keeps meeting live ones.
        if (stateOf(w.sleeps[0], w.now) === "finished" && next() < 0.3) {
          w = startSleep(world([], w.now), "joseph", w.now, "r");
        }
        const before = w.sleeps[0];
        // Mostly pausing and resuming, so there are pauses to remove; Stop is
        // rare, or the sleep is finished before there is anything to see.
        const roll = next();
        try {
          if (roll < 0.28) w = pauseSleep(w, "joseph", "r", w.now);
          else if (roll < 0.56) w = resumeSleep(w, "joseph", "r", w.now);
          else if (roll < 0.6) w = finishSleep(w, "joseph", "r", w.now);
          else {
            const index = Math.floor(next() * (before.stretches.length + 2)) - 1;
            const finished = stateOf(before, w.now) === "finished";
            let after: SleepWorld | null = null;
            try {
              after = removePause(w, "jen", "r", index, before.rev);
            } catch (e) {
              if (!(e instanceof SleepError)) throw e;
              expect(e.code, label).toBe("no-pause");
              expect(w.sleeps[0], label).toBe(before);
            }
            if (after) {
              removals += 1;
              if (finished) removedFromFinished += 1;
              const got = after.sleeps[0];
              const gone = listPauses(before, w.now).rows[index];
              expect(firstStart(got), label).toBe(firstStart(before));
              expect(lastStretchEnd(got), label).toBe(lastStretchEnd(before));
              expect(got.stretches.length, label).toBe(before.stretches.length - 1);
              expect(asleepMs(got, w.now), label).toBe(asleepMs(before, w.now) + (gone.end - gone.start));
              expect(got.rev, label).toBe(before.rev + 1);
              w = after;
            }
          }
        } catch (e) {
          if (!(e instanceof SleepError)) throw e;
        }

        const s = w.sleeps[0];
        const { totalMs } = listPauses(s, w.now);
        expect(asleepMs(s, w.now) + totalMs, label).toBe(spanEnd(s, w.now) - firstStart(s));
      }
    }

    // The walk has to actually reach the rule, or it proves nothing.
    expect(removals).toBeGreaterThan(200);
    expect(removedFromFinished).toBeGreaterThan(20);
    expect(steps).toBe(6000);
  });
});

function lastStretchEnd(s: Sleep): number | null {
  return s.stretches[s.stretches.length - 1].end;
}

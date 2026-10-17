import { describe, expect, it } from "vitest";
import {
  HOUR,
  MIN,
  SleepError,
  asleepMs,
  canReopen,
  closedAtOf,
  editSleepTime,
  endedAt,
  filedAt,
  finishSleep,
  firstStart,
  floorFor,
  interleaveByTime,
  isAutoClosed,
  latestSleep,
  openSleep,
  pauseSleep,
  pausesOf,
  pickBounds,
  removeSleep,
  reopenSleep,
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
import { timerDigits } from "@/lib/sleep-format";

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

  it("stays paused at exactly 3 h and finishes only after it", () => {
    const s = sleep([[at(-300), at(-180)]]);
    expect(stateOf(s, NOW)).toBe("paused");
    expect(stateOf(s, NOW + 1)).toBe("finished");
  });

  it("is finished whenever closedAt is set", () => {
    const s = sleep([[at(-60), at(-10)]], { closedAt: at(-10) });
    expect(stateOf(s, NOW)).toBe("finished");
  });

  it("auto-closes at the last wake, derived rather than stored", () => {
    const s = sleep([[at(-400), at(-200)]]);
    expect(isAutoClosed(s, NOW)).toBe(true);
    expect(closedAtOf(s, NOW)).toBe(at(-200));
    // a stored close is not "auto"
    const stored = sleep([[at(-400), at(-200)]], { closedAt: at(-200) });
    expect(isAutoClosed(stored, NOW)).toBe(false);
    expect(closedAtOf(stored, NOW)).toBe(at(-200));
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
    expect(err.data.at).toBe(at(-250) + 3 * HOUR);
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

describe("reopen", () => {
  const finished = (wakeMinutesAgo: number) =>
    sleep([[at(-wakeMinutesAgo - 60), at(-wakeMinutesAgo)]], {
      closedAt: at(-wakeMinutesAgo),
    });

  it("puts a finished sleep back to paused, keeping the last wake", () => {
    const s = finished(30);
    const w = reopenSleep(world([s]), "joseph", s.id);
    expect(w.sleeps[0].closedAt).toBeNull();
    expect(stateOf(w.sleeps[0], NOW)).toBe("paused");
    expect(w.sleeps[0].stretches).toEqual(s.stretches);
    expect(w.sleeps[0].last).toEqual({ by: "joseph", action: "reopen", at: at(-30) });
  });

  it("is offered for 3 h after the last wake", () => {
    expect(canReopen(world([finished(180)]), finished(180)).ok).toBe(true);
    const late = finished(181);
    expect(canReopen(world([late]), late)).toEqual({ ok: false, reason: "expired" });
    expect(code(() => reopenSleep(world([late]), "joseph", late.id))).toBe("no-reopen");
  });

  it("is not offered when a newer sleep exists", () => {
    const old = finished(120);
    const newer = sleep([[at(-60), at(-10)]], { closedAt: at(-10) });
    expect(canReopen(world([old, newer]), old)).toEqual({ ok: false, reason: "newer" });
    expect(canReopen(world([old, newer]), newer).ok).toBe(true);
  });

  it("is not offered after an auto-close", () => {
    const auto = sleep([[at(-400), at(-250)]]);
    expect(canReopen(world([auto]), auto)).toEqual({ ok: false, reason: "autoclosed" });
    const err = fails(() => reopenSleep(world([auto]), "joseph", auto.id));
    expect(err.code).toBe("no-reopen");
    expect(err.data.reason).toBe("autoclosed");
  });

  it("leaves an open sleep alone", () => {
    const open = sleep([[at(-30), null]]);
    expect(code(() => reopenSleep(world([open]), "joseph", open.id))).toBe("stale");
  });

  it("can be resumed or stopped again afterwards", () => {
    const s = finished(30);
    const reopened = reopenSleep(world([s]), "joseph", s.id);
    const resumed = resumeSleep(reopened, "joseph", s.id, NOW);
    expect(stateOf(resumed.sleeps[0], NOW)).toBe("asleep");
    expect(pausesOf(resumed.sleeps[0])).toBe(1);

    const stopped = finishSleep(reopened, "joseph", s.id, NOW);
    expect(stopped.sleeps[0].closedAt).toBe(at(-30));
  });
});

describe("setting the start or wake time", () => {
  it("moves the start earlier of a running sleep", () => {
    const s = sleep([[at(-10), null]]);
    const w = editSleepTime(world([s]), "joseph", s.id, "start", at(-25));
    expect(firstStart(w.sleeps[0])).toBe(at(-25));
    expect(asleepMs(w.sleeps[0], NOW)).toBe(25 * MIN);
    expect(w.sleeps[0].rev).toBe(2);
    expect(w.sleeps[0].last).toEqual({ by: "joseph", action: "edit", at: NOW });
  });

  it("moves the wake time of a paused sleep", () => {
    const s = sleep([[at(-60), at(-10)]]);
    const w = editSleepTime(world([s]), "joseph", s.id, "end", at(-20));
    expect(w.sleeps[0].stretches[0].end).toBe(at(-20));
  });

  it("can not start in the future", () => {
    const s = sleep([[at(-10), null]]);
    expect(code(() => editSleepTime(world([s]), "joseph", s.id, "start", NOW + 1))).toBe("future");
  });

  it("can not start before the previous sleep ended", () => {
    const prev = sleep([[at(-200), at(-100)]], { closedAt: at(-100) });
    const s = sleep([[at(-30), null]]);
    const err = fails(() => editSleepTime(world([prev, s]), "joseph", s.id, "start", at(-101)));
    expect(err.code).toBe("before-prev");
    expect(err.data.limit).toBe(at(-100));
    // right at the previous wake is allowed
    expect(() => editSleepTime(world([prev, s]), "joseph", s.id, "start", at(-100))).not.toThrow();
  });

  it("can not start after the first stretch has ended", () => {
    const s = sleep([[at(-60), at(-20)]]);
    const err = fails(() => editSleepTime(world([s]), "joseph", s.id, "start", at(-20)));
    expect(err.code).toBe("after-end");
    expect(err.data.limit).toBe(at(-20));
  });

  it("can not wake before the last stretch is a minute old", () => {
    const s = sleep([[at(-60), at(-10)]]);
    expect(code(() => editSleepTime(world([s]), "joseph", s.id, "end", at(-60) + 30_000))).toBe(
      "before-start",
    );
  });

  it("refuses an edit that would overlap another sleep", () => {
    const s = sleep([[at(-60), at(-50)]]);
    const newer = sleep([[at(-40), at(-5)]], { closedAt: at(-5) });
    expect(code(() => editSleepTime(world([s, newer]), "joseph", s.id, "end", at(-30)))).toBe(
      "overlap",
    );
  });

  it("has no wake time to move while still asleep", () => {
    const s = sleep([[at(-30), null]]);
    expect(code(() => editSleepTime(world([s]), "joseph", s.id, "end", at(-5)))).toBe("stale");
  });

  it("is not available on a finished sleep", () => {
    const s = sleep([[at(-60), at(-20)]], { closedAt: at(-20) });
    expect(code(() => editSleepTime(world([s]), "joseph", s.id, "start", at(-70)))).toBe("stale");
  });

  it("exposes the window the picker allows", () => {
    const prev = sleep([[at(-200), at(-100)]], { closedAt: at(-100) });
    const running = sleep([[at(-30), null]]);
    expect(pickBounds(world([prev, running]), running, "start")).toEqual({ lo: at(-100), hi: NOW });
    expect(pickBounds(world([prev, running]), running, "end")).toEqual({
      lo: at(-30) + MIN,
      hi: NOW,
    });
    const paused = sleep([[at(-30), at(-10)]]);
    expect(pickBounds(world([prev, paused]), paused, "start").hi).toBe(at(-10) - MIN);
    expect(floorFor(world([prev, paused]), paused.id)).toBe(at(-100));
    expect(floorFor(world([paused]), paused.id)).toBe(-Infinity);
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
    const afterJen = editSleepTime(world([s]), "jen", s.id, "start", at(-40), 1);
    const err = fails(() => editSleepTime(afterJen, "joseph", s.id, "start", at(-50), 1));
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
    editSleepTime(before, "joseph", s.id, "start", at(-40));
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

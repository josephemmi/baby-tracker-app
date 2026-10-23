// The 52 hand-worked checks of the reference engine (sleep-stats.test.js, Drive
// Docs / v1.14), test for test. Every expectation is worked out by hand from
// the times written in the test, not read back from the engine.
//
// The days are the device's local days, so this file pins a time zone: London,
// whose clocks go back on Sun 25 Oct 2026 and forward on Sun 28 Mar 2027 (two
// of the tests). Assigned here, before any date is built, so it holds
// whatever zone the machine is in; each test file runs in its own process, so
// the rest of the suite is untouched. The first test fails loudly if it did not
// take (a runner that shares one process between files would need the zone set
// from outside: TZ=Europe/London).
process.env.TZ = "Europe/London";

import { describe, expect, it } from "vitest";
import { formatTimeAgo } from "@/lib/entries";
import { formatMinutes } from "@/lib/reports";
import { HOUR, MIN, type Sleep } from "@/lib/sleep";
import * as S from "@/lib/sleep-reports";
import type { ReportSleep } from "@/lib/sleep-reports";

// Local-time helper: L(10, 16, 19, 30) = 16 Oct 2026, 7:30 pm local.
const L = (mo: number, d: number, h = 0, mi = 0, y = 2026): number =>
  new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

// A sleep from [start, end] pairs; a null end is a running stretch. By default
// it is closed where its last stretch ends; pass null for one still open.
const sleep = (
  id: string,
  stretches: Array<[number, number | null]>,
  closedAt: number | null | "x" = "x",
): ReportSleep => ({
  id,
  stretches: stretches.map(([start, end]) => ({ start, end })),
  closedAt: closedAt === "x" ? (stretches[stretches.length - 1][1] ?? null) : closedAt,
  deletedAt: null,
});

const NOW = L(10, 20, 12, 0); // well after every fixture below unless stated
const byKey = (days: S.Day[], k: string): S.Day => {
  const d = days.find((x) => x.key === k);
  if (!d) throw new Error(`no day ${k}`);
  return d;
};
const mins = (m: number): number => m * MIN;
// "3h 50m ago", the way the Log tile words it.
const ago = (nowMs: number, thenMs: number): string =>
  formatTimeAgo(new Date(thenMs).toISOString(), new Date(nowMs));

// A typical week (Sun 11 - Wed 14 Oct 2026). Minutes asleep in the comments.
const SUN_NIGHT = sleep("sunN", [[L(10, 11, 19, 20), L(10, 12, 6, 55)]]); // 695
const MN1 = sleep("mn1", [[L(10, 12, 9, 35), L(10, 12, 10, 50)]]); // 75
const MN2 = sleep("mn2", [[L(10, 12, 13, 10), L(10, 12, 14, 45)]]); // 95
const MON_NIGHT = sleep("monN", [[L(10, 12, 19, 30), L(10, 13, 7, 35)]]); // 725
const TN1 = sleep("tn1", [[L(10, 13, 9, 50), L(10, 13, 11, 5)]]); // 75
const TN2 = sleep("tn2", [[L(10, 13, 13, 20), L(10, 13, 15, 0)]]); // 100
const TUE_NIGHT = sleep("tueN", [[L(10, 13, 19, 45), L(10, 14, 6, 50)]]); // 665
const WN1 = sleep("wn1", [[L(10, 14, 9, 30), L(10, 14, 10, 40)]]); // 70
const WEEK = [SUN_NIGHT, MN1, MN2, MON_NIGHT, TN1, TN2, TUE_NIGHT, WN1];

// Joseph's first logged week, rounded (JOS-90). Sat 17 Oct is the first day of
// logging, so it has daytime sleeps but no night: Friday night was never logged
// and Saturday night ends on Sunday. The rule as first shipped, with no minimum
// for a night, named the 3 h 50 m daytime sleep Saturday's night and averaged
// the bedtime to 1:13 am and the wake-up to 10:33 am.
const FW_A = sleep("fwA", [[L(10, 17, 10, 15), L(10, 17, 11, 5)]]); // 50
const FW_B = sleep("fwB", [[L(10, 17, 11, 10), L(10, 17, 15, 0)]]); // 230
const FW_C = sleep("fwC", [[L(10, 17, 18, 40), L(10, 17, 19, 40)]]); // 60
const FW_N1 = sleep("fwN1", [
  [L(10, 17, 21, 0), L(10, 18, 2, 10)], // 310
  [L(10, 18, 2, 45), L(10, 18, 8, 30)], // 345, after 35 min awake
]); // 655, wakes Sun 18
const FW_NAP1 = sleep("fwNap1", [[L(10, 18, 12, 40), L(10, 18, 13, 10)]]); // 30
const FW_N2 = sleep("fwN2", [
  [L(10, 18, 19, 30), L(10, 18, 19, 55)], // 25
  [L(10, 18, 20, 15), L(10, 19, 0, 0)], // 225, after 20 min awake
  [L(10, 19, 0, 25), L(10, 19, 2, 15)], // 110, after 25 min awake
  [L(10, 19, 3, 55), L(10, 19, 8, 10)], // 255, after 100 min awake
]); // 615, wakes Mon 19
const FW_NAP2 = sleep("fwNap2", [[L(10, 19, 14, 20), L(10, 19, 16, 30)]]); // 130
const FW_N3 = sleep("fwN3", [[L(10, 19, 19, 20), L(10, 20, 10, 15)]]); // 895, wakes Tue 20 (today)
const FIRST_WEEK = [FW_A, FW_B, FW_C, FW_N1, FW_NAP1, FW_N2, FW_NAP2, FW_N3];

it("TZ is Europe/London (run with TZ=Europe/London)", () => {
  expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-60);
});

describe("the model", () => {
  it("a night belongs to the date he woke: 7:30 pm Fri → 6:30 am Sat is one sleep on Sat, never cut", () => {
    const days = S.computeDays([sleep("n", [[L(10, 16, 19, 30), L(10, 17, 6, 30)]])], NOW);
    expect(days.length).toBe(1); // Fri only holds the start of the night, so it is not a day of its own
    const d = days[0];
    expect(d.key).toBe("2026-10-17");
    expect(d.totalMs).toBe(11 * HOUR);
    expect(d.nightMs).toBe(11 * HOUR);
    expect(d.napMs).toBe(0);
    expect(d.napCount).toBe(0);
    expect(d.hasNight).toBe(true);
    expect(d.bedtime).toBe(L(10, 16, 19, 30));
    expect(d.wakeUp).toBe(L(10, 17, 6, 30));
    expect(d.longestNightStretchMs).toBe(11 * HOUR);
    expect(d.nightWakes).toBe(0);
  });

  it("midnight does not cut a sleep: 11 pm → 1 am is 2 h on the date he woke", () => {
    const days = S.computeDays([sleep("n", [[L(10, 16, 23, 0), L(10, 17, 1, 0)]])], NOW);
    expect(days.length).toBe(1);
    expect(days[0].key).toBe("2026-10-17");
    expect(days[0].totalMs).toBe(2 * HOUR);
  });

  it("the longest sleep that ended on a date is its night; the others are naps (Tue 13 Oct)", () => {
    const d = byKey(S.computeDays(WEEK, NOW), "2026-10-13");
    expect(d.totalMs).toBe(mins(725 + 75 + 100)); // 15h
    expect(d.nightMs).toBe(mins(725)); // 12h 5m
    expect(d.napCount).toBe(2);
    expect(d.napMs).toBe(mins(175)); // 2h 55m
    expect(d.bedtime).toBe(L(10, 12, 19, 30));
    expect(d.wakeUp).toBe(L(10, 13, 7, 35));
    expect(d.sleeps.map((x) => [x.id, x.kind])).toStrictEqual([
      ["monN", "night"],
      ["tn1", "nap"],
      ["tn2", "nap"],
    ]);
  });

  it("a tie for longest goes to the earlier sleep", () => {
    const d = S.computeDays(
      [
        sleep("a", [[L(10, 16, 0, 0), L(10, 16, 6, 0)]]),
        sleep("b", [[L(10, 16, 12, 0), L(10, 16, 18, 0)]]),
      ],
      NOW,
    )[0];
    expect(d.sleeps.map((x) => [x.id, x.kind])).toStrictEqual([
      ["a", "night"],
      ["b", "nap"],
    ]);
  });

  it("a night needs 5 h asleep: exactly 5 h is one, a second less is a nap (JOS-90)", () => {
    const wokeAt = (end: number) => S.computeDays([sleep("a", [[L(10, 16, 0, 0), end]])], NOW)[0];
    expect(S.CFG.minNightMs).toBe(5 * HOUR);
    expect(wokeAt(L(10, 16, 5, 0)).hasNight).toBe(true);
    const short = wokeAt(L(10, 16, 5, 0) - 1000);
    expect(short.hasNight).toBe(false);
    expect(short.sleeps.map((x) => x.kind)).toStrictEqual(["nap"]);
  });

  it("the minimum counts time asleep, not the span: 10 pm to 5 am with 2 h paused is 5 h (JOS-90)", () => {
    const stretches = (end: number): Array<[number, number]> => [
      [L(10, 15, 22, 0), L(10, 16, 1, 0)], // 3 h
      [L(10, 16, 3, 0), end], // 2 h
    ];
    expect(S.computeDays([sleep("a", stretches(L(10, 16, 5, 0)))], NOW)[0].hasNight).toBe(true);
    expect(S.computeDays([sleep("a", stretches(L(10, 16, 5, 0) - 1000))], NOW)[0].hasNight).toBe(false);
  });

  it("a date whose longest sleep is under 5 h has no night: all naps, and the total is still right (JOS-90)", () => {
    const sat = byKey(S.computeDays(FIRST_WEEK, NOW), "2026-10-17");
    expect(sat.hasNight).toBe(false);
    expect(sat.nightMs).toBe(0);
    expect(sat.bedtime).toBeNull();
    expect(sat.wakeUp).toBeNull();
    expect(sat.nightWakes).toBe(0);
    expect(sat.longestNightStretchMs).toBe(0);
    expect(sat.napCount).toBe(3);
    expect(sat.napMs).toBe(mins(50 + 230 + 60));
    expect(sat.totalMs).toBe(mins(340)); // 5 h 40 m: nothing is lost, it is just not a night
    expect(sat.sleeps.map((x) => [x.id, x.kind])).toStrictEqual([
      ["fwA", "nap"],
      ["fwB", "nap"],
      ["fwC", "nap"],
    ]);
  });

  it("an early riser: 6:50 pm bedtime is the night, a 6:40 am nap is a nap (the old 7–7 rule got both wrong)", () => {
    const sl = [
      sleep("mN", [[L(10, 12, 19, 10), L(10, 13, 5, 30)]]), // 620
      sleep("t1", [[L(10, 13, 6, 40), L(10, 13, 7, 50)]]), // 70
      sleep("t2", [[L(10, 13, 10, 30), L(10, 13, 12, 0)]]), // 90
      sleep("t3", [[L(10, 13, 15, 0), L(10, 13, 15, 50)]]), // 50
      sleep("tN", [[L(10, 13, 18, 50), L(10, 14, 5, 45)]]), // 655
    ];
    const days = S.computeDays(sl, NOW);
    const tue = byKey(days, "2026-10-13");
    expect(tue.totalMs).toBe(mins(620 + 70 + 90 + 50)); // 13h 50m
    expect(tue.nightMs).toBe(mins(620));
    expect(tue.napCount).toBe(3);
    expect(tue.napMs).toBe(mins(210)); // 3h 30m
    expect(tue.nightWakes).toBe(0);
    const wed = byKey(days, "2026-10-14");
    expect(wed.nightMs).toBe(mins(655));
    expect(wed.bedtime).toBe(L(10, 13, 18, 50));
  });

  it("a late riser: a 9:30 pm → 9:00 am night stays whole, 11:40 nap is a nap", () => {
    const sl = [
      sleep("n", [[L(10, 12, 21, 30), L(10, 13, 9, 0)]]),
      sleep("nap", [[L(10, 13, 11, 40), L(10, 13, 13, 10)]]),
    ];
    const d = byKey(S.computeDays(sl, NOW), "2026-10-13");
    expect(d.nightMs).toBe(mins(690));
    expect(d.napMs).toBe(mins(90));
    expect(d.totalMs).toBe(mins(780)); // 13h
  });

  it("an evening nap that runs past 7 pm is still a nap on its own date", () => {
    const sl = [
      SUN_NIGHT,
      sleep("eve", [[L(10, 12, 18, 20), L(10, 12, 19, 40)]]),
      sleep("monN", [[L(10, 12, 20, 15), L(10, 13, 7, 10)]]),
    ];
    const mon = byKey(S.computeDays(sl, NOW), "2026-10-12");
    expect(mon.napCount).toBe(1);
    expect(mon.napMs).toBe(mins(80));
    expect(mon.nightMs).toBe(mins(695)); // Sun night, ended Mon 6:55
  });
});

describe("pauses, stops, wakes", () => {
  it("a pause inside the night is the same sleep: one night wake; the longer stretch is the longest", () => {
    const d = S.computeDays(
      [
        sleep("n", [
          [L(10, 16, 19, 30), L(10, 16, 23, 0)],
          [L(10, 16, 23, 25), L(10, 17, 6, 0)],
        ]),
      ],
      NOW,
    )[0];
    expect(d.nightWakes).toBe(1);
    expect(d.longestNightStretchMs).toBe(mins(6 * 60 + 35));
    expect(d.totalMs).toBe(mins(210 + 395)); // the 25 min pause is not sleep
    expect(d.napCount).toBe(0);
    expect(d.wakeUp).toBe(L(10, 17, 6, 0));
  });

  it("however long the pause (here 2 h 30 m), it is one sleep, not two", () => {
    const d = S.computeDays(
      [
        sleep("n", [
          [L(10, 16, 19, 30), L(10, 16, 22, 0)],
          [L(10, 17, 0, 30), L(10, 17, 6, 0)],
        ]),
      ],
      NOW,
    )[0];
    expect(d.napCount).toBe(0);
    expect(d.nightWakes).toBe(1);
    expect(d.totalMs).toBe(mins(150 + 330));
  });

  it("a pause under 5 minutes is not a night wake", () => {
    const d = S.computeDays(
      [
        sleep("n", [
          [L(10, 16, 19, 30), L(10, 16, 23, 0)],
          [L(10, 16, 23, 4), L(10, 17, 6, 0)],
        ]),
      ],
      NOW,
    )[0];
    expect(d.nightWakes).toBe(0);
  });

  it("stop then start is two sleeps: the longer half is the night, the shorter half a nap (the accepted weak spot)", () => {
    const sl = [
      SUN_NIGHT,
      MN1,
      MN2,
      sleep("a", [[L(10, 12, 19, 30), L(10, 13, 1, 10)]]), // 340
      sleep("b", [[L(10, 13, 2, 0), L(10, 13, 7, 15)]]), // 315
      TN1,
      TN2,
      TUE_NIGHT,
      WN1,
    ];
    const tue = byKey(S.computeDays(sl, NOW), "2026-10-13");
    expect(tue.nightMs).toBe(mins(340));
    expect(tue.bedtime).toBe(L(10, 12, 19, 30));
    expect(tue.wakeUp).toBe(L(10, 13, 1, 10));
    expect(tue.napCount).toBe(3);
    expect(tue.napMs).toBe(mins(315 + 75 + 100)); // 8h 10m
    expect(tue.totalMs).toBe(mins(340 + 315 + 75 + 100)); // 13h 50m: the total is still right
    expect(tue.nightWakes).toBe(0);
  });

  it("the same night logged with Pause is one sleep with one wake", () => {
    const sl = [
      SUN_NIGHT,
      MN1,
      MN2,
      sleep("m", [
        [L(10, 12, 19, 30), L(10, 13, 1, 10)],
        [L(10, 13, 2, 0), L(10, 13, 7, 15)],
      ]),
      TN1,
      TN2,
      TUE_NIGHT,
      WN1,
    ];
    const tue = byKey(S.computeDays(sl, NOW), "2026-10-13");
    expect(tue.nightMs).toBe(mins(340 + 315));
    expect(tue.nightWakes).toBe(1);
    expect(tue.napCount).toBe(2);
    expect(tue.totalMs).toBe(mins(655 + 175));
    expect(tue.wakeUp).toBe(L(10, 13, 7, 15));
  });
});

describe("open sleeps", () => {
  it("an open sleep is in no total and does not become night or nap until he wakes", () => {
    const sl = [SUN_NIGHT, MN1, MN2, MON_NIGHT, TN1, TN2, sleep("tueN", [[L(10, 13, 19, 45), null]], null)];
    const now = L(10, 13, 22, 20);
    const days = S.computeDays(sl, now);
    const tue = byKey(days, "2026-10-13");
    expect(tue.totalMs).toBe(mins(900)); // 15h, exactly as before he fell asleep
    expect(tue.napCount).toBe(2);
    expect(tue.partial).toBe(true);
    expect(tue.hasOpen).toBe(true);
    // the running stretch is still drawn on the 24 h pattern, from 7:45 pm to now
    expect(tue.segments[tue.segments.length - 1]).toStrictEqual({
      s: L(10, 13, 19, 45),
      e: now,
      running: true,
    });
    expect(days.find((d) => d.key === "2026-10-14")).toBeUndefined(); // nothing has ended on Wed yet
  });

  it("a long open sleep never steals the night label from a finished sleep", () => {
    const sl = [
      sleep("night", [[L(10, 12, 20, 0), L(10, 13, 6, 0)]]),
      sleep("long", [[L(10, 13, 7, 0), null]], null),
    ];
    const d = byKey(S.computeDays(sl, L(10, 13, 19, 30)), "2026-10-13"); // the open sleep has run 12 h 30 m so far, longer than the 10 h night
    expect(d.sleeps.map((x) => [x.id, x.kind])).toStrictEqual([["night", "night"]]);
    expect(d.totalMs).toBe(10 * HOUR);
    expect(d.napCount).toBe(0);
  });

  it("when he wakes, the sleep lands on the new date", () => {
    const sl = [MON_NIGHT, TN1, TN2, sleep("tueN", [[L(10, 13, 19, 45), L(10, 14, 6, 50)]])];
    const days = S.computeDays(sl, NOW);
    expect(byKey(days, "2026-10-13").totalMs).toBe(mins(900));
    expect(byKey(days, "2026-10-14").totalMs).toBe(mins(665));
  });

  it("soft-deleted sleeps and zero-length stretches are ignored", () => {
    const gone = { ...sleep("gone", [[L(10, 16, 10, 0), L(10, 16, 11, 0)]]), deletedAt: L(10, 16, 12, 0) };
    const zero = sleep("zero", [[L(10, 16, 13, 0), L(10, 16, 13, 0)]]);
    expect(S.computeDays([gone, zero], NOW).length).toBe(0);
  });

  it("deleting a sleep changes the night: the shorter sleep becomes the night", () => {
    const long = sleep("long", [[L(10, 16, 0, 0), L(10, 16, 9, 0)]]);
    const short = sleep("short", [[L(10, 16, 13, 0), L(10, 16, 19, 0)]]); // 6 h: long enough
    expect(S.computeDays([long, short], NOW)[0].nightMs).toBe(9 * HOUR);
    const d = S.computeDays([{ ...long, deletedAt: 1 }, short], NOW)[0];
    expect(d.nightMs).toBe(6 * HOUR);
    expect(d.napCount).toBe(0);
  });

  it("deleting the long sleep can leave a date with no night: the short one is a nap (JOS-90)", () => {
    const long = sleep("long", [[L(10, 16, 0, 0), L(10, 16, 9, 0)]]);
    const short = sleep("short", [[L(10, 16, 13, 0), L(10, 16, 14, 0)]]);
    const d = S.computeDays([{ ...long, deletedAt: 1 }, short], NOW)[0];
    expect(d.hasNight).toBe(false);
    expect(d.napMs).toBe(1 * HOUR);
    expect(d.napCount).toBe(1);
  });
});

describe("calendar-day segments (24 h pattern)", () => {
  it("segments are clipped to the calendar day: the night shows on two rows but counts once", () => {
    const days = S.computeDays(WEEK, NOW);
    const mon = byKey(days, "2026-10-12");
    const tue = byKey(days, "2026-10-13");
    // Mon: tail of Sun night 00:00–6:55, two naps, then 7:30 pm → midnight
    expect(mon.segments.map((g) => [g.s, g.e])).toStrictEqual([
      [L(10, 12, 0, 0), L(10, 12, 6, 55)],
      [L(10, 12, 9, 35), L(10, 12, 10, 50)],
      [L(10, 12, 13, 10), L(10, 12, 14, 45)],
      [L(10, 12, 19, 30), L(10, 13, 0, 0)],
    ]);
    expect(tue.segments[0].s).toBe(L(10, 13, 0, 0));
    expect(tue.segments[0].e).toBe(L(10, 13, 7, 35));
    // 7h 35m on Tue's row + 4h 30m on Mon's row = the whole 12h 5m night
    expect(tue.segments[0].e - tue.segments[0].s + (L(10, 13, 0, 0) - L(10, 12, 19, 30))).toBe(mins(725));
    // but only Tue's total carries it
    expect(mon.totalMs).toBe(mins(695 + 75 + 95));
  });
});

describe("wake windows", () => {
  it("wake windows: morning → nap, nap → nap, last nap → bedtime, on the date he woke into them", () => {
    const tue = byKey(S.computeDays(WEEK, NOW), "2026-10-13");
    expect(tue.wakeWindows).toStrictEqual([mins(135), mins(135), mins(285)]); // 7:35→9:50, 11:05→1:20, 3:00→7:45 pm
  });

  it("a gap over 6 h (an unlogged sleep) and a gap under 5 min are not wake windows", () => {
    const sl = [
      sleep("a", [[L(10, 16, 8, 0), L(10, 16, 9, 0)]]),
      sleep("b", [[L(10, 16, 9, 3), L(10, 16, 10, 0)]]), // 3 min after a: not a wake
      sleep("c", [[L(10, 16, 17, 0), L(10, 16, 18, 0)]]), // 7 h after b: probably unlogged
    ];
    expect(S.computeDays(sl, NOW)[0].wakeWindows).toStrictEqual([]);
  });

  it("the wake window before a sleep that is still open counts (and its date is the date he woke into it)", () => {
    const sl = [TN2, sleep("tueN", [[L(10, 13, 19, 45), null]], null)];
    expect(byKey(S.computeDays(sl, L(10, 13, 22, 0)), "2026-10-13").wakeWindows).toStrictEqual([mins(285)]);
  });
});

describe("partial days", () => {
  it("a date is partial until local midnight, then complete", () => {
    const sl = [MON_NIGHT];
    expect(byKey(S.computeDays(sl, L(10, 13, 23, 59)), "2026-10-13").partial).toBe(true);
    expect(byKey(S.computeDays(sl, L(10, 14, 0, 0)), "2026-10-13").partial).toBe(false);
  });
});

describe("summary", () => {
  it("summary: averages over complete days only, hand-worked", () => {
    const sl = [
      sleep("n1", [[L(10, 13, 20, 0), L(10, 14, 7, 0)]]), // 11 h, wake Wed 14
      sleep("p1", [[L(10, 14, 10, 0), L(10, 14, 11, 0)]]), // 1 h
      sleep("n2", [[L(10, 14, 21, 0), L(10, 15, 6, 0)]]), // 9 h, wake Thu 15
      sleep("p2", [[L(10, 15, 9, 0), L(10, 15, 10, 30)]]), // 1.5 h
      sleep("p3", [[L(10, 15, 14, 0), L(10, 15, 14, 30)]]), // 0.5 h
      sleep("n3", [[L(10, 15, 19, 0), L(10, 16, 8, 0)]]), // 13 h, wake Fri 16
    ];
    const sum = S.summarise(S.computeDays(sl, NOW));
    expect(sum.days).toBe(3);
    expect(sum.avgTotalMs).toBe(12 * HOUR); // (12 + 11 + 13) / 3
    expect(sum.avgNightMs).toBe(11 * HOUR); // (11 + 9 + 13) / 3
    expect(sum.avgNapTimeMs).toBe(1 * HOUR); // (1 + 2 + 0) / 3
    expect(sum.avgNaps).toBe(1); // (1 + 2 + 0) / 3
    expect(sum.avgNapMs).toBe(1 * HOUR); // 3 h of naps over 3 naps
    expect(sum.bestStretchMs).toBe(13 * HOUR);
    expect(sum.avgNightWakes).toBe(0);
    expect(sum.avgBedtimeMin).toBe(20 * 60); // 8:00 pm
    expect(sum.avgWakeUpMin).toBe(7 * 60); // 7:00 am
    // wake windows: Thu 7:00→10:00 is 3 h on Wed; Wed's 11:00 nap end → Wed 9 pm night is 10 h (skipped);
    // Thu: 6:00→9:00 (3 h), 10:30→14:00 (3.5 h), 14:30→7 pm (4.5 h). Fri: nothing follows.
    expect(sum.avgWakeWindowMs).toBe(3.5 * HOUR); // (3 + 3 + 3.5 + 4.5) / 4
  });

  it("summary: a day with no night is charted and listed but left out of every average (JOS-90, Joseph's first week)", () => {
    const days = S.computeDays(FIRST_WEEK, NOW);
    expect(days.map((d) => [d.key, d.hasNight, d.partial])).toStrictEqual([
      ["2026-10-17", false, false], // Sat: the first day of logging, daytime sleeps only
      ["2026-10-18", true, false], // Sun: the night from Sat 9 pm
      ["2026-10-19", true, false], // Mon: the night from Sun 7:30 pm
      ["2026-10-20", true, true], // Tue: today, still going
    ]);
    const sum = S.summarise(days);
    expect(sum.days).toBe(2); // Sun 18 and Mon 19
    expect(sum.nights).toBe(2);
    expect(sum.avgTotalMs).toBe(mins(715)); // (685 + 745) / 2: Sat's 5 h 40 m is not in it
    expect(sum.avgNightMs).toBe(mins(635)); // (655 + 615) / 2
    expect(sum.avgNapTimeMs).toBe(mins(80)); // (30 + 130) / 2
    expect(sum.avgNaps).toBe(1);
    expect(sum.avgNapMs).toBe(mins(80)); // 160 min of naps over 2 naps: Sat's three are not in it
    expect(sum.bestStretchMs).toBe(mins(345));
    expect(sum.avgLongestStretchMs).toBe(mins(300)); // (345 + 255) / 2
    expect(sum.avgNightWakes).toBe(2); // (1 + 3) / 2
    expect(sum.avgBedtimeMin).toBe(20 * 60 + 15); // (9:00 pm + 7:30 pm) / 2, not 1:13 am
    expect(sum.avgWakeUpMin).toBe(8 * 60 + 20); // (8:30 am + 8:10 am) / 2, not 10:33 am
    // wake windows: Sun 8:30 am to 12:40 pm is 4 h 10 m, Mon 4:30 pm to 7:20 pm is 2 h 50 m; the 6 h 20 m and
    // 6 h 10 m gaps are over the 6 h limit, and Sat's three windows are on the day that is left out
    expect(sum.avgWakeWindowMs).toBe(mins(210));
  });

  it("summary: with no day that has a night there is nothing to average (JOS-90)", () => {
    const days = S.computeDays([FW_A, FW_B, FW_C], NOW);
    expect(byKey(days, "2026-10-17").totalMs).toBe(mins(340));
    const sum = S.summarise(days);
    expect(sum.days).toBe(0);
    expect(sum.avgTotalMs).toBeNull();
    expect(sum.avgNaps).toBeNull();
    expect(sum.avgBedtimeMin).toBeNull();
    expect(sum.avgWakeUpMin).toBeNull();
  });

  it("summary: today is charted but never averaged", () => {
    const sl = [
      sleep("n1", [[L(10, 13, 20, 0), L(10, 14, 7, 0)]]), // 11 h on Wed
      sleep("n2", [[L(10, 14, 21, 0), L(10, 15, 6, 0)]]), // 9 h on Thu (today)
    ];
    const days = S.computeDays(sl, L(10, 15, 12, 0));
    expect(byKey(days, "2026-10-15").partial).toBe(true);
    const sum = S.summarise(days);
    expect(sum.days).toBe(1);
    expect(sum.avgTotalMs).toBe(11 * HOUR);
  });

  it("average bedtime across midnight is near midnight, not noon", () => {
    const sl = [
      sleep("a", [[L(10, 13, 23, 30), L(10, 14, 7, 30)]]),
      sleep("b", [[L(10, 15, 0, 30), L(10, 15, 8, 0)]]),
    ];
    expect(S.fmtClockMin(S.summarise(S.computeDays(sl, NOW)).avgBedtimeMin)).toBe("12:00 am");
  });

  it("empty input", () => {
    expect(S.computeDays([], NOW)).toStrictEqual([]);
    const sum = S.summarise([]);
    expect(sum.days).toBe(0);
    expect(sum.avgTotalMs).toBeNull();
    expect(sum.avgBedtimeMin).toBeNull();
    expect(sum.bestStretchMs).toBeNull();
    const t = S.today([], NOW);
    expect(t.status).toBe("none");
    expect(t.primaryMs).toBe(0);
    expect(t.entries).toStrictEqual([]);
    expect(S.glance([], NOW).state).toBe("none");
  });
});

describe("clock changes", () => {
  it("clocks going back (night of Sat 24 → Sun 25 Oct 2026): 7:30 pm → 6:30 am is 12 h, counted on Sun 25", () => {
    const d = S.computeDays([sleep("n", [[L(10, 24, 19, 30), L(10, 25, 6, 30)]])], L(10, 30, 12, 0))[0];
    expect(d.key).toBe("2026-10-25");
    expect(d.totalMs).toBe(12 * HOUR);
    expect(d.segments[0].e - d.segments[0].s).toBe(7.5 * HOUR); // Sun's row: 00:00 BST → 06:30 GMT
  });

  it("clocks going forward (night of Sat 27 → Sun 28 Mar 2027): the same night is 10 h", () => {
    const d = S.computeDays(
      [sleep("n", [[L(3, 27, 19, 30, 2027), L(3, 28, 6, 30, 2027)]])],
      L(4, 2, 12, 0, 2027),
    )[0];
    expect(d.key).toBe("2027-03-28");
    expect(d.totalMs).toBe(10 * HOUR);
  });

  it("property: totals and segments always add up to the stretches, across both clock changes", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const wake = (ms: number) => new Date(ms).toLocaleDateString("en-CA"); // an independent way to get the local date
    const length = (s: ReportSleep) => s.stretches.reduce((b, x) => b + ((x.end as number) - x.start), 0);
    const lastEnd = (s: ReportSleep) => s.stretches[s.stretches.length - 1].end as number;
    for (const start of [L(10, 18), L(3, 20, 0, 0, 2027)]) {
      const sl: ReportSleep[] = [];
      let t = start;
      for (let i = 0; i < 40; i++) {
        t += Math.round(rnd() * 5 * HOUR) + 10 * MIN;
        const st: Array<[number, number]> = [];
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const len = Math.round((0.2 + rnd() * 5) * HOUR);
          st.push([t, t + len]);
          t += len + Math.round((0.1 + rnd()) * HOUR);
        }
        sl.push(sleep("s" + i, st));
      }
      const now = t + 6 * HOUR;
      const days = S.computeDays(sl, now);
      const asleep = sl.reduce((a, s) => a + length(s), 0);
      const counted = days.reduce((a, d) => a + d.totalMs, 0);
      const first = days[0].key;
      const dropped = sl.filter((s) => wake(lastEnd(s)) < first).reduce((a, s) => a + length(s), 0);
      expect(counted + dropped).toBe(asleep);
      // every sleep sits on the date he woke; a date has one night exactly when its longest sleep is long
      // enough to be one, and that sleep is the night
      sl.forEach((s) => {
        const d = days.find((x) => x.key === wake(lastEnd(s)));
        if (d) expect(d.sleeps.some((x) => x.id === s.id)).toBe(true);
      });
      days.forEach((d) => {
        const longest = Math.max(0, ...d.sleeps.map((x) => x.ms));
        const nights = d.sleeps.filter((x) => x.kind === "night");
        expect(nights.length).toBe(longest >= S.CFG.minNightMs ? 1 : 0);
        expect(d.hasNight).toBe(nights.length === 1);
        if (nights.length) expect(nights[0].ms).toBe(longest);
        expect(d.nightMs + d.napMs).toBe(d.totalMs);
      });
      // segments cover every minute asleep exactly once (minus the start of the first night, on the dropped first date)
      const covered = days.reduce((a, d) => a + d.segments.reduce((b, g) => b + (g.e - g.s), 0), 0);
      const firstMidnight = new Date(first + "T00:00:00").getTime();
      const before = sl.reduce(
        (a, s) =>
          a + s.stretches.reduce((b, x) => b + Math.max(0, Math.min(x.end as number, firstMidnight) - x.start), 0),
        0,
      );
      expect(covered + before).toBe(asleep);
      // calendar-day pieces never cross local midnight
      days.forEach((d) => d.segments.forEach((g) => expect(wake(g.s)).toBe(d.key)));
    }
  });
});

describe("Today card", () => {
  it("today, during a nap: naps so far, the listed sleeps, and the sleep under way", () => {
    const now = L(10, 13, 14, 0);
    const sl = [SUN_NIGHT, MN1, MN2, MON_NIGHT, TN1, sleep("tn2", [[L(10, 13, 13, 20), null]], null)];
    const t = S.today(sl, now);
    expect(t.key).toBe("2026-10-13");
    expect(t.status).toBe("asleep");
    expect(t.sleepStart).toBe(L(10, 13, 13, 20));
    expect(t.primaryMs).toBe(mins(75)); // the nap that has ended; the one under way is in no total
    expect(t.napCount).toBe(1);
    expect(t.sleepingNow).toStrictEqual({ start: L(10, 13, 13, 20), ms: mins(40), running: true, paused: false });
    expect(t.entries.map((e) => [e.kind, e.ms])).toStrictEqual([
      ["night", mins(725)],
      ["nap", mins(75)],
      ["now", mins(40)],
    ]);
    expect(t.woke).toBe(true);
  });

  it("today, awake after the second nap: 2h 55m of naps, awake for 1 h", () => {
    const t = S.today([SUN_NIGHT, MN1, MN2, MON_NIGHT, TN1, TN2], L(10, 13, 16, 0));
    expect(t.status).toBe("awake");
    expect(t.statusSince).toBe(L(10, 13, 15, 0));
    expect(t.primaryMs).toBe(mins(175));
    expect(t.napCount).toBe(2);
    expect(t.sleepingNow).toBeNull();
    expect(t.awakeStale).toBe(false);
  });

  it("today, evening with the night sleep running: naps are final, the night is 'sleeping now' (45 m so far)", () => {
    const sl = [MON_NIGHT, TN1, TN2, sleep("tueN", [[L(10, 13, 19, 45), null]], null)];
    const t = S.today(sl, L(10, 13, 20, 30));
    expect(t.status).toBe("asleep");
    expect(t.primaryMs).toBe(mins(175));
    expect(t.sleepingNow?.ms).toBe(mins(45));
    expect(t.entries[t.entries.length - 1].kind).toBe("now");
    expect(t.totalMs).toBe(mins(900)); // still 15 h: the running sleep is in no total
  });

  it("today, paused: the pause is not sleep, the sleep stays open", () => {
    const sl = [MON_NIGHT, TN1, TN2, sleep("tueN", [[L(10, 13, 19, 45), L(10, 13, 20, 10)]], null)];
    const t = S.today(sl, L(10, 13, 20, 30));
    expect(t.status).toBe("paused");
    expect(t.statusSince).toBe(L(10, 13, 20, 10));
    expect(t.pausedNow).toBe(true);
    expect(t.sleepingNow?.ms).toBe(mins(25));
    expect(t.sleepingNow?.paused).toBe(true);
  });

  it("today, night still running at 6 am: nothing has ended today, so there are no naps and nothing listed yet", () => {
    const sl = [SUN_NIGHT, MN1, MN2, sleep("monN", [[L(10, 12, 19, 30), null]], null)];
    const t = S.today(sl, L(10, 13, 6, 0));
    expect(t.woke).toBe(false);
    expect(t.primaryMs).toBe(0);
    expect(t.sleepingNow?.ms).toBe(mins(630)); // 10 h 30 m so far
    expect(t.status).toBe("asleep");
  });

  it("a night that runs past midnight: the new date is empty until he wakes (known edge)", () => {
    const sl = [TN2, sleep("tueN", [[L(10, 13, 19, 45), null]], null)];
    const t = S.today(sl, L(10, 14, 0, 30));
    expect(t.key).toBe("2026-10-14");
    expect(t.woke).toBe(false);
    expect(t.sleepingNow?.ms).toBe(mins(285)); // 4 h 45 m
  });

  it("status: awake for 12 h or more is flagged as probably unlogged; nothing logged yet", () => {
    expect(S.today([TN1], L(10, 14, 0, 0)).awakeStale).toBe(true); // woke 11:05 am, 12 h 55 m ago
    expect(S.today([TN1], L(10, 13, 20, 0)).awakeStale).toBe(false);
    expect(S.today([], NOW).status).toBe("none");
  });

  it("the headline (naps) and the listed sleeps always agree with the chart's total for the day", () => {
    const sl = [...WEEK, sleep("tn3", [[L(10, 14, 12, 0), L(10, 14, 12, 40)]])];
    for (const now of [L(10, 13, 8, 0), L(10, 13, 12, 0), L(10, 13, 16, 0), L(10, 14, 11, 0), L(10, 14, 13, 0)]) {
      const finished = sl.filter((s) => (s.stretches[s.stretches.length - 1].end as number) <= now);
      const t = S.today(finished, now);
      const d = byKey(S.computeDays(finished, now), t.key);
      expect(t.totalMs).toBe(d.totalMs);
      expect(t.primaryMs).toBe(d.napMs);
      expect(t.entries.filter((e) => e.kind !== "now").reduce((a, e) => a + e.ms, 0)).toBe(d.totalMs);
    }
  });
});

describe("Log tile (glance)", () => {
  it("glance: nothing logged", () => {
    expect(S.glance([], NOW)).toStrictEqual({
      open: false,
      state: "none",
      openMs: null,
      openStart: null,
      last: null,
    });
  });

  it("glance: idle shows the last finished sleep, counted from when he woke; pauses are not sleep", () => {
    const nap = sleep("n", [
      [L(10, 16, 13, 0), L(10, 16, 13, 40)],
      [L(10, 16, 13, 50), L(10, 16, 14, 30)],
    ]);
    const g = S.glance([nap], L(10, 16, 17, 30));
    expect(g.state).toBe("idle");
    expect(g.last?.ms).toBe(mins(80)); // 40 + 40, the 10 min pause excluded
    expect(g.last?.end).toBe(L(10, 16, 14, 30));
    expect(ago(L(10, 16, 17, 30), (g.last as { end: number }).end)).toBe("3h ago");
  });

  it("glance: the latest finished sleep wins by wake time, in any order; deleted ones are ignored", () => {
    const a = sleep("a", [[L(10, 16, 8, 0), L(10, 16, 9, 0)]]);
    const b = sleep("b", [[L(10, 16, 12, 0), L(10, 16, 13, 0)]]);
    const c = { ...sleep("c", [[L(10, 16, 15, 0), L(10, 16, 16, 0)]]), deletedAt: 1 };
    expect(S.glance([b, c, a], L(10, 16, 18, 0)).last?.id).toBe("b");
  });

  it("glance: THE TILE PRINCIPLE: while a sleep runs, the tile still shows the last completed sleep; the sleep under way is reported beside it", () => {
    const prev = sleep("prev", [[L(10, 16, 13, 0), L(10, 16, 14, 0)]]);
    const run = sleep(
      "run",
      [
        [L(10, 16, 16, 30), L(10, 16, 17, 0)],
        [L(10, 16, 17, 20), null],
      ],
      null,
    );
    const g = S.glance([prev, run], L(10, 16, 17, 50));
    expect(g.open).toBe(true);
    expect(g.state).toBe("sleeping");
    expect(g.openMs).toBe(mins(30 + 30)); // the whole sleep so far, not the current stretch; the 20 min pause excluded
    expect(g.last?.id).toBe("prev"); // not replaced
    expect(ago(L(10, 16, 17, 50), (g.last as { end: number }).end)).toBe("3h 50m ago");
  });

  it("a sleep started this very moment is open at 0m (not missing); a finished zero-length stretch is still ignored", () => {
    const now = L(10, 16, 15, 0);
    const justStarted = sleep("j", [[now, null]], null);
    const g = S.glance([justStarted], now);
    expect(g.open).toBe(true);
    expect(g.state).toBe("sleeping");
    expect(g.openMs).toBe(0);
    expect(S.today([justStarted], now).sleepingNow?.ms).toBe(0);
    expect(S.glance([sleep("z", [[now, now]])], now).state).toBe("none");
  });

  it("glance: a paused sleep is still open, reported as paused, and the tile still shows the last completed one", () => {
    const prev = sleep("prev", [[L(10, 16, 13, 0), L(10, 16, 14, 0)]]);
    const paused = sleep("p", [[L(10, 16, 16, 30), L(10, 16, 17, 0)]], null);
    const g = S.glance([prev, paused], L(10, 16, 17, 30));
    expect(g.state).toBe("paused");
    expect(g.openMs).toBe(mins(30));
    expect(g.last?.id).toBe("prev");
  });

  it("glance: the moment the sleep is stopped the tile updates to it, with 'ago' counted from the stop", () => {
    const prev = sleep("prev", [[L(10, 16, 13, 0), L(10, 16, 14, 0)]]);
    const done = sleep("run", [[L(10, 16, 16, 30), L(10, 16, 17, 40)]]);
    const g = S.glance([prev, done], L(10, 16, 17, 40));
    expect(g.open).toBe(false);
    expect(g.last?.id).toBe("run");
    expect(g.last?.ms).toBe(mins(70));
    expect(ago(0, 0)).toBe("just now");
  });

  it("glance: deleting the newer sleep puts the previous one back on the tile", () => {
    const prev = sleep("prev", [[L(10, 16, 13, 0), L(10, 16, 14, 0)]]);
    const newer = sleep("newer", [[L(10, 16, 15, 0), L(10, 16, 15, 4)]]);
    expect(S.glance([prev, newer], L(10, 16, 15, 10)).last?.id).toBe("newer");
    expect(S.glance([prev, { ...newer, deletedAt: 1 }], L(10, 16, 15, 10)).last?.id).toBe("prev");
  });
});

describe("formatters", () => {
  it("formatters: 12-hour lowercase times; durations and 'ago' read like the app", () => {
    expect(S.fmtClockMin(0)).toBe("12:00 am");
    expect(S.fmtClockMin(12 * 60)).toBe("12:00 pm");
    expect(S.fmtClockMin(23 * 60 + 59)).toBe("11:59 pm");
    expect(S.fmtTime(L(10, 16, 19, 5))).toBe("7:05 pm");
    // The reference has its own fmtDur / fmtAgo. The app already has the same
    // words in formatMinutes and formatTimeAgo, so those are what the screens
    // use, and this pins that they say what the reference's tests expect.
    const dur = (ms: number | null) => (ms == null ? "—" : formatMinutes(ms / MIN));
    expect(dur(0)).toBe("0m");
    expect(dur(mins(45))).toBe("45m");
    expect(dur(mins(120))).toBe("2h");
    expect(dur(mins(125))).toBe("2h 5m");
    expect(dur(mins(150))).toBe("2h 30m");
    expect(dur(null)).toBe("—");
    expect(ago(mins(0.4), 0)).toBe("just now");
    expect(ago(mins(45), 0)).toBe("45m ago");
    expect(ago(mins(120), 0)).toBe("2h ago");
    expect(ago(mins(185), 0)).toBe("3h 5m ago");
  });
});

/* ---------- beyond the reference: how the app's sleeps reach the engine ---------- */

const appSleep = (
  id: string,
  stretches: Array<[number, number | null]>,
  closedAt: number | null = stretches[stretches.length - 1][1],
): Sleep => ({
  id,
  by: "joseph",
  stretches: stretches.map(([start, end]) => ({ start, end })),
  closedAt,
  rev: 1,
  last: { by: "joseph", action: "start", at: stretches[0][0] },
  notes: null,
});

describe("the app's sleeps feed the engine", () => {
  it("a sleep left paused for more than 3 h has closed itself at its last wake, so it counts on that date", () => {
    // Paused at 8:10 pm and never resumed. The database only writes closed_at
    // when the next sleep starts, so the app derives it (closedAtOf): paused for
    // 1 h 50 m the sleep is still open, paused for 3 h 20 m it has closed
    // itself at its last wake and the engine must see it finished at 8:10 pm.
    const s = appSleep("p", [[L(10, 13, 19, 45), L(10, 13, 20, 10)]], null);
    const stillPaused = L(10, 13, 22, 0); // 1 h 50 m paused
    const closed = L(10, 13, 23, 30); // 3 h 20 m paused
    expect(S.toReportSleeps([s], stillPaused)[0].closedAt).toBeNull();
    expect(S.toReportSleeps([s], closed)[0].closedAt).toBe(L(10, 13, 20, 10));

    expect(S.glance(S.toReportSleeps([s], stillPaused), stillPaused).state).toBe("paused");
    const g = S.glance(S.toReportSleeps([s], closed), closed);
    expect(g.state).toBe("idle");
    expect(g.last?.ms).toBe(mins(25));
    const d = byKey(S.computeDays(S.toReportSleeps([s], closed), closed), "2026-10-13");
    expect(d.totalMs).toBe(mins(25));
  });

  it("keeps the stretches, ids and the open sleep as they are", () => {
    const open = appSleep("o", [[L(10, 13, 19, 45), null]], null);
    const [r] = S.toReportSleeps([open], L(10, 13, 20, 0));
    expect(r).toStrictEqual({
      id: "o",
      stretches: [{ start: L(10, 13, 19, 45), end: null }],
      closedAt: null,
      deletedAt: null,
    });
  });

  // The reference tests sit well clear of every threshold. These sit on them, to
  // the millisecond, because "5 min or more", "5 min to 6 h" and "12 h or more"
  // are the words in the spec.
  it("a pause of exactly 5 minutes is a night wake; a millisecond less is not", () => {
    const night = (pauseMs: number) => {
      const a = L(10, 16, 23, 0);
      return S.computeDays(
        [
          sleep("n", [
            [L(10, 16, 19, 30), a],
            [a + pauseMs, L(10, 17, 6, 0)],
          ]),
        ],
        NOW,
      )[0];
    };
    expect(night(5 * MIN).nightWakes).toBe(1);
    expect(night(5 * MIN - 1).nightWakes).toBe(0);
  });

  it("a gap between sleeps counts as time awake from exactly 5 minutes to exactly 6 hours", () => {
    const windows = (gapMs: number) => {
      const end = L(10, 16, 9, 0);
      return S.computeDays(
        [sleep("a", [[L(10, 16, 8, 0), end]]), sleep("b", [[end + gapMs, end + gapMs + HOUR]])],
        NOW,
      )[0].wakeWindows;
    };
    expect(windows(5 * MIN)).toStrictEqual([5 * MIN]);
    expect(windows(5 * MIN - 1)).toStrictEqual([]);
    expect(windows(6 * HOUR)).toStrictEqual([6 * HOUR]);
    expect(windows(6 * HOUR + 1)).toStrictEqual([]);
  });

  it("awake for exactly 12 hours is flagged as probably unlogged; a millisecond less is not", () => {
    const woke = L(10, 13, 11, 5); // TN1 wakes at 11:05 am on the 13th
    expect(S.today([TN1], woke + 12 * HOUR).awakeStale).toBe(true);
    expect(S.today([TN1], woke + 12 * HOUR - 1).awakeStale).toBe(false);
  });

  it("the config block is the spec's: 5 min and 6 h", () => {
    expect(S.CFG.minWakeMs).toBe(5 * MIN);
    expect(S.CFG.maxWakeWindowMs).toBe(6 * HOUR);
  });
});

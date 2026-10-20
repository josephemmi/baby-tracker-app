// The wording and geometry of the Sleep tab and the Last sleep tile, pinned to
// the strings in the spec (JOS-83). London time, like the engine's tests: the
// days are local days, and two tests cross a clock change.
process.env.TZ = "Europe/London";

import { describe, expect, it } from "vitest";
import { HOUR, MIN, type Sleep } from "@/lib/sleep";
import * as S from "@/lib/sleep-reports";
import type { ReportSleep } from "@/lib/sleep-reports";
import * as V from "@/lib/sleep-report-view";

const L = (mo: number, d: number, h = 0, mi = 0, y = 2026): number =>
  new Date(y, mo - 1, d, h, mi, 0, 0).getTime();

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

const mins = (m: number): number => m * MIN;
const days = (sleeps: ReportSleep[], now: number): S.Day[] => S.computeDays(sleeps, now);

// Sun 11 to Fri 16 Oct, one night and a nap or two a day (the hand-worked week
// from the engine tests, extended), with Sat 17 as today.
const WEEK: ReportSleep[] = [
  sleep("n11", [[L(10, 10, 19, 20), L(10, 11, 6, 55)]]), // Sun 11: 11h 35m
  sleep("p11", [[L(10, 11, 9, 35), L(10, 11, 10, 50)]]), // 1h 15m
  sleep("n12", [[L(10, 11, 19, 30), L(10, 12, 7, 35)]]), // Mon 12: 12h 5m
  sleep("p12", [[L(10, 12, 13, 20), L(10, 12, 15, 0)]]), // 1h 40m
  sleep("n13", [[L(10, 12, 19, 45), L(10, 13, 6, 50)]]), // Tue 13: 11h 5m
  sleep("n14", [[L(10, 13, 19, 45), L(10, 14, 6, 50)]]), // Wed 14: 11h 5m
  sleep("n15", [[L(10, 14, 19, 45), L(10, 15, 6, 50)]]), // Thu 15
  sleep("n16", [[L(10, 15, 19, 45), L(10, 16, 6, 50)]]), // Fri 16
];
const SAT = L(10, 17, 10, 0);

describe("small words", () => {
  it("writes durations like the rest of the app, and a dash for nothing", () => {
    expect(V.dur(0)).toBe("0m");
    expect(V.dur(mins(45))).toBe("45m");
    expect(V.dur(mins(120))).toBe("2h");
    expect(V.dur(mins(150))).toBe("2h 30m");
    expect(V.dur(null)).toBe("—");
  });

  it("writes averages of counts to one decimal without a trailing .0", () => {
    expect(V.num1(3)).toBe("3");
    expect(V.num1(3.44)).toBe("3.4");
    expect(V.num1(3.45)).toBe("3.5");
    expect(V.num1(0)).toBe("0");
    expect(V.num1(null)).toBe("—");
  });

  it("labels a day the way the spec does", () => {
    expect(V.labelLong("2026-10-16")).toBe("Fri 16 Oct");
    expect(V.labelShort("2026-10-16")).toBe("Fri 16");
    expect(V.labelLong("2027-03-28")).toBe("Sun 28 Mar");
  });

  it("writes a range with one am/pm when both ends share it", () => {
    expect(V.fmtRange(L(10, 16, 9, 35), L(10, 16, 10, 50))).toBe("9:35 – 10:50 am");
    expect(V.fmtRange(L(10, 15, 19, 25), L(10, 16, 6, 51))).toBe("7:25 pm – 6:51 am");
    expect(V.fmtRange(L(10, 16, 19, 50), null)).toBe("7:50 pm → now");
  });
});

describe("ranges", () => {
  const list = (keys: string[]): S.Day[] =>
    keys.map((key) => ({ ...S.computeDays([], 0), key }) as unknown as S.Day);
  const all = list([
    "2025-12-31",
    "2026-01-02",
    "2026-09-17", // 30 days back: one day too early for Last 30 days
    "2026-09-18", // 29 days back: the first day of Last 30 days
    "2026-09-30",
    "2026-10-01",
    "2026-10-10",
    "2026-10-11",
    "2026-10-17",
  ]);
  const keys = (r: Parameters<typeof V.filterDaysByRange>[1]) =>
    V.filterDaysByRange(all, r, "2026-10-17").map((d) => d.key);

  it("Last 7 days is today and the six before it: whole calendar days", () => {
    expect(keys({ kind: "7d" })).toEqual(["2026-10-11", "2026-10-17"]);
    expect(keys({ kind: "7d" })).not.toContain("2026-10-10");
  });

  it("Last 30 days is today and the 29 before it", () => {
    expect(keys({ kind: "30d" })).toEqual(["2026-09-18", "2026-09-30", "2026-10-01", "2026-10-10", "2026-10-11", "2026-10-17"]);
    expect(keys({ kind: "30d" })).not.toContain("2026-09-17");
  });

  it("Monthly, Yearly and All time", () => {
    expect(keys({ kind: "month", month: "2026-10" })).toEqual(["2026-10-01", "2026-10-10", "2026-10-11", "2026-10-17"]);
    expect(keys({ kind: "year", year: 2026 })).toHaveLength(8);
    expect(keys({ kind: "year", year: 2025 })).toEqual(["2025-12-31"]);
    expect(keys({ kind: "all" })).toHaveLength(9);
  });

  it("reads one day before the first day of the range, so a night that ends on it is whole", () => {
    // 7d: first day Sat 11, so from Fri 10 at midnight
    expect(V.fetchFromMs("7d", "2026-10-17")).toBe(L(10, 10, 0, 0));
    // 30d: first day Sun 20 Sep (29 back), so from Sat 19 Sep
    expect(V.fetchFromMs("30d", "2026-10-17")).toBe(L(9, 17, 0, 0));
    // the others read everything: the pickers offer any month or year with sleeps in it
    expect(V.fetchFromMs("month", "2026-10-17")).toBeNull();
    expect(V.fetchFromMs("year", "2026-10-17")).toBeNull();
    expect(V.fetchFromMs("all", "2026-10-17")).toBeNull();
  });

  it("lists the years that have a day in them, newest first", () => {
    expect(V.sleepYears(all)).toEqual([2026, 2025]);
    expect(V.sleepYears([])).toEqual([]);
  });

  it("opens a chart pinned on the newest complete day, or on today when that is all there is", () => {
    const d = days(WEEK, SAT);
    expect(d[d.length - 1].partial).toBe(false); // Fri 16 is complete; Sat has no sleep yet
    expect(V.defaultDayKey(d)).toBe("2026-10-16");
    const onlyToday = days([sleep("n", [[L(10, 16, 23, 0), L(10, 17, 6, 0)]])], L(10, 17, 8, 0));
    expect(onlyToday.map((x) => x.key)).toEqual(["2026-10-17"]);
    expect(V.defaultDayKey(onlyToday)).toBe("2026-10-17");
    expect(V.defaultDayKey([])).toBeNull();
    // with sleep logged today (partial) the pin is yesterday, the newest COMPLETE day
    const withToday = days([...WEEK, sleep("nap", [[L(10, 17, 9, 0), L(10, 17, 9, 40)]])], L(10, 17, 10, 0));
    expect(withToday[withToday.length - 1]).toMatchObject({ key: "2026-10-17", partial: true });
    expect(V.defaultDayKey(withToday)).toBe("2026-10-16");
  });
});

describe("averages", () => {
  const d = days(WEEK, SAT);
  const sum = S.summarise(d);

  it("names the complete days they cover, and says today is left out", () => {
    // Mon 12 to Fri 16 are the days with a night and the Sunday 11th has one too.
    expect(V.periodText(d)).toBe("Sun 11 – Fri 16 Oct");
    expect(V.averagesNote(d, sum)).toBe(
      "Sun 11 – Fri 16 Oct · 6 complete days. Today so far is not included.",
    );
  });

  it("names the month too when the days span two", () => {
    const two = days(
      [
        sleep("a", [[L(9, 29, 19, 0), L(9, 30, 6, 0)]]),
        sleep("b", [[L(9, 30, 19, 0), L(10, 1, 6, 0)]]),
      ],
      L(10, 5, 12, 0),
    );
    expect(V.periodText(two)).toBe("Wed 30 Sep – Thu 1 Oct");
  });

  it("says 'day' for one complete day", () => {
    const one = days([sleep("a", [[L(10, 15, 19, 0), L(10, 16, 6, 0)]])], SAT);
    expect(V.periodText(one)).toBe("Fri 16 Oct");
    expect(V.averagesNote(one, S.summarise(one))).toBe(
      "Fri 16 Oct · 1 complete day. Today so far is not included.",
    );
  });

  it("explains when there is no complete day yet", () => {
    const todayOnly = days([sleep("a", [[L(10, 16, 23, 0), L(10, 17, 6, 0)]])], L(10, 17, 8, 0));
    expect(V.averagesNote(todayOnly, S.summarise(todayOnly))).toBe(
      "No complete days in this range yet. Today so far is charted but not included.",
    );
    expect(V.averagesNote([], S.summarise([]))).toBe(
      "No complete days in this range yet. Today so far is charted but not included.",
    );
  });

  describe("days with no night (JOS-90)", () => {
    // Mon 12 has only daytime sleeps (the first day of logging); Tue 13 and Wed 14 have a night.
    const mixed = days(
      [
        sleep("m1", [[L(10, 12, 10, 0), L(10, 12, 12, 0)]]),
        sleep("m2", [[L(10, 12, 14, 0), L(10, 12, 15, 0)]]),
        sleep("n13", [[L(10, 12, 19, 30), L(10, 13, 6, 30)]]),
        sleep("n14", [[L(10, 13, 19, 30), L(10, 14, 6, 30)]]),
      ],
      L(10, 15, 12, 0),
    );

    it("counts only the days that have a night, and names the ones left out", () => {
      const m = S.summarise(mixed);
      expect(m.days).toBe(2);
      expect(V.periodText(mixed)).toBe("Tue 13 – Wed 14 Oct");
      expect(V.averagesNote(mixed, m)).toBe(
        "Tue 13 – Wed 14 Oct · 2 complete days. Not included: today so far, and Mon 12 (no night sleep logged).",
      );
    });

    it("lists two or three days, and counts past three", () => {
      const day = (d: number) => sleep("s" + d, [[L(10, d, 10, 0), L(10, d, 11, 0)]]);
      const night = sleep("n", [[L(10, 20, 19, 0), L(10, 21, 6, 0)]]);
      const note = (nap: number[]) => V.averagesNote(days([...nap.map(day), night], L(10, 25, 12, 0)), S.summarise(days([...nap.map(day), night], L(10, 25, 12, 0))));
      expect(note([12, 13])).toContain("Mon 12 and Tue 13 (no night sleep logged)");
      expect(note([12, 13, 14])).toContain("Mon 12, Tue 13 and Wed 14 (no night sleep logged)");
      expect(note([12, 13, 14, 15])).toContain("4 days (no night sleep logged)");
    });

    it("explains when every complete day lacks a night", () => {
      const onlyNaps = days([sleep("m1", [[L(10, 12, 10, 0), L(10, 12, 12, 0)]])], L(10, 14, 12, 0));
      expect(V.averagesNote(onlyNaps, S.summarise(onlyNaps))).toBe(
        "No complete days with a night in this range yet. Today so far, and Mon 12 (no night sleep logged), are charted but not included.",
      );
    });

    it("keeps the old wording when no complete day has any sleep to leave out", () => {
      const justToday = days([sleep("a", [[L(10, 16, 23, 0), L(10, 17, 6, 0)]])], L(10, 17, 8, 0));
      expect(V.averagesNote(justToday, S.summarise(justToday))).toBe(
        "No complete days in this range yet. Today so far is charted but not included.",
      );
    });

    it("says what a night is under the cards", () => {
      expect(V.nightNote()).toBe("A night is a sleep of 5 hours or more. It counts on the day he woke.");
    });

    it("says under the title that only logged sleeps are counted and a night not added leaves the day out", () => {
      expect(V.loggedNote()).toBe(
        "Only sleeps that were logged are counted. If a night wasn't added, that day is left out of the averages.",
      );
      // the line after it still says which days that was this time
      expect(V.averagesNote(mixed, S.summarise(mixed))).toContain("Mon 12 (no night sleep logged)");
    });

    it("shows Joseph's first week as it should read: Sat has no night, the averages are Sun and Mon only", () => {
      // the same rounded week as the engine tests: Sat 17 daytime sleeps only, then two nights
      const week = [
        sleep("a", [[L(10, 17, 10, 15), L(10, 17, 11, 5)]]),
        sleep("b", [[L(10, 17, 11, 10), L(10, 17, 15, 0)]]),
        sleep("c", [[L(10, 17, 18, 40), L(10, 17, 19, 40)]]),
        sleep("n1", [
          [L(10, 17, 21, 0), L(10, 18, 2, 10)],
          [L(10, 18, 2, 45), L(10, 18, 8, 30)],
        ]),
        sleep("nap1", [[L(10, 18, 12, 40), L(10, 18, 13, 10)]]),
        sleep("n2", [[L(10, 18, 19, 30), L(10, 19, 8, 10)]]),
        sleep("nap2", [[L(10, 19, 14, 20), L(10, 19, 16, 30)]]),
        sleep("n3", [[L(10, 19, 19, 20), L(10, 20, 10, 15)]]),
      ];
      const w = days(week, L(10, 20, 12, 0));
      const ws = S.summarise(w);
      expect(V.averagesNote(w, ws)).toBe(
        "Sun 18 – Mon 19 Oct · 2 complete days. Not included: today so far, and Sat 17 (no night sleep logged).",
      );
      const v = Object.fromEntries(V.averageCards(ws).map((c) => [c.label, c.value]));
      expect(v["Average bedtime"]).toBe("8:15 pm"); // (9:00 pm + 7:30 pm) / 2; the first version said 1:13 am
      expect(v["Average wake-up time"]).toBe("8:20 am"); // (8:30 am + 8:10 am) / 2; the first version said 10:33 am
      expect(v["Average length of night sleep"]).toBe("11h 48m"); // (10h 55m + 12h 40m) / 2 = 11h 47.5m
    });
  });

  it("has the nine cards, in this order, every one an average but the best night", () => {
    const cards = V.averageCards(sum);
    expect(cards.map((c) => c.label)).toEqual([
      "Average time asleep per day",
      "Average length of night sleep",
      "Average naps per day",
      "Average nap length",
      "Average bedtime",
      "Average wake-up time",
      "Longest unbroken sleep",
      "Average wakes per night",
      "Average time awake between sleeps",
    ]);
    expect(cards.filter((c) => !c.label.startsWith("Average")).map((c) => c.label)).toEqual([
      "Longest unbroken sleep",
    ]);
  });

  it("explains the daily total and the night under their values", () => {
    const [total, night, , , , , best] = V.averageCards(sum);
    expect(total.sub).toBe("Night + naps");
    expect(night.sub).toBe("Part of the daily total");
    expect(best.sub).toBe("Best night in this period");
  });

  it("says which end of the night bedtime and wake-up are (JOS-90)", () => {
    const [, , , , bedtime, wake] = V.averageCards(sum);
    expect(bedtime.sub).toBe("When the night sleep starts");
    expect(wake.sub).toBe("When the night sleep ends");
  });

  it("never abbreviates or uses a slash in a label, and keeps 'wake-up' on one line", () => {
    for (const c of V.averageCards(sum)) {
      expect(c.label).not.toMatch(/\/|\bavg\b|\bAvg\b|\./);
    }
    const wake = V.averageCards(sum).find((c) => c.label === "Average wake-up time");
    expect(wake?.keepTogether).toBe("wake-up");
    expect(V.averageCards(sum).find((c) => c.wide)?.label).toBe("Average time awake between sleeps");
  });

  it("works the values out from the complete days", () => {
    // Sun 11: 11h 35m + 1h 15m; Mon 12: 12h 5m + 1h 40m; Tue 13 to Fri 16: 11h 5m each.
    // That is 6 complete days (Sun 11, Mon 12, Tue 13, Wed 14, Thu 15, Fri 16).
    expect(sum.days).toBe(6);
    const v = Object.fromEntries(V.averageCards(sum).map((c) => [c.label, c.value]));
    expect(v["Average naps per day"]).toBe("0.3"); // 2 naps over 6 days
    expect(v["Average nap length"]).toBe("1h 28m"); // (75 + 100) / 2 = 87.5 min, rounded
    // bedtimes 7:20, 7:30, then 7:45 four times: (20 + 30 + 4 x 45) / 6 = 38.3 min past 7 pm
    expect(v["Average bedtime"]).toBe("7:38 pm");
    // wake-ups 6:55, 7:35, then 6:50 four times: (415 + 455 + 4 x 410) / 6 = 418.3 min = 6:58 am
    expect(v["Average wake-up time"]).toBe("6:58 am");
    expect(v["Longest unbroken sleep"]).toBe("12h 5m");
  });

  it("shows a dash on every card when there is nothing to average", () => {
    const empty = V.averageCards(S.summarise([]));
    expect(empty.map((c) => c.value)).toEqual(Array(9).fill("—"));
  });
});

describe("charts", () => {
  it("rounds the top of a chart up to a whole step", () => {
    expect(V.niceMax(mins(725 + 100), 2 * HOUR)).toBe(14 * HOUR);
    expect(V.niceMax(14 * HOUR, 2 * HOUR)).toBe(14 * HOUR);
    expect(V.niceMax(0, 2 * HOUR)).toBe(2 * HOUR);
  });

  it("draws the axis at zero, half and the top, in whole hours", () => {
    expect(V.axisTicks(14 * HOUR)).toEqual([
      { label: "0h", pct: 0 },
      { label: "7h", pct: 50 },
      { label: "14h", pct: 100 },
    ]);
  });

  it("names a day on the axis and the month only where it changes", () => {
    const d = days(
      [
        sleep("a", [[L(9, 29, 19, 0), L(9, 30, 6, 0)]]),
        sleep("b", [[L(9, 30, 19, 0), L(10, 1, 6, 0)]]),
        sleep("c", [[L(10, 1, 19, 0), L(10, 2, 6, 0)]]),
      ],
      L(10, 5, 12, 0),
    );
    expect(V.xLabels(d)).toEqual([
      { weekday: "Wed", date: 30, month: "Sep" },
      { weekday: "Thu", date: 1, month: "Oct" },
      { weekday: "Fri", date: 2, month: "" },
    ]);
  });

  it("Sleep per day: one bar a day, as tall as its total, today marked so far", () => {
    const d = days(
      [...WEEK, sleep("nap", [[L(10, 17, 9, 0), L(10, 17, 9, 40)]])],
      L(10, 17, 10, 0),
    );
    const chart = V.stackedChart(d);
    expect(chart.bars.map((b) => b.key)).toEqual(d.map((x) => x.key));
    const mon = chart.bars.find((b) => b.key === "2026-10-12");
    expect(chart.maxMs).toBe(14 * HOUR); // Mon is 13h 45m
    expect(mon?.pct).toBeCloseTo((mins(725 + 100) / (14 * HOUR)) * 100, 6);
    expect(mon?.partial).toBe(false);
    expect(mon?.label).toBe("Mon 12 Oct: 13h 45m asleep, night 12h 5m, naps 1h 40m");
    expect(mon?.readout).toBe("Mon 12 Oct · 13h 45m asleep · night 12h 5m · naps 1h 40m");
    const sat = chart.bars[chart.bars.length - 1];
    expect(sat.partial).toBe(true);
    // a lone 40 min sleep is a nap: a night needs 5 h (JOS-90)
    expect(sat.label).toBe("Sat 17 Oct so far: 40m asleep, night 0m, naps 40m");
    expect(sat.readout).toBe("Sat 17 Oct (so far) · 40m asleep · night 0m · naps 40m");
    // night + naps is the whole bar
    for (const b of chart.bars) {
      const day = d.find((x) => x.key === b.key) as S.Day;
      expect(b.nightMs + b.napMs).toBe(day.totalMs);
    }
  });

  it("Longest stretch & night wakes: one bar a night, as tall as its longest stretch, the wake count under it", () => {
    const d = days(
      [
        sleep("night", [
          [L(10, 15, 19, 30), L(10, 15, 23, 0)],
          [L(10, 15, 23, 25), L(10, 16, 6, 0)],
        ]),
      ],
      L(10, 17, 10, 0),
    );
    const chart = V.longestChart(d);
    const fri = chart.bars[0];
    expect(fri.key).toBe("2026-10-16");
    expect(fri.hasNight).toBe(true);
    expect(fri.wakes).toBe("1");
    expect(fri.label).toBe("Fri 16 Oct: longest stretch 6h 35m, 1 wake");
    expect(fri.readout).toBe("Fri 16 Oct · longest stretch 6h 35m · 1 wake");
    expect(fri.pct).toBeCloseTo((mins(6 * 60 + 35) / chart.maxMs) * 100, 6);
    expect(chart.maxMs).toBe(8 * HOUR);
  });

  it("says '2 wakes' for two and '0 wakes' for none", () => {
    expect(V.wakeWord(0)).toBe("0 wakes");
    expect(V.wakeWord(1)).toBe("1 wake");
    expect(V.wakeWord(2)).toBe("2 wakes");
  });

  it("gives a day with no night yet a dash and no bar", () => {
    // Only a sleep that is still running: in no total, so no night
    const d = days([sleep("a", [[L(10, 15, 19, 0), null]], null)], L(10, 15, 20, 0));
    const bar = V.longestChart(d).bars[0];
    expect(bar.key).toBe("2026-10-15");
    expect(bar.hasNight).toBe(false);
    expect(bar.wakes).toBe("–");
    expect(bar.pct).toBe(0);
    expect(bar.label).toBe("Thu 15 Oct: no night sleep logged yet");
    expect(bar.readout).toBe("Thu 15 Oct · no night sleep logged yet");
  });
});

describe("the 24-hour pattern", () => {
  it("reads like the spec's example", () => {
    // Fri 16 Oct: a night 7:12 pm to 7:11 am with one 10-minute wake, and four naps
    const sl = [
      sleep("night", [
        [L(10, 15, 19, 12), L(10, 16, 1, 0)],
        [L(10, 16, 1, 10), L(10, 16, 7, 11)],
      ]), // 11h 49m asleep
      sleep("n1", [[L(10, 16, 8, 30), L(10, 16, 9, 40)]]), // 1h 10m
      sleep("n2", [[L(10, 16, 11, 45), L(10, 16, 12, 40)]]), // 55m
      sleep("n3", [[L(10, 16, 14, 50), L(10, 16, 15, 31)]]), // 41m
      sleep("n4", [[L(10, 16, 17, 10), L(10, 16, 17, 30)]]), // 20m
    ];
    const fri = days(sl, SAT)[0];
    expect(V.patternText(fri)).toBe(
      "Fri 16 Oct · 14h 55m asleep · night 7:12 pm → 7:11 am · 4 naps · 1 wake",
    );
  });

  it("says 'so far' for today and leaves the night out when there is none", () => {
    const d = days([sleep("nap", [[L(10, 17, 9, 0), L(10, 17, 9, 40)]])], L(10, 17, 10, 0));
    expect(V.patternText(d[0])).toContain("Sat 17 Oct so far · 40m asleep");
  });

  it("says under the title how to read a row, and that a night nobody added leaves a gap", () => {
    expect(V.patternNote()).toBe(
      "One row per calendar day. A night shows on two rows but counts on the day he woke. Only sleeps that were logged are drawn, so a night nobody added leaves a gap.",
    );
  });

  it("is the latest 14 days, newest first", () => {
    const sl: ReportSleep[] = [];
    for (let i = 0; i < 20; i++) sl.push(sleep(`n${i}`, [[L(9, 20 + i, 19, 0), L(9, 21 + i, 6, 0)]]));
    const rows = V.patternRows(days(sl, L(10, 20, 12, 0)));
    expect(rows).toHaveLength(14);
    expect(rows[0].key > rows[13].key).toBe(true);
    expect(rows[0].key).toBe("2026-10-10");
  });

  it("draws a night on two rows, each against its own calendar day", () => {
    const rows = V.patternRows(days([sleep("n", [[L(10, 15, 22, 0), L(10, 16, 6, 0)]])], SAT));
    const fri = rows.find((r) => r.key === "2026-10-16");
    expect(fri?.pieces).toHaveLength(1);
    expect(fri?.pieces[0].left).toBe(0);
    expect(fri?.pieces[0].width).toBeCloseTo((6 / 24) * 100, 6);
    // Thursday carries the evening half but is not a day of its own in the list
    expect(rows.find((r) => r.key === "2026-10-15")).toBeUndefined();
  });

  it("measures a day with a clock change against that day's own length (25 h)", () => {
    // Sun 25 Oct 2026: clocks go back, so the day is 25 hours long
    const rows = V.patternRows(days([sleep("n", [[L(10, 24, 19, 30), L(10, 25, 6, 30)]])], L(10, 30, 12, 0)));
    expect(rows[0].key).toBe("2026-10-25");
    expect(rows[0].pieces[0].width).toBeCloseTo((7.5 / 25) * 100, 6); // 00:00 BST to 06:30 GMT
  });

  it("marks the stretch still running", () => {
    const now = L(10, 17, 9, 0);
    const rows = V.patternRows(days([sleep("n", [[L(10, 17, 8, 0), null]], null)], now));
    expect(rows[0].partial).toBe(true);
    expect(rows[0].pieces[0].running).toBe(true);
    expect(rows[0].pieces[0].width).toBeCloseTo((1 / 24) * 100, 6);
  });
});

describe("the status pill", () => {
  it("says what is happening and the time asleep so far, pauses excluded", () => {
    expect(V.openPill("sleeping", mins(74))).toEqual({
      variant: "asleep",
      text: "Sleeping now · 1h 14m",
      label: "Sleeping now, 1h 14m asleep so far",
    });
    expect(V.openPill("paused", mins(74))).toEqual({
      variant: "paused",
      text: "Paused · 1h 14m",
      label: "Paused, 1h 14m asleep so far",
    });
    expect(V.openPill("sleeping", 0).text).toBe("Sleeping now · 0m");
  });
});

describe("the Today card", () => {
  const nap = sleep("nap", [[L(10, 17, 9, 35), L(10, 17, 10, 50)]]);
  const night = sleep("night", [[L(10, 16, 19, 25), L(10, 17, 6, 51)]]);

  it("is 'Sleeping now' with the time asleep so far while a sleep runs", () => {
    const now = L(10, 17, 21, 19);
    const running = sleep("tonight", [[L(10, 17, 19, 50), L(10, 17, 20, 55)], [L(10, 17, 21, 10), null]], null);
    const td = S.today([night, nap, running], now);
    // 65 min + 9 min = 1h 14m asleep, the 15 min pause excluded
    expect(V.todayPill(td)).toMatchObject({ variant: "asleep", text: "Sleeping now · 1h 14m" });
  });

  it("is 'Paused' while a sleep is paused", () => {
    const now = L(10, 17, 21, 0);
    const paused = sleep("tonight", [[L(10, 17, 19, 50), L(10, 17, 20, 55)]], null);
    expect(V.todayPill(S.today([night, nap, paused], now))).toMatchObject({
      variant: "paused",
      text: "Paused · 1h 5m",
    });
  });

  it("is 'Awake' with how long when nothing is open", () => {
    const now = L(10, 17, 14, 10);
    expect(V.todayPill(S.today([night, nap], now))).toEqual({ variant: "awake", text: "Awake · 3h 20m" });
  });

  it("says just 'Awake' with one line under it after 12 hours or more", () => {
    const now = L(10, 18, 5, 0); // 12 h 34 m after 4:26 pm
    const old = sleep("old", [[L(10, 17, 15, 30), L(10, 17, 16, 26)]]);
    expect(V.todayPill(S.today([old], now))).toEqual({
      variant: "awake",
      text: "Awake",
      caption: "no sleep logged since 4:26 pm",
    });
  });

  it("is 'No sleeps logged yet' with nothing at all", () => {
    expect(V.todayPill(S.today([], SAT))).toEqual({ variant: "none", text: "No sleeps logged yet" });
  });

  it("has a line under the Naps number only when there is no nap to show", () => {
    expect(V.todayCaption(S.today([night, nap], L(10, 17, 14, 0)))).toBeNull();
    expect(V.todayCaption(S.today([night], L(10, 17, 14, 0)))).toBe("No naps yet");
    expect(V.todayCaption(S.today([sleep("n", [[L(10, 16, 19, 0), null]], null)], L(10, 17, 3, 0)))).toBe(
      "Nothing finished yet today",
    );
    expect(V.todayCaption(S.today([], SAT))).toBe("No sleep logged today");
  });

  it("lists last night, each nap and the sleep under way, as the spec words them", () => {
    const now = L(10, 17, 21, 19);
    const running = sleep("tonight", [[L(10, 17, 19, 50), L(10, 17, 20, 55)], [L(10, 17, 21, 10), null]], null);
    const rows = V.todayRows(S.today([night, nap, running], now));
    expect(rows).toEqual([
      { tone: "muted", label: "Last night", range: "7:25 pm – 6:51 am", duration: "11h 26m" },
      { tone: "normal", label: "Nap 1", range: "9:35 – 10:50 am", duration: "1h 15m" },
      { tone: "now", label: "Sleeping", range: "7:50 pm → now", duration: "1h 14m" },
    ]);
  });

  it("labels a paused sleep 'Paused' in the list", () => {
    const paused = sleep("tonight", [[L(10, 17, 19, 50), L(10, 17, 20, 55)]], null);
    const rows = V.todayRows(S.today([night, nap, paused], L(10, 17, 21, 0)));
    expect(rows[rows.length - 1]).toMatchObject({ tone: "now", label: "Paused", duration: "1h 5m" });
  });

  it("numbers the naps in order", () => {
    const n2 = sleep("n2", [[L(10, 17, 13, 10), L(10, 17, 14, 45)]]);
    const rows = V.todayRows(S.today([night, nap, n2], L(10, 17, 16, 0)));
    expect(rows.map((r) => r.label)).toEqual(["Last night", "Nap 1", "Nap 2"]);
  });

  it("draws the day strip midnight to midnight with a now line", () => {
    const now = L(10, 17, 12, 0);
    const strip = V.todayStrip(S.today([night, nap], now));
    expect(strip.nowPct).toBeCloseTo(50, 6);
    expect(strip.description).toBe("Asleep 12:00 am to 6:51 am, 9:35 am to 10:50 am");
    expect(strip.pieces[0].left).toBe(0);
    expect(strip.pieces[0].width).toBeCloseTo(((6 * 60 + 51) / 1440) * 100, 6);
  });

  it("says so when nothing has been logged today, and says 'now' for a running stretch", () => {
    expect(V.todayStrip(S.today([], SAT)).description).toBe("No sleep logged today");
    const running = sleep("r", [[L(10, 17, 9, 0), null]], null);
    expect(V.todayStrip(S.today([running], L(10, 17, 9, 30))).description).toBe("Asleep 9:00 am to now");
  });
});

describe("the daily table", () => {
  it("lists the newest day first, today tagged, and adds up on every row", () => {
    const d = days([...WEEK, sleep("nap", [[L(10, 17, 9, 0), L(10, 17, 9, 40)]])], L(10, 17, 10, 0));
    const rows = V.tableRows(d);
    expect(rows[0].day).toBe("Sat 17 Oct");
    expect(rows[0].partial).toBe(true);
    expect(rows[1].partial).toBe(false);
    expect(V.TABLE_COLUMNS).toEqual(["Day", "Total", "Night", "Nap time", "Naps", "Longest", "Wakes", "Bedtime", "Up at"]);
    for (const r of rows) expect(r.cells).toHaveLength(V.TABLE_COLUMNS.length - 1);
    const mon = rows.find((r) => r.day === "Mon 12 Oct");
    expect(mon?.cells).toEqual(["13h 45m", "12h 5m", "1h 40m", "1", "12h 5m", "0", "7:30 pm", "7:35 am"]);
  });

  it("night + naps equals total on every row", () => {
    const d = days(WEEK, SAT);
    for (const day of d) expect(day.nightMs + day.napMs).toBe(day.totalMs);
  });

  it("shows a dash for the night, longest, wakes and times of a day with no night yet", () => {
    // today so far, only a sleep still running: in no total, so no night
    const d = days([sleep("a", [[L(10, 15, 19, 0), null]], null)], L(10, 15, 20, 0));
    expect(V.tableRows(d)[0]).toMatchObject({
      day: "Thu 15 Oct",
      partial: true,
      cells: ["0m", "—", "0m", "0", "—", "—", "—", "—"],
    });
  });

  it("uses a dash where there is no night: a date whose longest sleep is under 5 h (JOS-90)", () => {
    // a lone 40 min sleep is a nap, not a night
    const d = days([sleep("nap", [[L(10, 17, 9, 0), L(10, 17, 9, 40)]])], L(10, 17, 10, 0));
    expect(V.tableRows(d)[0].cells).toEqual(["40m", "—", "40m", "1", "—", "—", "—", "—"]);
    // 4 h and 40 min: still no night, both are naps
    const twoOnOneDay = days(
      [sleep("long", [[L(10, 17, 1, 0), L(10, 17, 5, 0)]]), sleep("short", [[L(10, 17, 9, 0), L(10, 17, 9, 40)]])],
      L(10, 17, 10, 0),
    );
    expect(V.tableRows(twoOnOneDay)[0].cells.slice(0, 5)).toEqual(["4h 40m", "—", "4h 40m", "2", "—"]);
    // the same day with a 5 h sleep has a night: 5 h, and the 40 min is the nap
    const withNight = days(
      [sleep("long", [[L(10, 17, 0, 0), L(10, 17, 5, 0)]]), sleep("short", [[L(10, 17, 9, 0), L(10, 17, 9, 40)]])],
      L(10, 17, 10, 0),
    );
    expect(V.tableRows(withNight)[0].cells.slice(0, 5)).toEqual(["5h 40m", "5h", "40m", "1", "5h"]);
  });
});

describe("the Last sleep tile", () => {
  const prev = sleep("prev", [[L(10, 16, 13, 0), L(10, 16, 13, 40)]]);

  it("shows how long ago he woke, and how long he slept", () => {
    const now = L(10, 16, 18, 33); // 4h 53m after 1:40 pm
    const tile = V.lastSleepTile(S.glance([prev], now), now);
    expect(tile).toEqual({ value: "4h 53m ago", detail: "Slept 40m", none: false, pill: null });
  });

  it("says 'Not logged yet' with no sleep", () => {
    expect(V.lastSleepTile(S.glance([], SAT), SAT)).toEqual({
      value: "Not logged yet",
      detail: null,
      none: true,
      pill: null,
    });
  });

  it("adds a pill while a sleep runs and leaves the last completed sleep alone", () => {
    const now = L(10, 16, 21, 19);
    const running = sleep("run", [[L(10, 16, 19, 50), L(10, 16, 20, 55)], [L(10, 16, 21, 10), null]], null);
    const tile = V.lastSleepTile(S.glance([prev, running], now), now);
    expect(tile.value).toBe("7h 39m ago");
    expect(tile.detail).toBe("Slept 40m");
    expect(tile.pill).toEqual({
      variant: "asleep",
      text: "Sleeping now · 1h 14m",
      label: "Sleeping now, 1h 14m asleep so far",
    });
  });

  it("says 'Paused' in the pill for a paused sleep", () => {
    const now = L(10, 16, 21, 0);
    const paused = sleep("run", [[L(10, 16, 19, 50), L(10, 16, 20, 55)]], null);
    expect(V.lastSleepTile(S.glance([prev, paused], now), now).pill?.text).toBe("Paused · 1h 5m");
  });

  it("starts at 0m and only moves to the new sleep when it is stopped", () => {
    const now = L(10, 16, 19, 50);
    const started = sleep("run", [[now, null]], null);
    const during = V.lastSleepTile(S.glance([prev, started], now), now);
    expect(during.pill?.text).toBe("Sleeping now · 0m");
    expect(during.detail).toBe("Slept 40m");
    const stopped = sleep("run", [[now, now + mins(70)]]);
    const after = V.lastSleepTile(S.glance([prev, stopped], now + mins(70)), now + mins(70));
    expect(after).toEqual({ value: "just now", detail: "Slept 1h 10m", none: false, pill: null });
  });

  it("falls back to the sleep before it when the newest is deleted", () => {
    const now = L(10, 16, 16, 0);
    const newer = sleep("newer", [[L(10, 16, 15, 0), L(10, 16, 15, 4)]]);
    expect(V.lastSleepTile(S.glance([prev, newer], now), now).detail).toBe("Slept 4m");
    expect(V.lastSleepTile(S.glance([prev, { ...newer, deletedAt: now }], now), now).detail).toBe("Slept 40m");
  });
});

describe("recentForToday: what the Today card reads from a long history", () => {
  const app = (id: string, start: number, end: number | null, closed = end): Sleep => ({
    id,
    by: "joseph",
    stretches: [{ start, end }],
    closedAt: closed,
    rev: 1,
    last: { by: "joseph", action: "start", at: start },
    notes: null,
  });
  const NOW = L(10, 20, 12, 0);
  const DAY = 24 * HOUR;

  // 60 days of a night and a nap, a sleep running now, and one gap of 20 days in the middle of the history
  const history: Sleep[] = [];
  for (let d = 60; d >= 1; d--) {
    if (d >= 25 && d <= 44) continue;
    history.push(app(`n${d}`, NOW - d * DAY + 7 * HOUR, NOW - d * DAY + 18 * HOUR));
    history.push(app(`p${d}`, NOW - d * DAY + 20 * HOUR, NOW - d * DAY + 21 * HOUR));
  }
  const running = app("run", NOW - HOUR, null, null);
  // paused 30 days ago and never closed by anything: the card closes it itself, three hours on
  const forgotten = app("old", NOW - 30 * DAY, NOW - 30 * DAY + HOUR, null);

  it("keeps the last two weeks and anything still open", () => {
    const kept = V.recentForToday([...history, running], NOW).map((s) => s.id);
    expect(kept).toContain("run");
    expect(kept).toContain("n3");
    expect(kept).toContain("p13"); // 13 days back
    expect(kept).not.toContain("n20");
    expect(kept).not.toContain("n60");
  });

  it("adds the one sleep before them, so the time awake since it is still right", () => {
    // the newest sleep before the 14 days is the one 15 days back, so that one comes along
    const kept = V.recentForToday(history, NOW).map((s) => s.id);
    expect(kept[0]).toBe("p15");
    expect(kept.filter((id) => id.startsWith("n") || id.startsWith("p")).length).toBeLessThan(40);
  });

  it("changes nothing the card shows: Today from the short list equals Today from everything", () => {
    for (const now of [NOW - 6 * HOUR, NOW, NOW + 3 * HOUR, NOW + 20 * HOUR, NOW + 30 * DAY]) {
      for (const open of [[], [running], [forgotten], [forgotten, running]]) {
        const all = [...history, ...open];
        const full = S.today(S.toReportSleeps(all, now), now);
        const short = S.today(S.toReportSleeps(V.recentForToday(all, now), now), now);
        expect(short).toStrictEqual(full);
      }
    }
  });

  it("is the whole list when there is little history, and empty for none", () => {
    const few = [app("a", NOW - 2 * DAY, NOW - 2 * DAY + HOUR)];
    expect(V.recentForToday(few, NOW)).toEqual(few);
    expect(V.recentForToday([], NOW)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  availableYears,
  computeDailyStats,
  computeOverallStats,
  currentMonthValue,
  filterEntriesByRange,
  formatMinutes,
} from "@/lib/reports";
import { makeEntry } from "@/lib/test-helpers";

describe("computeOverallStats", () => {
  it("counts total feeds as bottle OR breast (union, not sum)", () => {
    const entries = [
      makeEntry({ type: "feed", bottle: true }),
      makeEntry({ type: "feed", breast: true }),
      makeEntry({ type: "feed", bottle: true, breast: true }), // topped up after breastfeeding
      makeEntry({ type: "pee" }),
      makeEntry({ type: "poop" }),
    ];

    const stats = computeOverallStats(entries);
    expect(stats.totalFeeds).toBe(3);
    expect(stats.bottleFeeds).toBe(2);
    expect(stats.breastFeeds).toBe(2);
  });

  it("computes average gap between consecutive feeds in minutes", () => {
    const entries = [
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T08:00:00.000Z" }),
      makeEntry({ type: "feed", breast: true, timestamp: "2026-07-16T10:00:00.000Z" }), // +120m
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T13:00:00.000Z" }), // +180m
    ];

    expect(computeOverallStats(entries).avgGapMinutes).toBe(150);
  });

  it("returns null avgGapMinutes with fewer than two feeds", () => {
    const entries = [makeEntry({ type: "feed", bottle: true })];
    expect(computeOverallStats(entries).avgGapMinutes).toBeNull();
  });

  it("gap calculation is order-independent (sorts by time first)", () => {
    const entries = [
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T13:00:00.000Z" }),
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T08:00:00.000Z" }),
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T10:00:00.000Z" }),
    ];

    expect(computeOverallStats(entries).avgGapMinutes).toBe(150);
  });

  it("does not let a still-in-progress breastfeed session drag down avg session length", () => {
    const entries = [
      makeEntry({
        type: "feed",
        breast: true,
        breast_right_seconds: 120,
        breast_left_seconds: 60,
        breast_session_ended: true,
      }),
      // In progress: has an active side but was never ended — must be excluded.
      makeEntry({
        type: "feed",
        breast: true,
        breast_active_side: "right",
        breast_active_started_at: "2026-07-16T10:00:00.000Z",
        breast_session_ended: false,
      }),
    ];

    const stats = computeOverallStats(entries);
    expect(stats.breastfeedSessions).toBe(1);
    expect(stats.avgBreastfeedSessionSeconds).toBe(180);
  });

  it("returns null avgBreastfeedSessionSeconds with no ended sessions", () => {
    const entries = [makeEntry({ type: "feed", breast: true })];
    expect(computeOverallStats(entries).avgBreastfeedSessionSeconds).toBeNull();
  });
});

describe("computeDailyStats", () => {
  it("buckets entries by local calendar day and counts bottle/breast separately", () => {
    const entries = [
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T08:00:00.000Z", amount_ml: 30 }),
      makeEntry({ type: "feed", breast: true, timestamp: "2026-07-16T14:00:00.000Z" }),
      makeEntry({ type: "pee", timestamp: "2026-07-16T09:00:00.000Z" }),
      makeEntry({ type: "poop", timestamp: "2026-07-17T09:00:00.000Z" }),
    ];

    const daily = computeDailyStats(entries);
    expect(daily).toHaveLength(2);

    const day16 = daily.find((d) => d.dayKey === "2026-07-16");
    expect(day16?.bottleCount).toBe(1);
    expect(day16?.breastCount).toBe(1);
    expect(day16?.totalMl).toBe(30);
    expect(day16?.avgMlPerBottle).toBe(30);
    expect(day16?.peeCount).toBe(1);
    expect(day16?.poopCount).toBe(0);

    const day17 = daily.find((d) => d.dayKey === "2026-07-17");
    expect(day17?.poopCount).toBe(1);
    expect(day17?.bottleCount).toBe(0);
    expect(day17?.avgMlPerBottle).toBeNull();
  });

  it("sorts days ascending (oldest first) for chronological charting", () => {
    const entries = [
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-17T08:00:00.000Z" }),
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-15T08:00:00.000Z" }),
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T08:00:00.000Z" }),
    ];

    const dayKeys = computeDailyStats(entries).map((d) => d.dayKey);
    expect(dayKeys).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
  });

  it("does not let a day's avg mL/bottle be dragged down by bottle feeds with no amount", () => {
    const entries = [
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T08:00:00.000Z", amount_ml: 40 }),
      makeEntry({ type: "feed", bottle: true, timestamp: "2026-07-16T14:00:00.000Z", amount_ml: null }),
    ];

    expect(computeDailyStats(entries)[0].avgMlPerBottle).toBe(40);
  });

  it("counts a row with both bottle and breast toward both counts", () => {
    const entries = [
      makeEntry({
        type: "feed",
        bottle: true,
        breast: true,
        amount_ml: 20,
        timestamp: "2026-07-16T08:00:00.000Z",
      }),
    ];

    const day = computeDailyStats(entries)[0];
    expect(day.bottleCount).toBe(1);
    expect(day.breastCount).toBe(1);
    expect(day.totalMl).toBe(20);
  });

  it("only counts ended breastfeed sessions toward daily Right/Left/session totals", () => {
    const entries = [
      makeEntry({
        type: "feed",
        breast: true,
        breast_right_seconds: 200,
        breast_left_seconds: 100,
        breast_session_ended: true,
        timestamp: "2026-07-16T08:00:00.000Z",
      }),
      // In progress, not ended — must not contribute to the day's totals.
      makeEntry({
        type: "feed",
        breast: true,
        breast_active_side: "left",
        breast_active_started_at: "2026-07-16T09:00:00.000Z",
        breast_session_ended: false,
        timestamp: "2026-07-16T09:00:00.000Z",
      }),
    ];

    const day = computeDailyStats(entries)[0];
    expect(day.breastRightSeconds).toBe(200);
    expect(day.breastLeftSeconds).toBe(100);
    expect(day.breastSessionCount).toBe(1);
  });
});

describe("filterEntriesByRange", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");
  const entries = [
    makeEntry({ id: "recent", timestamp: "2026-07-18T12:00:00.000Z" }), // 1 day ago
    makeEntry({ id: "10d", timestamp: "2026-07-09T12:00:00.000Z" }), // 10 days ago
    makeEntry({ id: "60d", timestamp: "2026-05-20T12:00:00.000Z" }), // 60 days ago
    makeEntry({ id: "lastYear", timestamp: "2025-03-01T12:00:00.000Z" }),
  ];

  it("'all' returns everything", () => {
    expect(filterEntriesByRange(entries, { kind: "all" }, now)).toHaveLength(4);
  });

  it("'7d' keeps only entries within the last 7 days", () => {
    const result = filterEntriesByRange(entries, { kind: "7d" }, now);
    expect(result.map((e) => e.id)).toEqual(["recent"]);
  });

  it("'30d' keeps entries within the last 30 days", () => {
    const result = filterEntriesByRange(entries, { kind: "30d" }, now);
    expect(result.map((e) => e.id).sort()).toEqual(["10d", "recent"]);
  });

  it("'month' keeps entries in the given calendar month", () => {
    const result = filterEntriesByRange(entries, { kind: "month", month: "2026-05" }, now);
    expect(result.map((e) => e.id)).toEqual(["60d"]);
  });

  it("'year' keeps entries in the given calendar year", () => {
    const result = filterEntriesByRange(entries, { kind: "year", year: 2025 }, now);
    expect(result.map((e) => e.id)).toEqual(["lastYear"]);
  });
});

describe("availableYears", () => {
  it("returns distinct years present in the data, most recent first", () => {
    const entries = [
      makeEntry({ timestamp: "2026-01-01T00:00:00.000Z" }),
      makeEntry({ timestamp: "2025-06-01T00:00:00.000Z" }),
      makeEntry({ timestamp: "2026-06-01T00:00:00.000Z" }),
    ];

    expect(availableYears(entries)).toEqual([2026, 2025]);
  });

  it("returns an empty array for no entries", () => {
    expect(availableYears([])).toEqual([]);
  });
});

describe("currentMonthValue", () => {
  it("formats as YYYY-MM", () => {
    expect(currentMonthValue(new Date("2026-03-05T00:00:00.000Z"))).toMatch(
      /^\d{4}-\d{2}$/,
    );
  });
});

describe("formatMinutes", () => {
  it("formats under an hour as minutes only", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("formats whole hours without a minutes suffix", () => {
    expect(formatMinutes(120)).toBe("2h");
  });

  it("formats hours and minutes together", () => {
    expect(formatMinutes(150)).toBe("2h 30m");
  });

  it("carries a rounded-up remainder into the next hour instead of showing '60m'", () => {
    // 3190h 59.6m should round to 3191h, not "3190h 60m".
    expect(formatMinutes(3190 * 60 + 59.6)).toBe("3191h");
  });
});

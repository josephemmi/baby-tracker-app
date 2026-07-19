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
  it("counts total entries and feeds", () => {
    const entries = [
      makeEntry({ type: "feed" }),
      makeEntry({ type: "pee" }),
      makeEntry({ type: "poop" }),
    ];

    const stats = computeOverallStats(entries);
    expect(stats.totalEntries).toBe(3);
    expect(stats.totalFeeds).toBe(1);
  });

  it("averages mL only over feeds that have an amount logged", () => {
    const entries = [
      makeEntry({ type: "feed", amount_ml: 30 }),
      makeEntry({ type: "feed", amount_ml: 60 }),
      makeEntry({ type: "feed", amount_ml: null }), // e.g. "super not hungry" entry
    ];

    // (30 + 60) / 2, not / 3 — an unlogged amount shouldn't drag the average down.
    expect(computeOverallStats(entries).avgMlPerFeed).toBe(45);
  });

  it("returns null avgMlPerFeed when no feed has an amount", () => {
    const entries = [makeEntry({ type: "feed", amount_ml: null })];
    expect(computeOverallStats(entries).avgMlPerFeed).toBeNull();
  });

  it("computes average gap between consecutive feeds in minutes", () => {
    const entries = [
      makeEntry({ type: "feed", timestamp: "2026-07-16T08:00:00.000Z" }),
      makeEntry({ type: "feed", timestamp: "2026-07-16T10:00:00.000Z" }), // +120m
      makeEntry({ type: "feed", timestamp: "2026-07-16T13:00:00.000Z" }), // +180m
    ];

    expect(computeOverallStats(entries).avgGapMinutes).toBe(150);
  });

  it("returns null avgGapMinutes with fewer than two feeds", () => {
    const entries = [makeEntry({ type: "feed" })];
    expect(computeOverallStats(entries).avgGapMinutes).toBeNull();
  });

  it("gap calculation is order-independent (sorts by time first)", () => {
    const entries = [
      makeEntry({ type: "feed", timestamp: "2026-07-16T13:00:00.000Z" }),
      makeEntry({ type: "feed", timestamp: "2026-07-16T08:00:00.000Z" }),
      makeEntry({ type: "feed", timestamp: "2026-07-16T10:00:00.000Z" }),
    ];

    expect(computeOverallStats(entries).avgGapMinutes).toBe(150);
  });
});

describe("computeDailyStats", () => {
  it("buckets entries by local calendar day and counts each type", () => {
    const entries = [
      makeEntry({ type: "feed", timestamp: "2026-07-16T08:00:00.000Z", amount_ml: 30 }),
      makeEntry({ type: "feed", timestamp: "2026-07-16T14:00:00.000Z", amount_ml: 50 }),
      makeEntry({ type: "pee", timestamp: "2026-07-16T09:00:00.000Z" }),
      makeEntry({ type: "poop", timestamp: "2026-07-17T09:00:00.000Z" }),
    ];

    const daily = computeDailyStats(entries);
    expect(daily).toHaveLength(2);

    const day16 = daily.find((d) => d.dayKey === "2026-07-16");
    expect(day16?.feedCount).toBe(2);
    expect(day16?.totalMl).toBe(80);
    expect(day16?.avgMlPerFeed).toBe(40);
    expect(day16?.peeCount).toBe(1);
    expect(day16?.poopCount).toBe(0);

    const day17 = daily.find((d) => d.dayKey === "2026-07-17");
    expect(day17?.poopCount).toBe(1);
    expect(day17?.feedCount).toBe(0);
    expect(day17?.avgMlPerFeed).toBeNull();
  });

  it("sorts days ascending (oldest first) for chronological charting", () => {
    const entries = [
      makeEntry({ type: "feed", timestamp: "2026-07-17T08:00:00.000Z" }),
      makeEntry({ type: "feed", timestamp: "2026-07-15T08:00:00.000Z" }),
      makeEntry({ type: "feed", timestamp: "2026-07-16T08:00:00.000Z" }),
    ];

    const dayKeys = computeDailyStats(entries).map((d) => d.dayKey);
    expect(dayKeys).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
  });

  it("does not let a day's avg mL/feed be dragged down by feeds with no amount", () => {
    const entries = [
      makeEntry({ type: "feed", timestamp: "2026-07-16T08:00:00.000Z", amount_ml: 40 }),
      makeEntry({ type: "feed", timestamp: "2026-07-16T14:00:00.000Z", amount_ml: null }),
    ];

    expect(computeDailyStats(entries)[0].avgMlPerFeed).toBe(40);
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

import { describe, expect, it } from "vitest";
import { computeDailyStats, computeOverallStats, formatMinutes } from "@/lib/reports";
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
});

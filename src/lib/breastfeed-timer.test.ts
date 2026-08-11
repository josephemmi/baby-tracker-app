import { describe, expect, it, vi } from "vitest";
import {
  canEndBreastSession,
  fmtDuration,
  getBreastDisplaySeconds,
  hasBreastTime,
} from "@/lib/breastfeed-timer";
import { makeEntry } from "@/lib/test-helpers";

describe("fmtDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(fmtDuration(0)).toBe("0:00");
    expect(fmtDuration(5)).toBe("0:05");
    expect(fmtDuration(65)).toBe("1:05");
    expect(fmtDuration(185)).toBe("3:05");
  });
});

describe("getBreastDisplaySeconds", () => {
  it("returns the finalized accumulated seconds when the side isn't active", () => {
    const entry = makeEntry({ breast_right_seconds: 45, breast_active_side: null });
    expect(getBreastDisplaySeconds(entry, "right")).toBe(45);
  });

  it("self-corrects to the real elapsed time after a simulated background gap, unlike a tick-counter", () => {
    const startedAt = new Date("2026-07-16T10:00:00.000Z");
    vi.setSystemTime(startedAt);
    const entry = makeEntry({
      breast_right_seconds: 0,
      breast_active_side: "right",
      breast_active_started_at: startedAt.toISOString(),
    });

    // Simulate the app being backgrounded for 185s — a throttled setInterval
    // would have only fired a handful of times, not 185 of them, so a
    // tick-counting timer would show far less than 3:05 here. The timestamp
    // formula recomputes from scratch and is exactly right regardless.
    vi.setSystemTime(new Date(startedAt.getTime() + 185_000));
    expect(getBreastDisplaySeconds(entry, "right")).toBe(185);

    vi.useRealTimers();
  });

  it("does not add elapsed time for the side that isn't active", () => {
    const entry = makeEntry({
      breast_right_seconds: 10,
      breast_left_seconds: 20,
      breast_active_side: "right",
      breast_active_started_at: new Date().toISOString(),
    });
    expect(getBreastDisplaySeconds(entry, "left")).toBe(20);
  });
});

describe("hasBreastTime", () => {
  it("is false with no accumulated time on either side", () => {
    expect(hasBreastTime(makeEntry({}))).toBe(false);
  });

  it("is true once either side has accumulated time", () => {
    expect(hasBreastTime(makeEntry({ breast_right_seconds: 1 }))).toBe(true);
    expect(hasBreastTime(makeEntry({ breast_left_seconds: 1 }))).toBe(true);
  });
});

describe("canEndBreastSession", () => {
  it("is false with no accumulated time and nothing running", () => {
    expect(canEndBreastSession(makeEntry({}))).toBe(false);
  });

  it("is true with accumulated (paused) time even if nothing is currently running", () => {
    expect(canEndBreastSession(makeEntry({ breast_right_seconds: 30 }))).toBe(true);
  });

  it("is true the moment a side starts running, before any time has accumulated", () => {
    expect(
      canEndBreastSession(
        makeEntry({ breast_active_side: "left", breast_active_started_at: new Date().toISOString() }),
      ),
    ).toBe(true);
  });
});

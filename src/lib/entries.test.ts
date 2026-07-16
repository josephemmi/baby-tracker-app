import { describe, expect, it } from "vitest";
import {
  formatTimeAgo,
  groupEntriesIntoMoments,
  latestEntryOfType,
  sortMomentsByCreatedAt,
  sortMomentsByTimestamp,
} from "@/lib/entries";
import { makeEntry } from "@/lib/test-helpers";

describe("groupEntriesIntoMoments", () => {
  it("clusters entries sharing timestamp + logged_by into one moment", () => {
    const timestamp = "2026-07-16T10:00:00.000Z";
    const entries = [
      makeEntry({ type: "feed", timestamp, logged_by: "u1", amount_ml: 60 }),
      makeEntry({ type: "pee", timestamp, logged_by: "u1" }),
      makeEntry({ type: "poop", timestamp, logged_by: "u1" }),
    ];

    const moments = groupEntriesIntoMoments(entries);

    expect(moments).toHaveLength(1);
    expect(moments[0].feed?.amount_ml).toBe(60);
    expect(moments[0].pee).toBeDefined();
    expect(moments[0].poop).toBeDefined();
  });

  it("keeps entries with different timestamps as separate moments", () => {
    const entries = [
      makeEntry({ type: "feed", timestamp: "2026-07-16T10:00:00.000Z" }),
      makeEntry({ type: "pee", timestamp: "2026-07-16T11:00:00.000Z" }),
    ];

    expect(groupEntriesIntoMoments(entries)).toHaveLength(2);
  });

  it("keeps entries with the same timestamp but different logged_by as separate moments", () => {
    const timestamp = "2026-07-16T10:00:00.000Z";
    const entries = [
      makeEntry({ type: "feed", timestamp, logged_by: "u1" }),
      makeEntry({ type: "feed", timestamp, logged_by: "u2" }),
    ];

    expect(groupEntriesIntoMoments(entries)).toHaveLength(2);
  });

  it("carries notes from whichever entry in the batch has them", () => {
    const timestamp = "2026-07-16T10:00:00.000Z";
    const entries = [
      makeEntry({ type: "feed", timestamp, notes: null }),
      makeEntry({ type: "poop", timestamp, notes: "Vitamin D3" }),
    ];

    expect(groupEntriesIntoMoments(entries)[0].notes).toBe("Vitamin D3");
  });
});

describe("sortMomentsByCreatedAt vs sortMomentsByTimestamp", () => {
  it("Home order (createdAt) puts a backdated-but-just-logged entry on top", () => {
    // Logged first (created earlier), event time is recent.
    const earlierLogged = makeEntry({
      id: "a",
      type: "feed",
      timestamp: "2026-07-16T09:00:00.000Z",
      created_at: "2026-07-16T08:00:00.000Z",
    });
    // Logged just now, but the user backdated the event time far in the past.
    const justLoggedButBackdated = makeEntry({
      id: "b",
      type: "pee",
      timestamp: "2026-07-14T09:00:00.000Z",
      created_at: "2026-07-16T09:30:00.000Z",
    });

    const moments = groupEntriesIntoMoments([
      earlierLogged,
      justLoggedButBackdated,
    ]);

    const homeOrder = sortMomentsByCreatedAt(moments);
    expect(homeOrder[0].feed ?? homeOrder[0].pee).toBeDefined();
    expect(homeOrder[0].createdAt).toBe("2026-07-16T09:30:00.000Z");

    const timelineOrder = sortMomentsByTimestamp(moments);
    // Timeline is chronological by event time, so the backdated one sorts last.
    expect(timelineOrder[timelineOrder.length - 1].timestamp).toBe(
      "2026-07-14T09:00:00.000Z",
    );
  });
});

describe("latestEntryOfType", () => {
  it("returns the most recent entry of the given type by timestamp", () => {
    const entries = [
      makeEntry({ type: "feed", timestamp: "2026-07-16T08:00:00.000Z", amount_ml: 30 }),
      makeEntry({ type: "feed", timestamp: "2026-07-16T11:00:00.000Z", amount_ml: 60 }),
      makeEntry({ type: "pee", timestamp: "2026-07-16T12:00:00.000Z" }),
    ];

    expect(latestEntryOfType(entries, "feed")?.amount_ml).toBe(60);
  });

  it("returns null when no entry of that type exists", () => {
    expect(latestEntryOfType([], "feed")).toBeNull();
  });
});

describe("formatTimeAgo", () => {
  it("formats sub-minute as just now", () => {
    const now = new Date("2026-07-16T10:00:10.000Z");
    expect(formatTimeAgo("2026-07-16T10:00:00.000Z", now)).toBe("just now");
  });

  it("formats minutes under an hour", () => {
    const now = new Date("2026-07-16T10:45:00.000Z");
    expect(formatTimeAgo("2026-07-16T10:00:00.000Z", now)).toBe("45m ago");
  });

  it("formats hours and minutes", () => {
    const now = new Date("2026-07-16T12:30:00.000Z");
    expect(formatTimeAgo("2026-07-16T10:00:00.000Z", now)).toBe("2h 30m ago");
  });

  it("omits minutes when exactly on the hour", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    expect(formatTimeAgo("2026-07-16T10:00:00.000Z", now)).toBe("2h ago");
  });
});

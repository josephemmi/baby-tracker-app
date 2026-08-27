import { describe, expect, it } from "vitest";
import {
  createDraftMoment,
  daysLeftToRestore,
  formatTimeAgo,
  groupEntriesIntoMoments,
  latestEntryOfType,
  mergeMoments,
  siblingIds,
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

describe("groupEntriesIntoMoments ordering", () => {
  it("sorts moments chronologically by event timestamp, most recent first", () => {
    const entries = [
      makeEntry({ id: "a", type: "feed", timestamp: "2026-07-16T08:00:00.000Z" }),
      // Logged after "a" in real time, but with an earlier (backdated) event time.
      makeEntry({ id: "b", type: "pee", timestamp: "2026-07-14T09:00:00.000Z" }),
      makeEntry({ id: "c", type: "poop", timestamp: "2026-07-16T11:00:00.000Z" }),
    ];

    const moments = groupEntriesIntoMoments(entries);

    expect(moments.map((m) => m.timestamp)).toEqual([
      "2026-07-16T11:00:00.000Z",
      "2026-07-16T08:00:00.000Z",
      "2026-07-14T09:00:00.000Z",
    ]);
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

describe("createDraftMoment", () => {
  it("prefills logged-by and current time, leaving everything else empty", () => {
    const draft = createDraftMoment("u1");

    expect(draft.isDraft).toBe(true);
    expect(draft.loggedBy).toBe("u1");
    expect(draft.notes).toBeNull();
    expect(draft.feed).toBeUndefined();
    expect(draft.pee).toBeUndefined();
    expect(draft.poop).toBeUndefined();
    expect(draft.key.startsWith("draft-")).toBe(true);
  });

  it("gives each draft a unique key", () => {
    const a = createDraftMoment("u1");
    const b = createDraftMoment("u1");
    expect(a.key).not.toBe(b.key);
  });
});

describe("mergeMoments", () => {
  it("combines drafts and real moments into one chronologically sorted list", () => {
    const real = groupEntriesIntoMoments([
      makeEntry({ type: "feed", timestamp: "2026-07-16T08:00:00.000Z" }),
    ]);
    const draft = createDraftMoment("u1");
    draft.timestamp = "2026-07-16T09:00:00.000Z";

    const merged = mergeMoments([draft], real);

    expect(merged.map((m) => m.key)).toEqual([draft.key, real[0].key]);
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

  it("formats a full day as Nd ago (JOS-20 Recently Deleted needs day-level ages)", () => {
    const now = new Date("2026-07-17T10:00:00.000Z");
    expect(formatTimeAgo("2026-07-16T10:00:00.000Z", now)).toBe("1d ago");
  });

  it("formats multiple days as Nd ago", () => {
    const now = new Date("2026-07-19T10:00:00.000Z");
    expect(formatTimeAgo("2026-07-16T10:00:00.000Z", now)).toBe("3d ago");
  });
});

describe("siblingIds", () => {
  it("collects every real entry id in a moment deleted/restored together (JOS-20)", () => {
    const timestamp = "2026-07-16T10:00:00.000Z";
    const [moment] = groupEntriesIntoMoments([
      makeEntry({ id: "pee-1", type: "pee", timestamp, logged_by: "u1" }),
      makeEntry({ id: "poop-1", type: "poop", timestamp, logged_by: "u1" }),
    ]);

    expect(siblingIds(moment).sort()).toEqual(["pee-1", "poop-1"]);
  });

  it("ignores draft moments with no persisted rows", () => {
    const draft = createDraftMoment("u1");
    expect(siblingIds(draft)).toEqual([]);
  });
});

describe("daysLeftToRestore", () => {
  it("counts down from 7 days as the deletion ages", () => {
    const deletedAt = "2026-07-16T10:00:00.000Z";
    expect(daysLeftToRestore(deletedAt, new Date("2026-07-16T10:05:00.000Z"))).toBe(7);
    expect(daysLeftToRestore(deletedAt, new Date("2026-07-17T10:00:01.000Z"))).toBe(6);
    expect(daysLeftToRestore(deletedAt, new Date("2026-07-21T10:00:01.000Z"))).toBe(2);
  });

  it("never reports 0 or negative while still inside the retention window", () => {
    const deletedAt = "2026-07-16T10:00:00.000Z";
    // Just shy of the 7-day cutoff — still restorable, so still "1 day left".
    expect(daysLeftToRestore(deletedAt, new Date("2026-07-23T09:59:59.000Z"))).toBe(1);
  });
});

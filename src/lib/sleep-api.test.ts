import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetServerClock, serverNow, syncServerClock } from "@/lib/server-clock";
import {
  applySleep,
  conflictError,
  dropSleep,
  isNetworkFailure,
  parseReply,
  rowToSleep,
  sleepApi,
  SleepServerError,
  type SleepRow,
} from "@/lib/sleep-api";
import { MIN, type Sleep } from "@/lib/sleep";
import type { Database } from "@/lib/supabase/database.types";

function row(over: Partial<SleepRow> = {}): SleepRow {
  return {
    id: "s1",
    baby_id: "baby",
    logged_by: "joseph",
    segments: [{ start: "2026-10-16T17:20:00.000Z", end: null }],
    started_at: "2026-10-16T17:20:00+00:00",
    closed_at: null,
    rev: 1,
    last_by: "joseph",
    last_action: "start",
    last_at: "2026-10-16T17:20:00+00:00",
    notes: null,
    deleted_at: null,
    deleted_by: null,
    created_at: "2026-10-16T17:20:00+00:00",
    ...over,
  };
}

const sleepAt = (id: string, startMinutes: number, rev = 1): Sleep => ({
  ...rowToSleep(row({ id })),
  stretches: [{ start: startMinutes * MIN, end: null }],
  rev,
});

describe("rowToSleep", () => {
  it("reads stretches, close time, rev and the last change as milliseconds", () => {
    const s = rowToSleep(
      row({
        segments: [
          { start: "2026-10-16T17:20:00.000Z", end: "2026-10-16T17:50:00.000Z" },
          { start: "2026-10-16T18:00:00.000Z", end: null },
        ],
        rev: 4,
        last_by: "jen",
        last_action: "resume",
        last_at: "2026-10-16T18:00:00+00:00",
        notes: "fed first",
      }),
    );
    expect(s).toEqual({
      id: "s1",
      by: "joseph",
      stretches: [
        { start: Date.parse("2026-10-16T17:20:00Z"), end: Date.parse("2026-10-16T17:50:00Z") },
        { start: Date.parse("2026-10-16T18:00:00Z"), end: null },
      ],
      closedAt: null,
      rev: 4,
      last: { by: "jen", action: "resume", at: Date.parse("2026-10-16T18:00:00Z") },
      notes: "fed first",
    });
  });

  it("reads a close time", () => {
    const s = rowToSleep(
      row({
        segments: [{ start: "2026-10-16T17:20:00.000Z", end: "2026-10-16T17:50:00.000Z" }],
        closed_at: "2026-10-16T17:50:00+00:00",
      }),
    );
    expect(s.closedAt).toBe(Date.parse("2026-10-16T17:50:00Z"));
  });
});

describe("which copy of a sleep wins", () => {
  it("adds a sleep we have not seen, newest first", () => {
    const list = applySleep([sleepAt("a", 10)], sleepAt("b", 20));
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("replaces a sleep with a newer rev", () => {
    const list = applySleep([sleepAt("a", 10, 1)], sleepAt("a", 10, 2));
    expect(list[0].rev).toBe(2);
  });

  it("keeps what we hold when the incoming copy is older (a late poll)", () => {
    const held = [sleepAt("a", 10, 3)];
    expect(applySleep(held, sleepAt("a", 10, 2))).toBe(held);
  });

  it("takes an equal rev: a note or who-pill change does not bump it", () => {
    const incoming = { ...sleepAt("a", 10, 2), notes: "new note" };
    expect(applySleep([sleepAt("a", 10, 2)], incoming)[0].notes).toBe("new note");
  });

  it("drops a sleep, and returns the same list when it was not there", () => {
    const list = [sleepAt("a", 10), sleepAt("b", 20)];
    expect(dropSleep(list, "a").map((s) => s.id)).toEqual(["b"]);
    expect(dropSleep(list, "zzz")).toBe(list);
  });
});

describe("parseReply", () => {
  const now = "2026-10-16T17:30:00.000Z";

  it("reads an ok reply with the server's clock", () => {
    const r = parseReply({ status: "ok", now, sleep: row() });
    expect(r).toMatchObject({ status: "ok", now: Date.parse(now) });
    expect(r.status === "ok" && r.sleep.id).toBe("s1");
  });

  it("reads a conflict and why", () => {
    const stale = parseReply({ status: "conflict", reason: "stale", now, sleep: row() });
    expect(stale).toMatchObject({ status: "conflict", reason: "stale" });
    const auto = parseReply({ status: "conflict", reason: "autoclosed", now, sleep: row() });
    expect(auto).toMatchObject({ status: "conflict", reason: "autoclosed" });
  });

  it("reads open_exists and gone", () => {
    expect(parseReply({ status: "open_exists", now, sleep: row() }).status).toBe("open_exists");
    expect(parseReply({ status: "gone", now })).toEqual({ status: "gone", now: Date.parse(now) });
  });

  it("turns a rule error into the same SleepError the engine throws", () => {
    const r = parseReply({
      status: "error",
      code: "overlap",
      now,
      sleep: row(),
      other: row({ id: "s0" }),
    });
    expect(r.status === "error" && r.error.code).toBe("overlap");
    expect(r.status === "error" && r.error.data.other?.id).toBe("s0");

    const limited = parseReply({
      status: "error",
      code: "before-prev",
      now,
      limit: "2026-10-16T16:40:00.000Z",
    });
    expect(limited.status === "error" && limited.error.data.limit).toBe(
      Date.parse("2026-10-16T16:40:00Z"),
    );

    const reopen = parseReply({ status: "error", code: "no-reopen", reason: "newer", now, sleep: row() });
    expect(reopen.status === "error" && reopen.error.data.reason).toBe("newer");
  });

  it("refuses something it does not understand rather than guessing", () => {
    expect(() => parseReply({ status: "ok" })).toThrow(SleepServerError);
    expect(() => parseReply(null)).toThrow(SleepServerError);
  });
});

describe("telling a dropped connection from an answer we can't use", () => {
  it("recognises what supabase-js says when the fetch itself failed", () => {
    expect(isNetworkFailure("TypeError: Failed to fetch")).toBe(true);
    expect(isNetworkFailure("TypeError: Load failed")).toBe(true);
    expect(isNetworkFailure("NetworkError when attempting to fetch resource.")).toBe(true);
  });

  it("does not call a server answer a network problem", () => {
    expect(isNetworkFailure("Could not find the function public.start_sleep in the schema cache")).toBe(false);
    expect(isNetworkFailure("permission denied for table sleeps")).toBe(false);
  });
});

describe("conflictError", () => {
  it("says who changed it, how and when", () => {
    const s = rowToSleep(row({ last_by: "jen", last_action: "pause", last_at: "2026-10-16T18:08:00+00:00" }));
    const err = conflictError("stale", s);
    expect(err.code).toBe("stale");
    expect(err.data).toEqual({ by: "jen", action: "pause", at: Date.parse("2026-10-16T18:08:00Z") });
  });

  it("says when a paused sleep closed itself", () => {
    const s = rowToSleep(
      row({ segments: [{ start: "2026-10-16T09:00:00.000Z", end: "2026-10-16T10:00:00.000Z" }] }),
    );
    const err = conflictError("autoclosed", s);
    expect(err.code).toBe("autoclosed");
    expect(err.data.at).toBe(Date.parse("2026-10-16T13:00:00Z"));
  });
});

describe("the server clock", () => {
  afterEach(() => {
    resetServerClock();
    vi.useRealTimers();
  });

  it("corrects a phone whose clock is wrong", () => {
    vi.useFakeTimers();
    // the phone thinks it is 18:00; the server says 18:20
    vi.setSystemTime(new Date("2026-10-16T18:00:00Z"));
    syncServerClock(Date.parse("2026-10-16T18:20:00Z"), Date.now(), Date.now());
    expect(serverNow()).toBe(Date.parse("2026-10-16T18:20:00Z"));
    vi.advanceTimersByTime(95 * MIN);
    expect(serverNow()).toBe(Date.parse("2026-10-16T19:55:00Z"));
  });

  it("splits a slow round trip rather than trusting either end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T18:00:00Z"));
    const sentAt = Date.now();
    vi.advanceTimersByTime(2000); // the reply takes 2 s
    syncServerClock(Date.parse("2026-10-16T18:00:01Z"), sentAt, Date.now());
    expect(serverNow()).toBe(Date.parse("2026-10-16T18:00:02Z"));
  });

  it("ignores a reply with no usable time", () => {
    syncServerClock(NaN, 0, 0);
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50);
  });
});

describe("removePause", () => {
  const reply = (over: object) => ({
    data: { now: "2026-10-16T17:20:00.000Z", ...over },
    error: null,
  });

  function api(result: ReturnType<typeof reply>) {
    const rpc = vi.fn().mockResolvedValue(result);
    return { rpc, api: sleepApi({ rpc } as unknown as SupabaseClient<Database>) };
  }

  it("sends the rev on screen and the stretch before the pause", async () => {
    const { rpc, api: a } = api(reply({ status: "ok", sleep: row({ id: "s9", rev: 8 }) }));
    const held: Sleep = { ...rowToSleep(row({ id: "s9" })), rev: 7 };
    const out = await a.removePause(held, 1);
    expect(rpc).toHaveBeenCalledWith("remove_sleep_pause", { p_id: "s9", p_rev: 7, p_index: 1 });
    expect(out.status === "ok" && out.sleep.rev).toBe(8);
  });

  it("reads a pause that is not there as a rule error, with the sleep as it now is", async () => {
    const { api: a } = api(reply({ status: "error", code: "no-pause", sleep: row({ rev: 8 }) }));
    const out = await a.removePause(rowToSleep(row()), 4);
    expect(out.status).toBe("error");
    if (out.status === "error") {
      expect(out.error.code).toBe("no-pause");
      expect(out.sleep?.rev).toBe(8);
    }
  });

  it("reads a finished sleep as a conflict", async () => {
    const { api: a } = api(
      reply({
        status: "conflict",
        reason: "stale",
        sleep: row({ closed_at: "2026-10-16T17:20:00.000Z", last_action: "finish" }),
      }),
    );
    const out = await a.removePause(rowToSleep(row()), 0);
    expect(out.status === "conflict" && out.reason).toBe("stale");
  });

  it("calls a function the database doesn't have an answer we can't use, not a dropped connection", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.remove_sleep_pause in the schema cache" },
    });
    const a = sleepApi({ rpc } as unknown as SupabaseClient<Database>);
    await expect(a.removePause(rowToSleep(row()), 0)).rejects.toBeInstanceOf(SleepServerError);
  });
});

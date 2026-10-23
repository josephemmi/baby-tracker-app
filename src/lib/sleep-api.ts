// Between Supabase and the pure rules in sleep.ts: turning rows into Sleeps,
// turning the sleep functions' replies into something the UI can switch on,
// and the rule for which copy of a sleep wins when several arrive at once
// (an action's own reply, a realtime event, a poll).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { syncServerClock } from "@/lib/server-clock";
import {
  SLEEP_RULES,
  SleepError,
  firstStart,
  lastStretch,
  type Sleep,
  type SleepAction,
  type SleepErrorCode,
  type SleepErrorData,
  type EditRule,
} from "@/lib/sleep";
import type { EditModel } from "@/lib/sleep-edit";

export type SleepRow = Database["public"]["Tables"]["sleeps"]["Row"];

export function rowToSleep(row: SleepRow): Sleep {
  return {
    id: row.id,
    by: row.logged_by,
    stretches: row.segments.map((g) => ({
      start: Date.parse(g.start),
      end: g.end == null ? null : Date.parse(g.end),
    })),
    closedAt: row.closed_at == null ? null : Date.parse(row.closed_at),
    rev: row.rev,
    last: {
      by: row.last_by,
      action: row.last_action as SleepAction,
      at: Date.parse(row.last_at),
    },
    notes: row.notes,
  };
}

/* ---------- which copy wins ---------- */

export const newestFirst = (sleeps: Sleep[]): Sleep[] =>
  [...sleeps].sort((a, b) => firstStart(b) - firstStart(a));

// A sleep arriving from anywhere replaces what we hold unless what we hold is
// newer: replies, realtime events and polls all race, and a poll that left
// before an action but lands after it must not roll the screen back. Equal
// revs mean a note or who-pill change, which doesn't bump the rev — take it.
export function applySleep(sleeps: Sleep[], incoming: Sleep): Sleep[] {
  const held = sleeps.find((s) => s.id === incoming.id);
  if (!held) return newestFirst([...sleeps, incoming]);
  if (held.rev > incoming.rev) return sleeps;
  return newestFirst(sleeps.map((s) => (s.id === incoming.id ? incoming : s)));
}

export const dropSleep = (sleeps: Sleep[], id: string): Sleep[] =>
  sleeps.some((s) => s.id === id) ? sleeps.filter((s) => s.id !== id) : sleeps;

/* ---------- failures ---------- */

// The server answered, but not with anything usable: a function that isn't
// there (the migration hasn't been applied), a refused call, a reply we don't
// recognise. Different from the network dropping, which the user can retry.
export class SleepServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SleepServerError";
  }
}

// supabase-js reports a failed fetch as an `error` whose message names it.
export const isNetworkFailure = (message: string): boolean =>
  /failed to fetch|fetch failed|load failed|network|disconnected|aborted/i.test(message);

/* ---------- replies ---------- */

export type SleepReply =
  | { status: "ok"; sleep: Sleep; now: number }
  // Someone else changed it first (stale), or it closed itself (autoclosed).
  | { status: "conflict"; reason: "stale" | "autoclosed"; sleep: Sleep; now: number }
  // Start / reopen while another sleep is open.
  | { status: "open_exists"; sleep: Sleep; now: number }
  // Deleted (or never there).
  | { status: "gone"; now: number }
  // A rule said no: not in the future, no overlap, ...
  | { status: "error"; error: SleepError; sleep: Sleep | null; now: number };

interface RawReply {
  status?: string;
  now?: string;
  sleep?: SleepRow;
  reason?: string;
  code?: string;
  rule?: string;
  field?: string;
  n?: number;
  other?: SleepRow;
  limit?: string;
  stretchStart?: string;
}

const ms = (iso: string | undefined) => (iso == null ? undefined : Date.parse(iso));

// What the stale / auto-closed sentences are built from.
export function conflictError(reason: "stale" | "autoclosed", sleep: Sleep): SleepError {
  if (reason === "autoclosed") {
    return new SleepError("autoclosed", {
      at: (lastStretch(sleep).end ?? sleep.last.at) + SLEEP_RULES.autoCloseMs,
    });
  }
  return new SleepError("stale", {
    by: sleep.last.by,
    action: sleep.last.action,
    at: sleep.last.at,
  });
}

// Who deleted a sleep and when: the part a "gone" answer leaves out.
export interface Deletion {
  by: string | null;
  at: number;
}

// What to say about a sleep that has gone. When we know who deleted it, the
// same sentence as for every other first-write-wins loss ("Jen already deleted
// this sleep (6:08 pm)."); when we don't, the plain one.
export function goneError(deletion: Deletion | null): SleepError {
  return deletion
    ? new SleepError("stale", { by: deletion.by, action: "delete", at: deletion.at })
    : new SleepError("gone");
}

export function parseReply(json: unknown): SleepReply {
  const raw = (json ?? {}) as RawReply;
  const now = Date.parse(raw.now ?? "");
  const sleep = raw.sleep ? rowToSleep(raw.sleep) : null;

  switch (raw.status) {
    case "ok":
      if (sleep) return { status: "ok", sleep, now };
      break;
    case "conflict":
      if (sleep) {
        const reason = raw.reason === "autoclosed" ? "autoclosed" : "stale";
        return { status: "conflict", reason, sleep, now };
      }
      break;
    case "open_exists":
      if (sleep) return { status: "open_exists", sleep, now };
      break;
    case "gone":
      return { status: "gone", now };
    case "error": {
      const data: SleepErrorData = {
        n: raw.n,
        other: raw.other ? rowToSleep(raw.other) : undefined,
        limit: ms(raw.limit),
        stretchStart: ms(raw.stretchStart),
        rule: raw.rule as EditRule | undefined,
        field: raw.field,
      };
      return {
        status: "error",
        error: new SleepError((raw.code ?? "bad-time") as SleepErrorCode, data),
        sleep,
        now,
      };
    }
  }
  throw new SleepServerError(`unexpected reply: ${JSON.stringify(json)}`);
}

/* ---------- calls ---------- */

type Rpc = PromiseLike<{ data: unknown; error: { message: string } | null }>;

// Times the call and keeps the server-clock correction up to date.
async function timed(call: () => Rpc): Promise<unknown> {
  const sentAt = Date.now();
  const { data, error } = await call();
  const receivedAt = Date.now();
  if (error) {
    throw isNetworkFailure(error.message) ? new Error(error.message) : new SleepServerError(error.message);
  }
  const now = Date.parse((data as RawReply | null)?.now ?? "");
  syncServerClock(now, sentAt, receivedAt);
  return data;
}

async function action(call: () => Rpc): Promise<SleepReply> {
  return parseReply(await timed(call));
}

export function sleepApi(supabase: SupabaseClient<Database>) {
  return {
    start: (babyId: string, loggedBy: string | null) =>
      action(() => supabase.rpc("start_sleep", { p_baby_id: babyId, p_logged_by: loggedBy })),
    pause: (s: Sleep) => action(() => supabase.rpc("pause_sleep", { p_id: s.id, p_rev: s.rev })),
    resume: (s: Sleep) => action(() => supabase.rpc("resume_sleep", { p_id: s.id, p_rev: s.rev })),
    stop: (s: Sleep) => action(() => supabase.rpc("stop_sleep", { p_id: s.id, p_rev: s.rev })),
    remove: (s: Sleep) => action(() => supabase.rpc("delete_sleep", { p_id: s.id, p_rev: s.rev })),
    restore: (id: string) => action(() => supabase.rpc("restore_sleep", { p_id: id })),
    // Edit times (JOS-103): the whole set of times in one atomic, rev-checked
    // write. `expectedRev` is the rev the sheet was opened on, not necessarily
    // the one on screen now: if the sleep has moved on the answer is a conflict
    // and nothing is saved.
    editTimes: (s: Sleep, expectedRev: number, model: EditModel) =>
      action(() =>
        supabase.rpc("edit_sleep_times", {
          p_id: s.id,
          p_rev: expectedRev,
          p_start: new Date(model.start).toISOString(),
          p_end: model.end == null ? null : new Date(model.end).toISOString(),
          p_pauses: model.pauses.map((p) => ({
            start: new Date(p.start).toISOString(),
            end: p.end == null ? null : new Date(p.end).toISOString(),
          })),
        }),
      ),
    // `index` is the 0-based number of the stretch before the pause. The rev
    // is the one on screen, so a stale index can never hit another pause.
    removePause: (s: Sleep, index: number) =>
      action(() =>
        supabase.rpc("remove_sleep_pause", { p_id: s.id, p_rev: s.rev, p_index: index }),
      ),
    // The sleep functions answer "gone" without saying why. The row does: a
    // household member may read its deleted sleeps (that is what Recently
    // Deleted does), so ask it who deleted this one and when. Null when it is
    // not deleted, was never there, or can't be read.
    async deletion(id: string): Promise<Deletion | null> {
      const { data } = await supabase
        .from("sleeps")
        .select("deleted_at, deleted_by")
        .eq("id", id)
        .maybeSingle();
      return data?.deleted_at ? { by: data.deleted_by, at: Date.parse(data.deleted_at) } : null;
    },
    // Home's read: the server's clock and every sleep still of interest.
    async fetch(babyId: string, sinceISO: string): Promise<{ now: number; sleeps: Sleep[] }> {
      const data = (await timed(() =>
        supabase.rpc("get_sleeps", { p_baby_id: babyId, p_since: sinceISO }),
      )) as { now: string; sleeps: SleepRow[] };
      return { now: Date.parse(data.now), sleeps: newestFirst(data.sleeps.map(rowToSleep)) };
    },
  };
}

export type SleepApi = ReturnType<typeof sleepApi>;

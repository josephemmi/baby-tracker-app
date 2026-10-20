"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { homeFetchWindowStartISO } from "@/lib/entries";
import { serverNow } from "@/lib/server-clock";
import { SleepError, type Sleep, type SleepField } from "@/lib/sleep";
import {
  applySleep,
  conflictError,
  dropSleep,
  goneError,
  newestFirst,
  rowToSleep,
  sleepApi,
  SleepServerError,
  type SleepReply,
  type SleepRow,
  type SleepTimeInput,
} from "@/lib/sleep-api";
import { describeSleepError, deviceZone } from "@/lib/sleep-format";

export interface SleepOutcome {
  ok: boolean;
  // Which kind of answer this was; "offline" is a call that never got one.
  status: SleepReply["status"] | "offline";
  // What to tell the user when something other than plain success needs
  // saying: the other parent got there first, a rule said no, the network
  // dropped.
  message: string | null;
  // The sleep the answer was about, as the server now has it.
  sleep: Sleep | null;
}

interface UseSleepsOptions {
  babyId: string;
  initialRows: SleepRow[];
  memberNames: Record<string, string>;
  onMessage: (text: string) => void;
}

// Same idea as log-matrix.tsx's logMutationFailure: a thrown error (a dropped
// connection, say) is otherwise invisible.
function logSleepFailure(what: string, error: unknown) {
  console.error("[sleeps] failed", {
    what,
    error,
    online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    timestamp: new Date().toISOString(),
  });
}

const OFFLINE = "Couldn't reach the server. Try again.";

// A dropped connection is worth retrying; an answer we couldn't use (the
// database not set up for sleep yet, say) is not, so don't call it "offline".
function failureMessage(error: unknown): string {
  return error instanceof SleepServerError
    ? `Something went wrong saving that (${error.message}).`
    : OFFLINE;
}

// Home's sleeps: kept in sync with the database the same way `entries` is,
// because the whole point is that the other parent's phone or iPad shows the
// same sleep.
//
// - Realtime on `sleeps-${babyId}` (INSERT / UPDATE / DELETE).
// - Belt and braces, as for entries (see log-matrix.tsx): iOS home-screen
//   apps silently drop realtime in the background, so also refetch on every
//   "we're back" signal and poll while visible. A refetch is also how the
//   device's clock gets re-corrected against the server's.
// - A remote change REPLACES the local copy; the one-second tick only redraws
//   the timer from the stored times, so two phones can never drift apart.
// - Every action is conditional on the rev the user was looking at. When
//   someone else got there first the answer carries their version, which is
//   applied immediately and explained ("Jen already paused this sleep").
export function useSleeps({ babyId, initialRows, memberNames, onMessage }: UseSleepsOptions) {
  const [sleeps, setSleeps] = useState<Sleep[]>(() =>
    newestFirst(initialRows.map(rowToSleep)),
  );
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  // Bumped whenever a newer copy of anything lands (an action's answer, a
  // realtime event). A poll that was already in flight then knows it is out
  // of date and doesn't paint over the top.
  const writes = useRef(0);
  const lastRefetchAt = useRef(0);
  const namesRef = useRef(memberNames);
  const messageRef = useRef(onMessage);

  useEffect(() => {
    namesRef.current = memberNames;
    messageRef.current = onMessage;
  });

  const api = useMemo(() => sleepApi(createClient()), []);

  const describe = useCallback(
    (error: SleepError) =>
      describeSleepError(error, deviceZone(), serverNow(), (id) => {
        return (id && namesRef.current[id]) || "Someone";
      }),
    [],
  );

  useEffect(() => {
    const supabase = createClient();
    const fetcher = sleepApi(supabase);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    lastRefetchAt.current = Date.now();

    function onRow(raw: unknown) {
      const row = raw as SleepRow;
      writes.current += 1;
      // Soft-deleted here or on another device: off the Log.
      setSleeps((prev) =>
        row.deleted_at ? dropSleep(prev, row.id) : applySleep(prev, rowToSleep(row)),
      );
    }

    function subscribe() {
      const filter = `baby_id=eq.${babyId}`;
      channel = supabase
        .channel(`sleeps-${babyId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "sleeps", filter }, (p) =>
          onRow(p.new),
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sleeps", filter }, (p) =>
          onRow(p.new),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "sleeps", filter }, (p) => {
          const id = (p.old as Partial<SleepRow>).id;
          if (!id) return;
          writes.current += 1;
          setSleeps((prev) => dropSleep(prev, id));
        })
        .subscribe();
    }

    subscribe();

    async function refetch() {
      lastRefetchAt.current = Date.now();
      const stamp = writes.current;
      try {
        const { sleeps: fetched } = await fetcher.fetch(babyId, homeFetchWindowStartISO());
        // Something newer landed while this was on its way: skip it, the next
        // poll will reconcile.
        if (writes.current !== stamp) return;
        setSleeps(fetched);
      } catch (error) {
        logSleepFailure("refetch", error);
      }
    }

    // On mount too: the first answer is what corrects the timer against the
    // server's clock.
    refetch();

    // See the long comment in log-matrix.tsx for why there are four of these.
    function handleForeground() {
      if (document.visibilityState !== "visible") return;
      refetch();
      if (channel) supabase.removeChannel(channel);
      subscribe();
    }

    document.addEventListener("visibilitychange", handleForeground);
    window.addEventListener("pageshow", handleForeground);
    window.addEventListener("focus", handleForeground);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, 10_000);

    function handleInteraction() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefetchAt.current > 5_000) refetch();
    }
    document.addEventListener("pointerdown", handleInteraction, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", handleForeground);
      window.removeEventListener("pageshow", handleForeground);
      window.removeEventListener("focus", handleForeground);
      document.removeEventListener("pointerdown", handleInteraction);
      window.clearInterval(pollId);
      if (channel) supabase.removeChannel(channel);
    };
  }, [babyId]);

  const run = useCallback(
    async (
      key: string,
      call: () => Promise<SleepReply>,
      options: { drop?: boolean } = {},
    ): Promise<SleepOutcome> => {
      setPending((prev) => new Set(prev).add(key));
      try {
        const reply = await call();
        writes.current += 1;
        switch (reply.status) {
          case "ok":
            setSleeps((prev) =>
              options.drop ? dropSleep(prev, reply.sleep.id) : applySleep(prev, reply.sleep),
            );
            return { ok: true, status: "ok", message: null, sleep: reply.sleep };
          case "conflict":
            setSleeps((prev) => applySleep(prev, reply.sleep));
            return {
              ok: false,
              status: "conflict",
              message: describe(conflictError(reply.reason, reply.sleep)),
              sleep: reply.sleep,
            };
          case "open_exists":
            setSleeps((prev) => applySleep(prev, reply.sleep));
            return {
              ok: false,
              status: "open_exists",
              message: describe(new SleepError("already-open", { other: reply.sleep })),
              sleep: reply.sleep,
            };
          case "gone": {
            setSleeps((prev) => dropSleep(prev, key));
            // The answer doesn't say why it's gone; the row does, so the loser
            // of a delete race is told who got there first. If that can't be
            // read, the plain wording is still true.
            const deletion = await api.deletion(key).catch(() => null);
            return {
              ok: false,
              status: "gone",
              message: describe(goneError(deletion)),
              sleep: null,
            };
          }
          case "error":
            if (reply.sleep) {
              const held = reply.sleep;
              setSleeps((prev) => applySleep(prev, held));
            }
            return {
              ok: false,
              status: "error",
              message: describe(reply.error),
              sleep: reply.sleep,
            };
        }
      } catch (error) {
        logSleepFailure(key, error);
        return {
          ok: false,
          status: "offline",
          message: failureMessage(error),
          sleep: null,
        };
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [describe, api],
  );

  const start = useCallback(
    (loggedBy: string | null) => run("new", () => api.start(babyId, loggedBy)),
    [run, api, babyId],
  );
  const pause = useCallback((s: Sleep) => run(s.id, () => api.pause(s)), [run, api]);
  const resume = useCallback((s: Sleep) => run(s.id, () => api.resume(s)), [run, api]);
  const stop = useCallback((s: Sleep) => run(s.id, () => api.stop(s)), [run, api]);
  const reopen = useCallback((s: Sleep) => run(s.id, () => api.reopen(s)), [run, api]);
  const remove = useCallback(
    (s: Sleep) => run(s.id, () => api.remove(s), { drop: true }),
    [run, api],
  );
  const setTime = useCallback(
    (s: Sleep, field: SleepField, input: SleepTimeInput) =>
      run(s.id, () => api.setTime(s, field, input)),
    [run, api],
  );

  const removePause = useCallback(
    (s: Sleep, index: number) => run(s.id, () => api.removePause(s, index)),
    [run, api],
  );

  // The note and the who-pill are the two things a member may edit on the row
  // directly; neither changes the sleep's state, so neither bumps its rev.
  const updateColumn = useCallback(
    async (s: Sleep, column: "notes" | "logged_by", value: string | null) => {
      const patch = column === "notes" ? { notes: value } : { logged_by: value };
      try {
        const { error } = await createClient().from("sleeps").update(patch).eq("id", s.id);
        if (error) {
          messageRef.current(error.message);
          return;
        }
        writes.current += 1;
        setSleeps((prev) =>
          prev.map((x) =>
            x.id === s.id ? (column === "notes" ? { ...x, notes: value } : { ...x, by: value }) : x,
          ),
        );
      } catch (error) {
        logSleepFailure(column, error);
        messageRef.current(failureMessage(error));
      }
    },
    [],
  );
  const setNotes = useCallback(
    (s: Sleep, notes: string | null) => updateColumn(s, "notes", notes),
    [updateColumn],
  );
  const setLoggedBy = useCallback(
    (s: Sleep, memberId: string) => updateColumn(s, "logged_by", memberId),
    [updateColumn],
  );

  return {
    sleeps,
    pending,
    start,
    pause,
    resume,
    stop,
    reopen,
    remove,
    setTime,
    removePause,
    setNotes,
    setLoggedBy,
  };
}

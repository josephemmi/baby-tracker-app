"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { homeFetchWindowStartISO } from "@/lib/entries";
import type { Sleep } from "@/lib/sleep";
import { rowToSleep, sleepApi } from "@/lib/sleep-api";

// PostgREST caps every response at 1000 rows however it is ordered, so an
// unpaged read of a baby's history quietly drops the newest (see fetchAllEntries).
const PAGE = 1000;

// Sleeps that began from `fromMs` (null: from the beginning) up to `untilISO`,
// oldest first, a page at a time. Deleted sleeps are left out.
async function fetchOlder(
  supabase: SupabaseClient<Database>,
  babyId: string,
  fromMs: number | null,
  untilISO: string,
): Promise<Sleep[]> {
  const out: Sleep[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let query = supabase
      .from("sleeps")
      .select("*")
      .eq("baby_id", babyId)
      .is("deleted_at", null)
      .lt("started_at", untilISO);
    if (fromMs != null) query = query.gte("started_at", new Date(fromMs).toISOString());
    const { data, error } = await query
      .order("started_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map(rowToSleep));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function merge(older: Sleep[], recent: Sleep[]): Sleep[] {
  const byId = new Map<string, Sleep>();
  for (const s of older) byId.set(s.id, s);
  // The recent read is the fresh one, so it wins for any sleep in both.
  for (const s of recent) byId.set(s.id, s);
  return [...byId.values()];
}

const POLL_MS = 20_000;
// Old sleeps almost never change, so they are re-read now and then, not on
// every poll.
const HISTORY_MS = 5 * 60_000;

export interface SleepReportData {
  sleeps: Sleep[];
  // A read has landed: the recent sleeps (the Today card) are here.
  ready: boolean;
  // The sleeps for the range asked for are here too. False until the first
  // read lands, and again when the range changes to one that reaches further
  // back than the last read did.
  covered: boolean;
  // The first read failed; later failures keep showing what we have.
  failed: boolean;
}

interface State {
  sleeps: Sleep[];
  // How far back the read went (null: everything), or undefined before any read.
  from: number | null | undefined;
  failed: boolean;
}

// The sleeps the Sleep tab draws, kept fresh the way Home keeps its own:
// realtime, every "we're back" signal, and a poll.
//
// Two reads, so nothing the screen shows can be cut short:
//  - the recent ones (72 h, and any sleep still open) through get_sleeps, the
//    call Home makes. Its answer carries the server's clock, so the Today card
//    reads the same "now" as the sleep cards even when this page is the first
//    thing opened;
//  - everything older, from `fromMs`, straight from the table (the household
//    may read it), paged. get_sleeps is capped at 200 rows, which is not
//    enough for "All time".
export function useSleepReport(babyId: string, fromMs: number | null): SleepReportData {
  const [state, setState] = useState<State>({ sleeps: [], from: undefined, failed: false });

  useEffect(() => {
    const supabase = createClient();
    const api = sleepApi(supabase);
    let cancelled = false;
    let older: Sleep[] = [];
    let recent: Sleep[] = [];
    let recentSince = homeFetchWindowStartISO();
    let historyAt = 0;
    let lastRefetchAt = 0;
    let debounce: number | undefined;

    const publish = () => {
      if (!cancelled) setState({ sleeps: merge(older, recent), from: fromMs, failed: false });
    };
    const fail = (what: string, error: unknown) => {
      console.error("[sleep-report] failed", {
        what,
        error,
        online: typeof navigator === "undefined" ? undefined : navigator.onLine,
        timestamp: new Date().toISOString(),
      });
      if (!cancelled) setState((prev) => ({ ...prev, failed: prev.from === undefined }));
    };

    async function refetchRecent() {
      lastRefetchAt = Date.now();
      try {
        const reply = await api.fetch(babyId, recentSince);
        if (cancelled) return;
        recent = reply.sleeps;
        publish();
      } catch (error) {
        fail("recent", error);
      }
    }

    async function refetchHistory() {
      historyAt = Date.now();
      lastRefetchAt = historyAt;
      // The boundary moves with the clock; both reads use the new one together
      // so a sleep is always in one of them.
      const since = homeFetchWindowStartISO();
      try {
        const [olderRows, reply] = await Promise.all([
          fetchOlder(supabase, babyId, fromMs, since),
          api.fetch(babyId, since),
        ]);
        if (cancelled) return;
        recentSince = since;
        older = olderRows;
        recent = reply.sleeps;
        publish();
      } catch (error) {
        fail("history", error);
      }
    }

    refetchHistory();

    // A burst of changes (start, then pause, then stop) is one refetch.
    const channel = supabase
      .channel(`sleep-report-${babyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sleeps", filter: `baby_id=eq.${babyId}` },
        () => {
          window.clearTimeout(debounce);
          debounce = window.setTimeout(refetchRecent, 300);
        },
      )
      .subscribe();

    function handleForeground() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - historyAt > 60_000) refetchHistory();
      else refetchRecent();
    }
    document.addEventListener("visibilitychange", handleForeground);
    window.addEventListener("pageshow", handleForeground);
    window.addEventListener("focus", handleForeground);

    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - historyAt > HISTORY_MS) refetchHistory();
      else refetchRecent();
    }, POLL_MS);

    // Same iOS-PWA fallback as Home: a resumed standalone app can fail to fire
    // any lifecycle event, but the user will still touch the screen.
    function handleInteraction() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefetchAt > 5_000) refetchRecent();
    }
    document.addEventListener("pointerdown", handleInteraction, { passive: true });

    return () => {
      cancelled = true;
      window.clearTimeout(debounce);
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", handleForeground);
      window.removeEventListener("pageshow", handleForeground);
      window.removeEventListener("focus", handleForeground);
      document.removeEventListener("pointerdown", handleInteraction);
      supabase.removeChannel(channel);
    };
  }, [babyId, fromMs]);

  // A read from further back covers any range that starts later.
  const covered =
    state.from !== undefined && (state.from === null || (fromMs !== null && state.from <= fromMs));
  return { sleeps: state.sleeps, ready: state.from !== undefined, covered, failed: state.failed };
}

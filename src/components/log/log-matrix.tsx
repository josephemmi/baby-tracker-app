"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  createDraftMoment,
  groupEntriesIntoMoments,
  mergeMoments,
  partitionHomeMoments,
  siblingIds,
  homeFetchWindowStartISO,
  HOME_ROW_SAFETY_CAP,
  type EntryRow,
  type Moment,
} from "@/lib/entries";
import type { EntryType } from "@/lib/supabase/database.types";
import { GlanceCards } from "@/components/log/glance-cards";
import { MomentsTable, type MomentGroup } from "@/components/log/moments-table";
import { PrimaryButton } from "@/components/ui/primary-button";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { canEndBreastSession } from "@/lib/breastfeed-timer";
import type { BreastSide } from "@/lib/supabase/database.types";
import { serverNow } from "@/lib/server-clock";
import {
  filedAt,
  firstStart,
  stateOf,
  underMinute,
  type Sleep,
  type SleepField,
} from "@/lib/sleep";
import type { SleepRow, SleepTimeInput } from "@/lib/sleep-api";
import {
  bulkDeletePrompt,
  bulkSleepFailure,
  deleteSleepPrompt,
  deviceZone,
  sleepSelectKey,
  type SleepPrompt,
} from "@/lib/sleep-format";
import { useIsClient } from "@/lib/use-is-client";
import { useMediaQuery } from "@/lib/use-media-query";
import { LiveSleepCard } from "@/components/log/sleep-card";
import { ShortSleepDialog } from "@/components/log/short-sleep-dialog";
import { useSleeps, type SleepOutcome } from "@/components/log/use-sleeps";

interface Member {
  id: string;
  name: string;
}

// JOS-41 diagnostics: mutations here surface Postgrest errors via a
// returned `{ error }` (handled by each call site's own `if (error)`
// check below), but a thrown exception — e.g. the reported
// "TypeError: Failed to fetch" — bypasses that entirely and fails
// silently with no indication of which handler or call was in flight.
// This logs enough to identify the failing call the next time it
// happens; it's diagnostic only; the actual fetch-failure root cause is
// still unconfirmed and intentionally not addressed here.
function logMutationFailure(handler: string, error: unknown) {
  console.error("[log-matrix] mutation failed", {
    handler,
    error,
    online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    timestamp: new Date().toISOString(),
  });
}

// One thing on Home's day-by-day list: a moment, or (JOS-56) a sleep.
type HomeItem =
  | { kind: "moment"; moment: Moment; timestamp: string }
  | { kind: "sleep"; sleep: Sleep; timestamp: string };

const NO_SLEEPS: Sleep[] = [];

function splitItems(items: HomeItem[]) {
  return {
    moments: items.flatMap((item) => (item.kind === "moment" ? [item.moment] : [])),
    // Newest first by when each began — the order interleaveByTime and the
    // wide stack both read them in. (`items` is ordered by when each was filed,
    // which for a sleep that is going is "now".)
    sleeps: items
      .flatMap((item) => (item.kind === "sleep" ? [item.sleep] : []))
      .sort((a, b) => firstStart(b) - firstStart(a)),
  };
}

interface LogMatrixProps {
  babyId: string;
  currentUserId: string;
  members: Member[];
  initialEntries: EntryRow[];
  hasMoreEntries?: boolean;
  initialSleeps?: SleepRow[];
}

export function LogMatrix({
  babyId,
  currentUserId,
  members,
  initialEntries,
  hasMoreEntries = false,
  initialSleeps = [],
}: LogMatrixProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [drafts, setDrafts] = useState<Moment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  // Edit mode's ticks: moment keys, and sleeps by sleepSelectKey (JOS-92).
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<{
    moments: Moment[];
    // The sleeps as they were when Delete (n) was tapped, each deleted on that
    // version (see confirmSleepDelete).
    sleeps: Sleep[];
    title: string;
    body: string;
    clearSelection: boolean;
  } | null>(null);
  // A bulk delete is running: Delete (n) waits until it has finished.
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Whether there's anything beyond the currently-loaded fetch window
  // (JOS-21: the safety cap was hit, or real history exists older than the
  // window) — one of several inputs into whether Home's day-aware view
  // (below) has more to show.
  const [fetchTruncated, setFetchTruncated] = useState(hasMoreEntries);
  const lastRefetchAt = useRef(0);
  // Ticks slowly so the today/yesterday split (and GlanceCards-style
  // relative-time reads) can't go stale for a session left open across
  // midnight — matches GlanceCards' own ticking `now`.
  const [now, setNow] = useState(() => new Date());

  const memberNames = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.name])),
    [members],
  );

  const moments = useMemo(
    () => mergeMoments(drafts, groupEntriesIntoMoments(entries)),
    [drafts, entries],
  );

  // A short message at the bottom of the screen: the other parent got there
  // first, a sleep rule said no, the network dropped.
  // The text stays while it fades out, so the pill doesn't collapse to an
  // empty bar on the way.
  const [toast, setToast] = useState({ text: "", visible: false });
  const toastTimer = useRef<number | null>(null);
  // Inserts that have been sent but not answered (JOS-100). A second tap on
  // the same box while the first insert is in flight would add a second row
  // with the same baby, user, type and timestamp.
  const insertsInFlight = useRef(new Set<string>());
  const showToast = useCallback((text: string) => {
    setToast({ text, visible: true });
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(
      () => setToast((prev) => ({ ...prev, visible: false })),
      3200,
    );
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Sleeps (JOS-56): stored in the database and shared, so either parent sees
  // and controls the same one from any device. See use-sleeps.ts.
  const sleepCtl = useSleeps({
    babyId,
    initialRows: initialSleeps,
    memberNames,
    onMessage: showToast,
  });
  // Sleep cards show device-zone times and a live timer, which the server
  // can't render, so they appear once the page is running in the browser.
  const isClient = useIsClient();
  const sleepList = isClient ? sleepCtl.sleeps : NO_SLEEPS;
  const [sleepFlashId, setSleepFlashId] = useState<string | null>(null);
  const [shortDialog, setShortDialog] = useState<{ id: string; rev: number } | null>(null);
  // The sleep as it was on screen when Delete was tapped, with the words for
  // the box worked out then too: the box keeps saying what it said, and the
  // delete goes to the server with the rev the user was looking at.
  const [pendingSleepDelete, setPendingSleepDelete] = useState<{
    sleep: Sleep;
    prompt: SleepPrompt;
  } | null>(null);

  // The log the day sections are cut from: moments and sleeps together,
  // newest first. A sleep that is going (or was just reopened) is NOT pinned
  // above the rest: it is filed under Today (see filedAt) but sits among the
  // day's moments by when it began, so reopening a morning sleep leaves it in
  // the morning.
  const homeItems = useMemo<HomeItem[]>(() => {
    const momentItems = moments.map<HomeItem>((moment) => ({
      kind: "moment",
      moment,
      timestamp: moment.timestamp,
    }));
    // Sectioned by when each sleep ENDED (see filedAt); the card still shows,
    // and the phone list still orders by, when it began.
    const sleepItems = sleepList.map<HomeItem>((sleep) => ({
      kind: "sleep",
      sleep,
      timestamp: new Date(filedAt(sleep, now.getTime())).toISOString(),
    }));
    return [...momentItems, ...sleepItems].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
  }, [moments, sleepList, now]);

  // JOS-21: today's entries in full, plus the previous calendar day's last
  // 3 entries for continuity — everything older stays behind "View more".
  const homeSections = useMemo(
    () => partitionHomeMoments(homeItems, now, fetchTruncated),
    [homeItems, now, fetchTruncated],
  );

  const visibleMoments = useMemo(
    () => [
      ...homeSections.todayMoments,
      ...(homeSections.previousDay?.moments ?? []),
    ].flatMap((item) => (item.kind === "moment" ? [item.moment] : [])),
    [homeSections],
  );

  const momentGroups = useMemo<MomentGroup[]>(() => {
    const groups: MomentGroup[] = [
      {
        ...splitItems(homeSections.todayMoments),
        divider: homeSections.previousDay
          ? { label: homeSections.todayLabel }
          : undefined,
      },
    ];
    if (homeSections.previousDay) {
      groups.push({
        ...splitItems(homeSections.previousDay.moments),
        divider: { label: homeSections.previousDay.label },
        tail: true,
      });
    }
    return groups;
  }, [homeSections]);

  useEffect(() => {
    // The server-corrected clock (a no-op until a sleep reply has told us the
    // gap): which day a sleep sits under must agree with what the sleep cards
    // themselves show, and they read that clock.
    const interval = setInterval(() => setNow(new Date(serverNow())), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    lastRefetchAt.current = Date.now();

    function subscribe() {
      channel = supabase
        .channel(`entries-${babyId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "entries",
            filter: `baby_id=eq.${babyId}`,
          },
          (payload) => {
            const newEntry = payload.new as EntryRow;
            setEntries((prev) =>
              prev.some((entry) => entry.id === newEntry.id)
                ? prev
                : [newEntry, ...prev],
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "entries",
            filter: `baby_id=eq.${babyId}`,
          },
          (payload) => {
            const updated = payload.new as EntryRow;
            setEntries((prev) => {
              // Soft-deleted (here or on another device) — drop it from
              // Home's active view, same as if it had been hard-deleted.
              if (updated.deleted_at) {
                return prev.filter((entry) => entry.id !== updated.id);
              }
              if (prev.some((entry) => entry.id === updated.id)) {
                return prev.map((entry) => (entry.id === updated.id ? updated : entry));
              }
              // A restore for an entry not currently in view (e.g. it fell
              // outside the fetch window before being deleted) — insert it
              // back in chronological order; the next poll/refetch will
              // reconcile the exact window/ordering if this is imprecise.
              return [updated, ...prev].sort((a, b) =>
                b.timestamp.localeCompare(a.timestamp),
              );
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "entries",
            filter: `baby_id=eq.${babyId}`,
          },
          (payload) => {
            const removedId = (payload.old as Partial<EntryRow>).id;
            setEntries((prev) => prev.filter((entry) => entry.id !== removedId));
          },
        )
        .subscribe();
    }

    subscribe();

    // Realtime can silently go stale while the tab/PWA is backgrounded —
    // Supabase's own logs show this project's realtime tenant repeatedly
    // shutting down ("no connected users") and cold-starting again on the
    // next connection, and iOS's support for visibilitychange in standalone
    // PWAs is inconsistent in practice, so a single foreground event isn't
    // reliable enough on its own. Belt-and-braces: refetch on every
    // plausible "we're back" signal, AND poll on a short interval while
    // visible as a hard guarantee that Home can never drift for long no
    // matter which signal the platform actually fires.
    //
    // Only re-subscribe the realtime channel on genuine foreground
    // transitions, not on every poll tick — tearing a channel down and
    // recreating it is exactly the kind of churn that can make a tenant
    // briefly look like it has "no connected users" (which is the failure
    // mode we're working around in the first place), so the frequent poll
    // deliberately leaves the existing channel alone and only refetches.
    async function refetch() {
      lastRefetchAt.current = Date.now();
      const windowStart = homeFetchWindowStartISO();

      try {
        const [
          { data, count: windowCount, error: windowError },
          { count: olderCount, error: olderError },
        ] = await Promise.all([
          supabase
            .from("entries")
            .select("*", { count: "exact" })
            .eq("baby_id", babyId)
            .is("deleted_at", null)
            .gte("timestamp", windowStart)
            .order("timestamp", { ascending: false })
            .limit(HOME_ROW_SAFETY_CAP),
          supabase
            .from("entries")
            .select("*", { count: "exact", head: true })
            .eq("baby_id", babyId)
            .is("deleted_at", null)
            .lt("timestamp", windowStart),
        ]);

        // Previously dropped silently — neither query's `error` was ever
        // read, so a failed refetch (e.g. a network fetch failure) looked
        // identical to "nothing changed."
        if (windowError || olderError) {
          logMutationFailure("refetch", windowError ?? olderError);
          return;
        }

        if (data) {
          setEntries(data);
          setFetchTruncated((windowCount ?? 0) > HOME_ROW_SAFETY_CAP || (olderCount ?? 0) > 0);
        }
      } catch (err) {
        logMutationFailure("refetch", err);
      }
    }

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

    // Last resort, event-agnostic: relaunching a standalone PWA from its
    // home-screen icon can resume an already-alive-but-suspended process
    // without reliably firing visibilitychange/pageshow/focus at all on
    // iOS — a documented WebKit inconsistency, not something any of the
    // above can be made to catch with certainty. But the user WILL touch
    // the screen to do anything with a resumed app, so treat any tap as a
    // trigger to refetch if it's been a while since the last one.
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

  useEffect(() => {
    // iOS home-screen PWAs can relaunch with a native picker still open —
    // WebKit restores focus to whatever was focused before the app was
    // backgrounded, and for a datetime-local input that means its picker
    // pops back open uninvited. Blur proactively on mount and whenever the
    // app is backgrounded, so nothing is left focused for iOS to restore a
    // picker onto when it's foregrounded again.
    function blurActiveElement() {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }

    blurActiveElement();

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        blurActiveElement();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  function handleLogMoment() {
    const draft = createDraftMoment(currentUserId);
    setDrafts((prev) => [draft, ...prev]);
    setFlashKey(draft.key);
    setTimeout(() => setFlashKey(null), 1400);
  }

  async function handleToggleType(
    moment: Moment,
    type: EntryType,
    checked: boolean,
  ) {
    setError(null);
    const supabase = createClient();
    let guardKey: string | null = null;

    try {
      if (checked) {
        guardKey = `${moment.loggedBy}|${moment.timestamp}|${type}`;
        if (insertsInFlight.current.has(guardKey)) {
          guardKey = null;
          return;
        }
        insertsInFlight.current.add(guardKey);

        const { data, error } = await supabase
          .from("entries")
          .insert({
            baby_id: babyId,
            logged_by: moment.loggedBy,
            type,
            timestamp: moment.timestamp,
            notes: moment.notes,
            amount_ml: null,
          })
          .select()
          .single();

        if (error) {
          setError(error.message);
          return;
        }

        setEntries((prev) => [data, ...prev]);
        if (moment.isDraft) {
          setDrafts((prev) => prev.filter((d) => d.key !== moment.key));
        }
        return;
      }

      const existingId = moment[type]?.id;
      if (!existingId) return;

      // Soft-delete (JOS-20) — recoverable for 7 days via Timeline's
      // Recently Deleted screen, same as the explicit delete-moment actions.
      const { error } = await supabase
        .from("entries")
        .update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId })
        .eq("id", existingId);

      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) => prev.filter((entry) => entry.id !== existingId));

      const remainingTypes = siblingIds(moment).filter((id) => id !== existingId);
      if (remainingTypes.length === 0) {
        setDrafts((prev) => [
          {
            key: `draft-${crypto.randomUUID()}`,
            timestamp: moment.timestamp,
            loggedBy: moment.loggedBy,
            notes: moment.notes,
            isDraft: true,
          },
          ...prev,
        ]);
      }
    } catch (err) {
      logMutationFailure("handleToggleType", err);
    } finally {
      if (guardKey) insertsInFlight.current.delete(guardKey);
    }
  }

  async function handleToggleFeedFlag(
    moment: Moment,
    flag: "bottle" | "breast",
    checked: boolean,
  ) {
    // Unchecking Breast loses real timed data (running or already
    // accumulated) more easily than an accidental tap should allow —
    // confirm before clearing it, same friction level as deleting a moment.
    if (
      flag === "breast" &&
      !checked &&
      moment.feed &&
      canEndBreastSession(moment.feed)
    ) {
      const confirmed = window.confirm(
        "This will clear the recorded breastfeeding session. Continue?",
      );
      if (!confirmed) return;
    }

    setError(null);
    const supabase = createClient();

    // Resets the timer fields whenever Breast is being unchecked — covers
    // both the "row stays" (bottle still on) and "row gets deleted" (bottle
    // also off) paths below; a no-op when there was nothing to reset.
    const breastResetFields =
      flag === "breast" && !checked
        ? {
            breast_right_seconds: 0,
            breast_left_seconds: 0,
            breast_active_side: null,
            breast_active_started_at: null,
            breast_session_ended: false,
          }
        : {};

    let guardKey: string | null = null;

    try {
      if (!moment.feed) {
        // No feed row on this moment yet — checking Bottle or Breast creates one.
        if (!checked) return;

        guardKey = `${moment.loggedBy}|${moment.timestamp}|feed`;
        if (insertsInFlight.current.has(guardKey)) {
          guardKey = null;
          return;
        }
        insertsInFlight.current.add(guardKey);

        const { data, error } = await supabase
          .from("entries")
          .insert({
            baby_id: babyId,
            logged_by: moment.loggedBy,
            type: "feed",
            timestamp: moment.timestamp,
            notes: moment.notes,
            amount_ml: null,
            bottle: flag === "bottle",
            breast: flag === "breast",
          })
          .select()
          .single();

        if (error) {
          setError(error.message);
          return;
        }

        setEntries((prev) => [data, ...prev]);
        if (moment.isDraft) {
          setDrafts((prev) => prev.filter((d) => d.key !== moment.key));
        }
        return;
      }

      const feedId = moment.feed.id;
      const otherFlag = flag === "bottle" ? "breast" : "bottle";
      const otherValue = moment.feed[otherFlag];

      if (!checked && !otherValue) {
        // Unchecking the only active flag — soft-delete the feed row (JOS-20).
        const { error } = await supabase
          .from("entries")
          .update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId })
          .eq("id", feedId);

        if (error) {
          setError(error.message);
          return;
        }

        setEntries((prev) => prev.filter((entry) => entry.id !== feedId));

        const remainingIds = siblingIds(moment).filter((id) => id !== feedId);
        if (remainingIds.length === 0) {
          setDrafts((prev) => [
            {
              key: `draft-${crypto.randomUUID()}`,
              timestamp: moment.timestamp,
              loggedBy: moment.loggedBy,
              notes: moment.notes,
              isDraft: true,
            },
            ...prev,
          ]);
        }
        return;
      }

      const updates: {
        bottle?: boolean;
        breast?: boolean;
        amount_ml?: null;
        breast_right_seconds?: number;
        breast_left_seconds?: number;
        breast_active_side?: BreastSide | null;
        breast_active_started_at?: string | null;
        breast_session_ended?: boolean;
      } = {
        [flag]: checked,
        ...breastResetFields,
      };
      if (flag === "bottle" && !checked) {
        updates.amount_ml = null;
      }

      const { error } = await supabase.from("entries").update(updates).eq("id", feedId);

      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) =>
        prev.map((entry) => (entry.id === feedId ? { ...entry, ...updates } : entry)),
      );
    } catch (err) {
      logMutationFailure("handleToggleFeedFlag", err);
    } finally {
      if (guardKey) insertsInFlight.current.delete(guardKey);
    }
  }

  // Tapping a side starts it; tapping the OTHER side auto-pauses the first
  // and starts the second (only one side ever runs at a time); tapping the
  // same side again pauses it. The session stays open across any number of
  // pauses/switches — resuming a side continues from its accumulated time,
  // it never resets. Each tap is a single atomic write (never a per-tick
  // one) of a real timestamp, which is what lets every connected device
  // compute the same live elapsed time locally — see src/lib/breastfeed-timer.ts.
  async function handleBreastSideToggle(moment: Moment, side: BreastSide) {
    const feed = moment.feed;
    if (!feed) return;
    setError(null);
    const supabase = createClient();

    const updates: {
      breast_right_seconds?: number;
      breast_left_seconds?: number;
      breast_active_side: BreastSide | null;
      breast_active_started_at: string | null;
    } = { breast_active_side: null, breast_active_started_at: null };

    if (feed.breast_active_side === side && feed.breast_active_started_at) {
      // Pausing this side — fold the elapsed-since-start time into its total.
      const elapsed = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(feed.breast_active_started_at).getTime()) / 1000,
        ),
      );
      if (side === "right") {
        updates.breast_right_seconds = feed.breast_right_seconds + elapsed;
      } else {
        updates.breast_left_seconds = feed.breast_left_seconds + elapsed;
      }
    } else {
      // Starting/resuming this side — if the OTHER side was running, fold
      // its elapsed time in first before switching.
      if (feed.breast_active_side && feed.breast_active_started_at) {
        const otherElapsed = Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(feed.breast_active_started_at).getTime()) / 1000,
          ),
        );
        if (feed.breast_active_side === "right") {
          updates.breast_right_seconds = feed.breast_right_seconds + otherElapsed;
        } else {
          updates.breast_left_seconds = feed.breast_left_seconds + otherElapsed;
        }
      }
      updates.breast_active_side = side;
      updates.breast_active_started_at = new Date().toISOString();
    }

    try {
      const { error } = await supabase.from("entries").update(updates).eq("id", feed.id);
      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) =>
        prev.map((entry) => (entry.id === feed.id ? { ...entry, ...updates } : entry)),
      );
    } catch (err) {
      logMutationFailure("handleBreastSideToggle", err);
    }
  }

  async function handleEndBreastSession(moment: Moment) {
    const feed = moment.feed;
    if (!feed) return;
    setError(null);
    const supabase = createClient();

    const updates = {
      breast_right_seconds: feed.breast_right_seconds,
      breast_left_seconds: feed.breast_left_seconds,
      breast_active_side: null as BreastSide | null,
      breast_active_started_at: null as string | null,
      breast_session_ended: true,
    };

    if (feed.breast_active_side && feed.breast_active_started_at) {
      const elapsed = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(feed.breast_active_started_at).getTime()) / 1000,
        ),
      );
      if (feed.breast_active_side === "right") {
        updates.breast_right_seconds += elapsed;
      } else {
        updates.breast_left_seconds += elapsed;
      }
    }

    try {
      const { error } = await supabase.from("entries").update(updates).eq("id", feed.id);
      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) =>
        prev.map((entry) => (entry.id === feed.id ? { ...entry, ...updates } : entry)),
      );
    } catch (err) {
      logMutationFailure("handleEndBreastSession", err);
    }
  }

  async function handleTimeCommit(moment: Moment, value: string) {
    if (!value) return;
    const timestamp = new Date(value).toISOString();
    if (timestamp === moment.timestamp) return;

    if (moment.isDraft) {
      setDrafts((prev) =>
        prev.map((d) => (d.key === moment.key ? { ...d, timestamp } : d)),
      );
      return;
    }

    const ids = siblingIds(moment);
    if (ids.length === 0) return;

    setError(null);
    try {
      const { error } = await createClient()
        .from("entries")
        .update({ timestamp })
        .in("id", ids);

      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) =>
        prev.map((entry) =>
          ids.includes(entry.id) ? { ...entry, timestamp } : entry,
        ),
      );
    } catch (err) {
      logMutationFailure("handleTimeCommit", err);
    }
  }

  async function handleNotesCommit(moment: Moment, value: string) {
    const notes = value.trim() || null;
    if (notes === moment.notes) return;

    if (moment.isDraft) {
      setDrafts((prev) =>
        prev.map((d) => (d.key === moment.key ? { ...d, notes } : d)),
      );
      return;
    }

    const ids = siblingIds(moment);
    if (ids.length === 0) return;

    setError(null);
    try {
      const { error } = await createClient()
        .from("entries")
        .update({ notes })
        .in("id", ids);

      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) =>
        prev.map((entry) => (ids.includes(entry.id) ? { ...entry, notes } : entry)),
      );
    } catch (err) {
      logMutationFailure("handleNotesCommit", err);
    }
  }

  async function handleAmountCommit(moment: Moment, value: string) {
    const feedId = moment.feed?.id;
    if (!feedId) return;
    const amount_ml = value.trim() ? Number(value) : null;
    if (amount_ml === moment.feed?.amount_ml) return;

    setError(null);
    try {
      const { error } = await createClient()
        .from("entries")
        .update({ amount_ml })
        .eq("id", feedId);

      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === feedId ? { ...entry, amount_ml } : entry,
        ),
      );
    } catch (err) {
      logMutationFailure("handleAmountCommit", err);
    }
  }

  async function handlePumpAmountCommit(moment: Moment, value: string) {
    const pumpId = moment.pump?.id;
    if (!pumpId) return;
    const amount_ml = value.trim() ? Number(value) : null;
    if (amount_ml === moment.pump?.amount_ml) return;

    setError(null);
    try {
      const { error } = await createClient()
        .from("entries")
        .update({ amount_ml })
        .eq("id", pumpId);

      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === pumpId ? { ...entry, amount_ml } : entry,
        ),
      );
    } catch (err) {
      logMutationFailure("handlePumpAmountCommit", err);
    }
  }

  async function handleLoggedByCycle(moment: Moment) {
    if (members.length === 0) return;
    const currentIndex = members.findIndex((m) => m.id === moment.loggedBy);
    const next = members[(currentIndex + 1) % members.length];

    if (moment.isDraft) {
      setDrafts((prev) =>
        prev.map((d) =>
          d.key === moment.key ? { ...d, loggedBy: next.id } : d,
        ),
      );
      return;
    }

    const ids = siblingIds(moment);
    if (ids.length === 0) return;

    setError(null);
    try {
      const { error } = await createClient()
        .from("entries")
        .update({ logged_by: next.id })
        .in("id", ids);

      if (error) {
        setError(error.message);
        return;
      }

      setEntries((prev) =>
        prev.map((entry) =>
          ids.includes(entry.id) ? { ...entry, logged_by: next.id } : entry,
        ),
      );
    } catch (err) {
      logMutationFailure("handleLoggedByCycle", err);
    }
  }

  /* ---------- sleep (JOS-56) ---------- */

  // Every sleep action answers with a message when something other than plain
  // success needs saying (the other parent got there first, a rule said no);
  // show it, whichever action it was.
  async function runSleep(call: Promise<SleepOutcome>): Promise<SleepOutcome> {
    const outcome = await call;
    if (outcome.message) showToast(outcome.message);
    return outcome;
  }

  function scrollToSleep(id: string) {
    // The card exists twice (phone list and wide stack); one is display:none.
    const card = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-sleep-card="${id}"]`),
    ).find((el) => el.offsetParent !== null);
    card?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function flashSleep(id: string, scroll: boolean) {
    setSleepFlashId(id);
    window.setTimeout(() => setSleepFlashId(null), 1400);
    // After the new card has rendered.
    if (scroll) window.setTimeout(() => scrollToSleep(id), 60);
  }

  // The Sleep tile: a blank draft card turns into the sleep card; a card that
  // already has ticks starts a new one. If a sleep is already open, say so and
  // take the user to it instead.
  async function handleStartSleep(moment: Moment) {
    if (sleepCtl.pending.has("new")) return;
    setError(null);
    const blankDraft = !!moment.isDraft && !moment.notes;
    const outcome = await runSleep(
      sleepCtl.start(blankDraft ? (moment.loggedBy ?? currentUserId) : currentUserId),
    );
    if (outcome.sleep) flashSleep(outcome.sleep.id, true);
    if (outcome.ok && blankDraft) {
      setDrafts((prev) => prev.filter((d) => d.key !== moment.key));
    }
  }

  function handleStopSleep(sleep: Sleep) {
    // Stop always works. Under a minute in total there is nothing worth
    // keeping yet, so ask first; past that it just stops.
    if (underMinute(sleep, serverNow())) {
      setShortDialog({ id: sleep.id, rev: sleep.rev });
      return;
    }
    void runSleep(sleepCtl.stop(sleep));
  }

  // The card stays exactly where it is and turns back into a running one; a
  // brief flash is the confirmation (no scrolling: it is already under the
  // finger).
  async function reopenSleep(sleep: Sleep) {
    const outcome = await runSleep(sleepCtl.reopen(sleep));
    if (outcome.ok) flashSleep(sleep.id, false);
  }

  async function handleSleepSetTime(
    sleep: Sleep,
    field: SleepField,
    input: SleepTimeInput,
  ): Promise<string | null> {
    const outcome = await sleepCtl.setTime(sleep, field, input);
    if (outcome.ok) {
      flashSleep(sleep.id, false);
      return null;
    }
    // A rule said no (overlap, before the last sleep...): that belongs under
    // the picker. Someone else changing the sleep first is a toast, and the
    // card has already moved on.
    if (outcome.status === "error" || outcome.status === "offline") {
      return outcome.message ?? "Couldn't save that time.";
    }
    if (outcome.message) showToast(outcome.message);
    return null;
  }

  async function handleSleepRemovePause(sleep: Sleep, index: number): Promise<string | null> {
    const outcome = await sleepCtl.removePause(sleep, index);
    if (outcome.ok) {
      flashSleep(sleep.id, false);
      return null;
    }
    // A rule said no (the pause is gone, it would overlap another sleep) or
    // the network dropped: that belongs under the list. Someone else changing
    // the sleep first is a toast, and the card has already moved on.
    if (outcome.status === "error" || outcome.status === "offline") {
      return outcome.message ?? "Couldn't remove that pause.";
    }
    if (outcome.message) showToast(outcome.message);
    return null;
  }

  function handleSleepLoggedByCycle(sleep: Sleep) {
    if (members.length === 0) return;
    const currentIndex = members.findIndex((m) => m.id === sleep.by);
    void sleepCtl.setLoggedBy(sleep, members[(currentIndex + 1) % members.length].id);
  }

  function handleSleepNotes(sleep: Sleep, value: string) {
    const notes = value.trim() || null;
    if (notes === sleep.notes) return;
    void sleepCtl.setNotes(sleep, notes);
  }

  // The × on a sleep card (JOS-92 took the Delete sleep button off it): one
  // sleep, with its own box. Several at once go through Edit and Delete (n).
  function requestSleepDelete(sleep: Sleep) {
    setPendingSleepDelete({ sleep, prompt: deleteSleepPrompt(sleep, serverNow(), deviceZone()) });
  }

  async function confirmSleepDelete() {
    const pending = pendingSleepDelete;
    setPendingSleepDelete(null);
    if (!pending) return;
    // The version the user was looking at, not the latest: if the other parent
    // changed or deleted the sleep since, the delete loses and says who got
    // there first ("Jen already deleted this sleep (6:08 pm)"), even when their
    // delete has already taken the card off this screen.
    await runSleep(sleepCtl.remove(pending.sleep));
  }

  // The under-a-minute dialog closes itself if the sleep changes under it
  // (the other parent stops it, say): it is only open for the very version
  // that was on screen when Stop was tapped.
  const dialogSleep = shortDialog && sleepList.find((s) => s.id === shortDialog.id);
  const shortDialogOpen =
    !!shortDialog && !!dialogSleep && dialogSleep.rev === shortDialog.rev && dialogSleep.closedAt == null;

  async function discardShortSleep() {
    const sleep = dialogSleep;
    setShortDialog(null);
    if (!sleep) return;
    const outcome = await runSleep(sleepCtl.remove(sleep));
    if (outcome.ok) showToast("Sleep discarded.");
  }

  function stopShortSleep() {
    const sleep = dialogSleep;
    setShortDialog(null);
    if (sleep) void runSleep(sleepCtl.stop(sleep));
  }

  // Both layouts are in the page (one hidden by CSS); a sleep card is drawn in
  // the one in use only, so it isn't re-rendered every second twice over.
  const isWide = useMediaQuery("(min-width: 640px)");
  const todaySleepIds = useMemo(
    () =>
      new Set(
        homeSections.todayMoments.flatMap((item) => (item.kind === "sleep" ? [item.sleep.id] : [])),
      ),
    [homeSections],
  );

  const renderSleep = (sleep: Sleep, layout: "phone" | "wide") => {
    if ((layout === "wide") !== isWide) return null;
    const zone = deviceZone();
    const started = firstStart(sleep);
    const otherDay = zone.dayKey(started) !== zone.dayKey(now.getTime());
    return (
      <LiveSleepCard
        sleep={sleep}
        sleeps={sleepList}
        members={members}
        memberNames={memberNames}
        flash={sleepFlashId === sleep.id}
        // The phone list has day dividers; the wide stack does not. And a
        // sleep that began on another day but sits under Today (still
        // running, or ended this morning) needs saying on both.
        dayPrefix={
          otherDay && (layout === "wide" || todaySleepIds.has(sleep.id))
            ? zone.fmtDay(started)
            : undefined
        }
        busy={sleepCtl.pending.has(sleep.id)}
        onPause={() => void runSleep(sleepCtl.pause(sleep))}
        onResume={() => void runSleep(sleepCtl.resume(sleep))}
        onStop={() => handleStopSleep(sleep)}
        onReopen={() => void reopenSleep(sleep)}
        onDelete={() => requestSleepDelete(sleep)}
        selectMode={selectMode}
        selected={selectedKeys.has(sleepSelectKey(sleep.id))}
        onToggleSelect={() => toggleSelected(sleepSelectKey(sleep.id))}
        onSetTime={(field, input) => handleSleepSetTime(sleep, field, input)}
        onRemovePause={(index) => handleSleepRemovePause(sleep, index)}
        onLoggedByCycle={() => handleSleepLoggedByCycle(sleep)}
        onNotesCommit={(value) => handleSleepNotes(sleep, value)}
        onNotice={showToast}
      />
    );
  };

  // What is ticked and still on the Log: a moment or sleep the other parent
  // deleted since is no longer counted or asked about.
  const selection = useMemo(
    () => ({
      moments: moments.filter((moment) => selectedKeys.has(moment.key)),
      sleeps: sleepList.filter((sleep) => selectedKeys.has(sleepSelectKey(sleep.id))),
    }),
    [moments, sleepList, selectedKeys],
  );
  const selectedCount = selection.moments.length + selection.sleeps.length;

  function toggleSelectMode() {
    setSelectMode((prev) => !prev);
    setSelectedKeys(new Set());
  }

  function toggleSelected(momentKey: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(momentKey)) {
        next.delete(momentKey);
      } else {
        next.add(momentKey);
      }
      return next;
    });
  }

  async function deleteMoments(momentsToDelete: Moment[]) {
    const idsToDelete = momentsToDelete.flatMap(siblingIds);
    const draftKeysToRemove = new Set(
      momentsToDelete.filter((moment) => moment.isDraft).map((m) => m.key),
    );

    if (idsToDelete.length > 0) {
      setError(null);
      try {
        // Soft-delete (JOS-20) — recoverable for 7 days via Timeline's
        // Recently Deleted screen.
        const { error } = await createClient()
          .from("entries")
          .update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId })
          .in("id", idsToDelete);

        if (error) {
          setError(error.message);
          return;
        }

        setEntries((prev) =>
          prev.filter((entry) => !idsToDelete.includes(entry.id)),
        );
      } catch (err) {
        logMutationFailure("deleteMoments", err);
        return;
      }
    }

    if (draftKeysToRemove.size > 0) {
      setDrafts((prev) => prev.filter((d) => !draftKeysToRemove.has(d.key)));
    }
  }

  // The ticked sleeps, one after the other (JOS-92). Each is its own
  // conditional write on the version the user saw, like the × on a card, so one
  // the other parent changed first stays (and says so) while the rest still go.
  async function deleteSleeps(sleepsToDelete: Sleep[]) {
    let notDeleted = 0;
    let message: string | null = null;
    for (let i = 0; i < sleepsToDelete.length; i++) {
      const outcome = await sleepCtl.remove(sleepsToDelete[i]);
      // Already deleted by the other parent: what was asked for is done.
      if (outcome.ok || outcome.status === "gone") continue;
      notDeleted += 1;
      if (message === null) message = outcome.message;
      // The network is down: the rest would only wait to fail the same way.
      if (outcome.status === "offline") {
        notDeleted += sleepsToDelete.length - i - 1;
        break;
      }
    }
    if (notDeleted > 0) showToast(bulkSleepFailure(notDeleted, message));
  }

  function handleDeleteSelected() {
    if (selectedCount === 0) return;

    const { title, body } = bulkDeletePrompt({
      moments: selection.moments.length,
      sleeps: selection.sleeps.length,
      going: selection.sleeps.filter((sleep) => stateOf(sleep, serverNow()) !== "finished").length,
    });
    setPendingDelete({
      moments: selection.moments,
      sleeps: selection.sleeps,
      title,
      body,
      clearSelection: true,
    });
  }

  // Phone-card-only quick delete — a single moment, no need to enter
  // select mode first (matching the prototype's inline card ✕).
  function handleDeleteMoment(moment: Moment) {
    setPendingDelete({
      moments: [moment],
      sleeps: [],
      title: "Delete this moment?",
      body: "You can restore it from Recently Deleted in Timeline for 7 days.",
      clearSelection: false,
    });
  }

  async function confirmPendingDelete() {
    const pending = pendingDelete;
    if (!pending) return;
    // The box closes first: the deletes below take a moment, and a second tap
    // on Delete must not send them twice.
    setPendingDelete(null);
    setBulkDeleting(true);
    try {
      await deleteMoments(pending.moments);
      await deleteSleeps(pending.sleeps);
    } finally {
      setBulkDeleting(false);
    }
    if (pending.clearSelection) {
      setSelectedKeys(new Set());
      setSelectMode(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <GlanceCards entries={entries} sleeps={sleepCtl.sleeps} />

      <div className="flex items-center justify-between gap-4">
        {/* JOS-41: shrink-0 keeps the button's own size fixed regardless of
            anything else in this row; the error text itself now lives
            outside the row entirely (below) so it can never force a wrap
            that resizes the button. */}
        <PrimaryButton type="button" onClick={handleLogMoment} className="shrink-0">
          Log a moment
        </PrimaryButton>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedCount === 0 || bulkDeleting}
                className="rounded-full border border-terracotta/40 px-3 py-1.5 text-sm font-bold text-terracotta transition-colors hover:bg-terracotta-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </button>
              <button
                type="button"
                onClick={toggleSelectMode}
                className="rounded-full border border-line-strong bg-paper-raised px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-paper"
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleSelectMode}
              className="rounded-full border border-line-strong bg-paper-raised px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-paper"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="truncate text-sm text-terracotta" title={error}>
          {error}
        </p>
      )}

      <MomentsTable
        moments={visibleMoments}
        groups={momentGroups}
        memberNames={memberNames}
        emptyMessage="No entries yet — log the first moment above."
        timeFormat="time"
        flashMomentKey={flashKey}
        editable
        members={members}
        onToggleType={handleToggleType}
        onToggleFeedFlag={handleToggleFeedFlag}
        onTimeCommit={handleTimeCommit}
        onNotesCommit={handleNotesCommit}
        onAmountCommit={handleAmountCommit}
        onPumpAmountCommit={handlePumpAmountCommit}
        onBreastSideToggle={handleBreastSideToggle}
        onEndBreastSession={handleEndBreastSession}
        onLoggedByCycle={handleLoggedByCycle}
        onStartSleep={handleStartSleep}
        renderSleep={renderSleep}
        selectMode={selectMode}
        selectedKeys={selectedKeys}
        onToggleSelect={toggleSelected}
        onDeleteMoment={handleDeleteMoment}
      />

      {homeSections.hasMore && (
        <Link
          href="/timeline"
          className="self-center text-[13.5px] font-bold text-sage hover:underline"
        >
          View more in Timeline →
        </Link>
      )}

      <ConfirmDeleteModal
        open={pendingDelete !== null}
        title={pendingDelete?.title ?? ""}
        body={pendingDelete?.body ?? ""}
        onConfirm={confirmPendingDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDeleteModal
        open={pendingSleepDelete !== null}
        title={pendingSleepDelete?.prompt.title ?? ""}
        body={pendingSleepDelete?.prompt.body ?? ""}
        confirmLabel={pendingSleepDelete?.prompt.confirmLabel}
        onConfirm={confirmSleepDelete}
        onCancel={() => setPendingSleepDelete(null)}
      />

      <ShortSleepDialog
        open={shortDialogOpen}
        onKeep={() => setShortDialog(null)}
        onStopAndSave={stopShortSleep}
        onDiscard={discardShortSleep}
      />

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 z-[60] w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 rounded-xl bg-ink px-3.5 py-2.5 text-[13px] leading-snug text-paper-raised shadow-card transition-opacity duration-150 ${
          toast.visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {toast.text}
      </div>
    </div>
  );
}

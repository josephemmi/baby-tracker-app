"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { canEndBreastSession } from "@/lib/breastfeed-timer";
import type { BreastSide } from "@/lib/supabase/database.types";

interface Member {
  id: string;
  name: string;
}

interface LogMatrixProps {
  babyId: string;
  currentUserId: string;
  members: Member[];
  initialEntries: EntryRow[];
  hasMoreEntries?: boolean;
}

export function LogMatrix({
  babyId,
  currentUserId,
  members,
  initialEntries,
  hasMoreEntries = false,
}: LogMatrixProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [drafts, setDrafts] = useState<Moment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
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

  // JOS-21: today's entries in full, plus the previous calendar day's last
  // 3 entries for continuity — everything older stays behind "View more".
  const homeSections = useMemo(
    () => partitionHomeMoments(moments, now, fetchTruncated),
    [moments, now, fetchTruncated],
  );

  const visibleMoments = useMemo(
    () => [...homeSections.todayMoments, ...(homeSections.previousDay?.moments ?? [])],
    [homeSections],
  );

  const momentGroups = useMemo<MomentGroup[]>(() => {
    const groups: MomentGroup[] = [
      {
        moments: homeSections.todayMoments,
        divider: homeSections.previousDay
          ? { label: homeSections.todayLabel, today: true }
          : undefined,
      },
    ];
    if (homeSections.previousDay) {
      groups.push({
        moments: homeSections.previousDay.moments,
        divider: { label: homeSections.previousDay.label },
        tail: true,
      });
    }
    return groups;
  }, [homeSections]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
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

      const [{ data, count: windowCount }, { count: olderCount }] = await Promise.all([
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

      if (data) {
        setEntries(data);
        setFetchTruncated((windowCount ?? 0) > HOME_ROW_SAFETY_CAP || (olderCount ?? 0) > 0);
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

    if (checked) {
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

    if (!moment.feed) {
      // No feed row on this moment yet — checking Bottle or Breast creates one.
      if (!checked) return;

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

    const { error } = await supabase.from("entries").update(updates).eq("id", feed.id);
    if (error) {
      setError(error.message);
      return;
    }

    setEntries((prev) =>
      prev.map((entry) => (entry.id === feed.id ? { ...entry, ...updates } : entry)),
    );
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

    const { error } = await supabase.from("entries").update(updates).eq("id", feed.id);
    if (error) {
      setError(error.message);
      return;
    }

    setEntries((prev) =>
      prev.map((entry) => (entry.id === feed.id ? { ...entry, ...updates } : entry)),
    );
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
  }

  async function handleAmountCommit(moment: Moment, value: string) {
    const feedId = moment.feed?.id;
    if (!feedId) return;
    const amount_ml = value.trim() ? Number(value) : null;
    if (amount_ml === moment.feed?.amount_ml) return;

    setError(null);
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
  }

  async function handlePumpAmountCommit(moment: Moment, value: string) {
    const pumpId = moment.pump?.id;
    if (!pumpId) return;
    const amount_ml = value.trim() ? Number(value) : null;
    if (amount_ml === moment.pump?.amount_ml) return;

    setError(null);
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
  }

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
    }

    if (draftKeysToRemove.size > 0) {
      setDrafts((prev) => prev.filter((d) => !draftKeysToRemove.has(d.key)));
    }
  }

  async function handleDeleteSelected() {
    if (selectedKeys.size === 0) return;

    const confirmed = window.confirm(
      `Delete ${selectedKeys.size} logged moment${selectedKeys.size > 1 ? "s" : ""}? You can restore ${selectedKeys.size > 1 ? "them" : "it"} from Recently Deleted in Timeline for 7 days.`,
    );
    if (!confirmed) return;

    const selectedMoments = moments.filter((moment) =>
      selectedKeys.has(moment.key),
    );
    await deleteMoments(selectedMoments);

    setSelectedKeys(new Set());
    setSelectMode(false);
  }

  // Phone-card-only quick delete — a single moment, no need to enter
  // select mode first (matching the prototype's inline card ✕).
  async function handleDeleteMoment(moment: Moment) {
    const confirmed = window.confirm(
      "Delete this logged moment? You can restore it from Recently Deleted in Timeline for 7 days.",
    );
    if (!confirmed) return;
    await deleteMoments([moment]);
  }

  return (
    <div className="flex flex-col gap-4">
      <GlanceCards entries={entries} />

      <div className="flex items-center justify-between gap-4">
        <PrimaryButton type="button" onClick={handleLogMoment}>
          Log a moment
        </PrimaryButton>
        <div className="flex items-center gap-2">
          {error && <p className="text-sm text-terracotta">{error}</p>}
          {selectMode ? (
            <>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedKeys.size === 0}
                className="rounded-full border border-terracotta/40 px-3 py-1.5 text-sm font-bold text-terracotta transition-colors hover:bg-terracotta-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                Delete{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ""}
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

      <MomentsTable
        moments={visibleMoments}
        groups={momentGroups}
        memberNames={memberNames}
        emptyMessage="No entries yet — log the first moment above."
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
    </div>
  );
}

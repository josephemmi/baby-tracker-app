"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  createDraftMoment,
  groupEntriesIntoMoments,
  mergeMoments,
  HOME_ENTRIES_LIMIT,
  type EntryRow,
  type Moment,
} from "@/lib/entries";
import type { EntryType } from "@/lib/supabase/database.types";
import { GlanceCards } from "@/components/log/glance-cards";
import { MomentsTable } from "@/components/log/moments-table";
import { PrimaryButton } from "@/components/ui/primary-button";

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

function siblingIds(moment: Moment): string[] {
  return [
    moment.feed?.id,
    moment.pee?.id,
    moment.poop?.id,
    moment.pump?.id,
  ].filter((id): id is string => !!id);
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
  const [hasMore, setHasMore] = useState(hasMoreEntries);

  const memberNames = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.name])),
    [members],
  );

  const moments = useMemo(
    () => mergeMoments(drafts, groupEntriesIntoMoments(entries)),
    [drafts, entries],
  );

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

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
            setEntries((prev) =>
              prev.map((entry) => (entry.id === updated.id ? updated : entry)),
            );
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
    // reliable enough on its own. Belt-and-braces: resync (refetch +
    // re-subscribe) on every plausible "we're back" signal, AND poll on an
    // interval while visible as a hard guarantee that Home can never drift
    // for more than ~20s no matter which signal the platform actually fires.
    async function resync() {
      const { data } = await supabase
        .from("entries")
        .select("*")
        .eq("baby_id", babyId)
        .order("timestamp", { ascending: false })
        .limit(HOME_ENTRIES_LIMIT + 1);

      if (data) {
        const more = data.length > HOME_ENTRIES_LIMIT;
        setEntries(more ? data.slice(0, HOME_ENTRIES_LIMIT) : data);
        setHasMore(more);
      }

      if (channel) supabase.removeChannel(channel);
      subscribe();
    }

    function handleForeground() {
      if (document.visibilityState === "visible") {
        resync();
      }
    }

    document.addEventListener("visibilitychange", handleForeground);
    window.addEventListener("pageshow", handleForeground);
    window.addEventListener("focus", handleForeground);

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") resync();
    }, 20_000);

    return () => {
      document.removeEventListener("visibilitychange", handleForeground);
      window.removeEventListener("pageshow", handleForeground);
      window.removeEventListener("focus", handleForeground);
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

    const { error } = await supabase
      .from("entries")
      .delete()
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
    setError(null);
    const supabase = createClient();

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
      // Unchecking the only active flag — remove the feed row entirely.
      const { error } = await supabase.from("entries").delete().eq("id", feedId);

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

    const updates: { bottle?: boolean; breast?: boolean; amount_ml?: null } = {
      [flag]: checked,
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
      const { error } = await createClient()
        .from("entries")
        .delete()
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
      `Delete ${selectedKeys.size} logged moment${selectedKeys.size > 1 ? "s" : ""}? This can't be undone.`,
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
      "Delete this logged moment? This can't be undone.",
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
        moments={moments}
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
        onLoggedByCycle={handleLoggedByCycle}
        selectMode={selectMode}
        selectedKeys={selectedKeys}
        onToggleSelect={toggleSelected}
        onDeleteMoment={handleDeleteMoment}
      />

      {hasMore && (
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

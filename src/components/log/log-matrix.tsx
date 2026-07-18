"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createDraftMoment,
  groupEntriesIntoMoments,
  mergeMoments,
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
}

function siblingIds(moment: Moment): string[] {
  return [moment.feed?.id, moment.pee?.id, moment.poop?.id].filter(
    (id): id is string => !!id,
  );
}

export function LogMatrix({
  babyId,
  currentUserId,
  members,
  initialEntries,
}: LogMatrixProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [drafts, setDrafts] = useState<Moment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);

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
    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [babyId]);

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

  return (
    <div className="flex flex-col gap-4">
      <GlanceCards entries={entries} />

      <div className="flex items-center justify-between gap-4">
        <PrimaryButton type="button" onClick={handleLogMoment}>
          Log a moment
        </PrimaryButton>
        {error && <p className="text-sm text-terracotta">{error}</p>}
      </div>

      <MomentsTable
        moments={moments}
        memberNames={memberNames}
        emptyMessage="No entries yet — log the first moment above."
        flashMomentKey={flashKey}
        editable
        members={members}
        onToggleType={handleToggleType}
        onTimeCommit={handleTimeCommit}
        onNotesCommit={handleNotesCommit}
        onAmountCommit={handleAmountCommit}
        onLoggedByCycle={handleLoggedByCycle}
      />
    </div>
  );
}

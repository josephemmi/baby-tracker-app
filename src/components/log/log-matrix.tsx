"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  groupEntriesIntoMoments,
  toDatetimeLocalValue,
  type EntryRow,
} from "@/lib/entries";
import type { EntryType } from "@/lib/supabase/database.types";
import { LastFeedWidget } from "@/components/log/last-feed-widget";

interface LogMatrixProps {
  babyId: string;
  currentUserId: string;
  memberNames: Record<string, string>;
  initialEntries: EntryRow[];
}

export function LogMatrix({
  babyId,
  currentUserId,
  memberNames,
  initialEntries,
}: LogMatrixProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [time, setTime] = useState(() => toDatetimeLocalValue(new Date()));
  const [feedChecked, setFeedChecked] = useState(false);
  const [peeChecked, setPeeChecked] = useState(false);
  const [poopChecked, setPoopChecked] = useState(false);
  const [amountMl, setAmountMl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const moments = useMemo(() => groupEntriesIntoMoments(entries), [entries]);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [babyId]);

  function resetForm() {
    setTime(toDatetimeLocalValue(new Date()));
    setFeedChecked(false);
    setPeeChecked(false);
    setPoopChecked(false);
    setAmountMl("");
    setNotes("");
  }

  async function handleLog(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const types: EntryType[] = [
      ...(feedChecked ? (["feed"] as const) : []),
      ...(peeChecked ? (["pee"] as const) : []),
      ...(poopChecked ? (["poop"] as const) : []),
    ];

    if (types.length === 0) {
      setError("Check at least one of Feed, Pee, or Poo.");
      return;
    }

    setSubmitting(true);

    const timestamp = new Date(time).toISOString();
    const trimmedNotes = notes.trim() || null;
    const parsedAmount = amountMl.trim() ? Number(amountMl) : null;

    const rows = types.map((type) => ({
      baby_id: babyId,
      logged_by: currentUserId,
      type,
      timestamp,
      notes: trimmedNotes,
      amount_ml: type === "feed" ? parsedAmount : null,
    }));

    const { data, error } = await createClient()
      .from("entries")
      .insert(rows)
      .select();

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    setEntries((prev) => [...(data ?? []), ...prev]);
    resetForm();
  }

  return (
    <div className="flex flex-col gap-4">
      <LastFeedWidget entries={entries} />

      <form
        onSubmit={handleLog}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
            Time
            <input
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-950 dark:text-zinc-50">
            <input
              type="checkbox"
              checked={feedChecked}
              onChange={(e) => setFeedChecked(e.target.checked)}
              className="h-4 w-4"
            />
            Feed
          </label>

          <label className="flex flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
            mL
            <input
              type="number"
              step="0.1"
              min="0"
              value={amountMl}
              disabled={!feedChecked}
              onChange={(e) => setAmountMl(e.target.value)}
              className="w-20 rounded border border-zinc-300 px-2 py-1.5 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-950 dark:text-zinc-50">
            <input
              type="checkbox"
              checked={peeChecked}
              onChange={(e) => setPeeChecked(e.target.checked)}
              className="h-4 w-4"
            />
            Pee
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-950 dark:text-zinc-50">
            <input
              type="checkbox"
              checked={poopChecked}
              onChange={(e) => setPoopChecked(e.target.checked)}
              className="h-4 w-4"
            />
            Poo
          </label>

          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm text-zinc-950 dark:text-zinc-50">
            Notes
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
          >
            {submitting ? "Logging…" : "Log"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-100 text-left text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Feed</th>
              <th className="px-3 py-2 font-medium">mL</th>
              <th className="px-3 py-2 font-medium">Poo</th>
              <th className="px-3 py-2 font-medium">Pee</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 font-medium">Logged by</th>
            </tr>
          </thead>
          <tbody>
            {moments.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-500"
                >
                  No entries yet — log the first one above.
                </td>
              </tr>
            ) : (
              moments.map((moment) => (
                <tr
                  key={moment.key}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                    {new Date(moment.timestamp).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">{moment.feed ? "✓" : ""}</td>
                  <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                    {moment.feed?.amount_ml ?? ""}
                  </td>
                  <td className="px-3 py-2">{moment.poop ? "✓" : ""}</td>
                  <td className="px-3 py-2">{moment.pee ? "✓" : ""}</td>
                  <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                    {moment.notes}
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                    {(moment.loggedBy && memberNames[moment.loggedBy]) ??
                      "Unknown"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

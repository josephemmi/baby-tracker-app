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
import { MomentsTable } from "@/components/log/moments-table";
import { TypeCheckbox } from "@/components/log/type-checkbox";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { PrimaryButton } from "@/components/ui/primary-button";
import { initials, personColor } from "@/lib/person-colors";

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

export function LogMatrix({
  babyId,
  currentUserId,
  members,
  initialEntries,
}: LogMatrixProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [time, setTime] = useState(() => toDatetimeLocalValue(new Date()));
  const [loggedBy, setLoggedBy] = useState(currentUserId);
  const [feedChecked, setFeedChecked] = useState(false);
  const [peeChecked, setPeeChecked] = useState(false);
  const [poopChecked, setPoopChecked] = useState(false);
  const [amountMl, setAmountMl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);

  const memberNames = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member.name])),
    [members],
  );

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
    setLoggedBy(currentUserId);
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
      logged_by: loggedBy,
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

    const inserted = data?.[0];
    if (inserted) {
      const key = `${inserted.timestamp}|${inserted.logged_by ?? "unknown"}`;
      setFlashKey(key);
      setTimeout(() => setFlashKey(null), 1400);
    }

    resetForm();
  }

  return (
    <div className="flex flex-col gap-4">
      <LastFeedWidget entries={entries} />

      <form
        onSubmit={handleLog}
        className="flex flex-col gap-3 rounded-[10px] border border-line bg-paper-raised p-4 shadow-card"
      >
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Time">
            <TextInput
              type="datetime-local"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="tabular-nums"
            />
          </Field>

          <Field label="Logged by">
            <div className="flex gap-1.5">
              {members.map((member, index) => {
                const color = personColor(index);
                const active = loggedBy === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setLoggedBy(member.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                      active
                        ? "border-sage bg-sage-soft text-ink"
                        : "border-line-strong text-ink-soft hover:bg-paper"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${color.bg} ${color.text}`}
                    >
                      {initials(member.name)}
                    </span>
                    {member.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <TypeCheckbox
            checked={feedChecked}
            onChange={setFeedChecked}
            color="amber"
            label="Feed"
          />

          <Field label="mL">
            <div className="flex items-center gap-1.5">
              <TextInput
                type="number"
                step="0.1"
                min="0"
                value={amountMl}
                disabled={!feedChecked}
                onChange={(e) => setAmountMl(e.target.value)}
                focusColor="amber"
                className="w-20 text-right tabular-nums"
              />
              <span className="text-[13.5px] text-ink-soft">ml</span>
            </div>
          </Field>

          <TypeCheckbox
            checked={peeChecked}
            onChange={setPeeChecked}
            color="brand-blue"
            label="Pee"
          />

          <TypeCheckbox
            checked={poopChecked}
            onChange={setPoopChecked}
            color="terracotta"
            label="Poo"
          />

          <Field label="Notes">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note…"
              className="min-w-40 rounded-[10px] border border-transparent bg-transparent px-3 py-2 text-[13.5px] text-ink placeholder:text-line-strong placeholder:italic hover:border-line focus:border-line-strong focus:bg-paper focus:outline-none"
            />
          </Field>

          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? "Logging…" : "Log a moment"}
          </PrimaryButton>
        </div>
        {error && <p className="text-sm text-terracotta">{error}</p>}
      </form>

      <MomentsTable
        moments={moments}
        memberNames={memberNames}
        emptyMessage="No entries yet — log the first moment above."
        flashMomentKey={flashKey}
      />
    </div>
  );
}

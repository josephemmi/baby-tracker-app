"use client";

import { useEffect, useState } from "react";
import type { Moment } from "@/lib/entries";

// Shared by the desktop table row and the mobile card (and, since both
// reuse the same row components, Timeline too): tapping the notes field —
// empty or not — opens the same modal for reading/writing/editing/deleting,
// rather than a small inline field that gets cramped once real text exists.
export function NotesCell({
  moment,
  editable,
  timeLabel,
  onNotesCommit,
  size = "table",
}: {
  moment: Moment;
  editable: boolean;
  timeLabel: string;
  onNotesCommit?: (moment: Moment, value: string) => void;
  size?: "table" | "card";
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const hasNotes = !!moment.notes && moment.notes.trim() !== "";

  // Timeline is read-only and never had an inline input here — nothing to
  // show for an empty note, matching existing behavior.
  if (!hasNotes && !editable) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={
          hasNotes
            ? size === "table"
              ? "flex w-full max-w-[280px] items-center gap-1.5 truncate rounded-[10px] px-2 py-1.5 text-left text-[13.5px] text-ink hover:bg-sage-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sage"
              : "flex w-full items-center gap-1.5 truncate rounded-[8px] border border-line bg-paper px-2.5 py-2 text-left text-[13px] text-ink hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sage"
            : size === "table"
              ? "w-full min-w-40 rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-left text-[13.5px] text-line-strong italic hover:border-line hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sage"
              : "w-full rounded-[8px] border border-line bg-paper px-2.5 py-2 text-left text-[13px] text-line-strong italic hover:bg-paper-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sage"
        }
      >
        {hasNotes ? (
          <>
            <NoteIcon />
            <span className="block min-w-0 flex-1 truncate">{moment.notes}</span>
          </>
        ) : (
          "Add a note…"
        )}
      </button>
      {modalOpen && (
        <NotesModal
          initialValue={moment.notes ?? ""}
          timeLabel={timeLabel}
          editable={editable}
          onSave={(value) => {
            onNotesCommit?.(moment, value);
            setModalOpen(false);
          }}
          onDelete={() => {
            onNotesCommit?.(moment, "");
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function NoteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 opacity-55"
      aria-hidden="true"
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

function NotesModal({
  initialValue,
  timeLabel,
  editable,
  onSave,
  onDelete,
  onClose,
}: {
  initialValue: string;
  timeLabel: string;
  editable: boolean;
  onSave: (value: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const hasChanged = value !== initialValue;
  const hasExisting = initialValue.trim() !== "";

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[440px] rounded-[14px] bg-paper-raised p-5 pb-[18px] shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[15px] font-bold text-ink">Note</span>
          <span className="flex-1 text-[12.5px] tabular-nums text-ink-soft">{timeLabel}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-soft transition-colors hover:bg-terracotta-soft hover:text-terracotta"
          >
            ✕
          </button>
        </div>
        {/* Deliberately not autoFocus — opening the modal should be a pure
            view; auto-focusing pulls up the on-screen keyboard on mobile
            immediately, eating the viewport when the user just wants to
            read. The textarea only gains focus once the user taps into it
            themselves. */}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={!editable}
          placeholder="Add a note…"
          className="min-h-[120px] w-full resize-y rounded-[10px] border border-line-strong bg-paper p-3 text-[14.5px] leading-relaxed text-ink placeholder:text-line-strong placeholder:italic focus:border-sage focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-sage"
        />
        {editable && (
          <div className={`mt-3.5 flex items-center ${hasExisting ? "justify-between" : "justify-end"}`}>
            {hasExisting && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-full border border-terracotta bg-terracotta-soft px-4 py-2 text-[13px] font-bold text-terracotta transition-colors hover:brightness-95"
              >
                Delete note
              </button>
            )}
            <button
              type="button"
              onClick={() => onSave(value)}
              disabled={!hasChanged}
              className="rounded-full bg-sage px-5 py-2 text-[13px] font-bold text-paper-raised shadow-card transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-paper-raised disabled:shadow-none disabled:hover:brightness-100"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

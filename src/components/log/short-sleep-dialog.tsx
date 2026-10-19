"use client";

import { useEffect, useRef } from "react";

interface ShortSleepDialogProps {
  open: boolean;
  // Keep sleeping — also what Esc and a tap outside the dialog do.
  onKeep: () => void;
  onStopAndSave: () => void;
  onDiscard: () => void;
}

// Stop Sleep, tapped when the whole sleep so far is under a minute (JOS-56).
// Stop itself always works; this only asks first. UI only — the database has
// no such rule. Same shell as ConfirmDeleteModal (max-w 300, rounded-2xl,
// 40px buttons with a 10px radius), with the three choices stacked.
export function ShortSleepDialog({
  open,
  onKeep,
  onStopAndSave,
  onDiscard,
}: ShortSleepDialogProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  // The latest onKeep, without making the effect below re-run (and re-grab
  // focus) every time the parent re-renders — a poll or the other parent's
  // change can re-render it while this is open.
  const onKeepRef = useRef(onKeep);
  useEffect(() => {
    onKeepRef.current = onKeep;
  });

  useEffect(() => {
    if (!open) return;
    keepRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onKeepRef.current();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = modalRef.current.querySelectorAll<HTMLElement>("button");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onKeep();
      }}
    >
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="short-sleep-title"
        aria-describedby="short-sleep-body"
        className="w-full max-w-[300px] rounded-2xl bg-paper p-5 shadow-card"
      >
        <p id="short-sleep-title" className="mb-2 text-[17px] font-medium text-ink">
          Less than a minute has passed
        </p>
        <p id="short-sleep-body" className="mb-[18px] text-sm leading-relaxed text-ink-soft">
          Keep sleeping, stop and save this sleep, or discard it?
        </p>
        <div className="flex flex-col gap-2">
          <button
            ref={keepRef}
            type="button"
            onClick={onKeep}
            className="h-10 rounded-[10px] border border-night bg-night text-sm font-medium text-white transition-[filter] duration-150 hover:brightness-110"
          >
            Keep sleeping
          </button>
          <button
            type="button"
            onClick={onStopAndSave}
            className="h-10 rounded-[10px] border border-line-strong bg-transparent text-sm font-medium text-ink transition-colors hover:bg-paper-raised"
          >
            Stop and save
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="h-10 rounded-[10px] border border-transparent bg-transparent text-sm font-medium text-stop transition-colors hover:bg-rose-soft"
          >
            Discard sleep
          </button>
        </div>
      </div>
    </div>
  );
}

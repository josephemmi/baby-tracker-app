"use client";

import { useEffect, useRef } from "react";

interface ConfirmDeleteModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Replaces window.confirm(...) for delete-entry flows (JOS-44) — the native
// dialog's browser-generated title bar ("<url> says") read as unfinished.
export function ConfirmDeleteModal({
  open,
  title,
  body,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
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
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-body"
        className="w-full max-w-[300px] rounded-2xl bg-paper p-5 shadow-card"
      >
        <p id="confirm-delete-title" className="mb-2 text-[17px] font-medium text-ink">
          {title}
        </p>
        <p id="confirm-delete-body" className="mb-[18px] text-sm leading-relaxed text-ink-soft">
          {body}
        </p>
        <div className="flex gap-2.5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-10 flex-1 rounded-[10px] border border-line-strong bg-transparent text-sm font-medium text-ink transition-colors hover:bg-paper"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 flex-1 rounded-[10px] bg-rose text-sm font-medium text-paper transition-[filter] duration-150 hover:brightness-[1.06]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

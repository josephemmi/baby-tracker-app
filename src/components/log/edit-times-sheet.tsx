"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Sleep } from "@/lib/sleep";
import {
  EDIT_END_HINT,
  EDIT_HELP,
  EDIT_NOT_SET,
  EDIT_OPEN_PAUSE_HINT,
  EDIT_SAVE,
  EDIT_TITLE,
  addBlock,
  blockLabel,
  buildDraft,
  canSave,
  editSummary,
  evaluateDraft,
  formatClock,
  issuesByField,
  pauseEndField,
  pauseStartField,
  removeBlock,
  removedPauseLine,
  setClock,
  sleepEndField,
  sleepStartField,
  staleResult,
  staleWarning,
  undoRemoveBlock,
  type Draft,
  type EditModel,
} from "@/lib/sleep-edit";
import type { Zone } from "@/lib/sleep-format";
import { TimeWheel } from "@/components/log/time-wheel";

// What saving came to, as the card's owner reports it.
export type EditTimesResult =
  | { kind: "saved" }
  // Someone changed the sleep since the sheet opened: nothing was saved, and
  // this is the latest copy.
  | { kind: "stale"; sleep: Sleep }
  // A rule said no, or the network dropped: shown under the buttons.
  | { kind: "error"; message: string };

interface EditTimesSheetProps {
  sleep: Sleep;
  // Every sleep we know of: the others are what this one may not overlap.
  sleeps: Sleep[];
  now: number;
  zone: Zone;
  // A member's name for the "Jen changed this sleep" lines; the app itself
  // for a sleep that closed itself.
  nameOf: (memberId: string | null) => string;
  // Resolves when the write is answered. `expectedRev` is the rev the sheet
  // opened on.
  onSave: (model: EditModel, expectedRev: number) => Promise<EditTimesResult>;
  onClose: (how: "cancel" | "saved") => void;
}

const SECTION =
  "border-t-[1.5px] border-line-strong pt-3 first:border-t-0 first:pt-0";
const SECTION_TITLE = "text-[17px] font-extrabold";
const SMALL_BUTTON =
  "min-h-[44px] rounded-full border-[1.5px] bg-transparent px-3.5 text-[13px] font-bold";

interface RowProps {
  id: string;
  // Makes the error's id unique when two sheets could be on the page.
  uid: string;
  // "Started" / "Ended"
  label: string;
  // The whole name for screen readers: "Pause 1 started".
  fullLabel: string;
  hint?: string;
  text: string | null;
  date: string;
  error: string;
  open: boolean;
  onToggle: () => void;
}

// A label on the left (with its date under it) and the time box on the right.
// The WHOLE row is the tap target: the box is the button a keyboard and a
// screen reader find, but a tap on the label, the date or the empty space
// does the same, and tapping again closes the wheel. The wheel, when open,
// sits inside the row under it (and stops its own taps reaching the row).
function Row({
  id,
  uid,
  label,
  fullLabel,
  hint,
  text,
  date,
  error,
  open,
  onToggle,
  children,
}: RowProps & { children?: React.ReactNode }) {
  const errorId = `${uid}${id}-error`;
  return (
    <div
      data-field={id}
      onClick={onToggle}
      className="grid cursor-pointer grid-cols-[1fr_auto] items-start gap-x-2.5 py-2"
    >
      <span
        data-label
        className="col-start-1 row-start-1 text-[14px] leading-[1.25] font-bold"
      >
        {label}
        {hint && (
          <span className="block text-[12px] leading-[1.35] font-semibold text-ink-soft">
            {hint}
          </span>
        )}
      </span>
      <span
        data-date
        className="col-start-1 row-start-2 mt-0.5 text-[12px] text-ink-soft empty:hidden"
      >
        {date}
      </span>
      {/* The spec asks for aria-invalid on the field; the error itself is also
          tied to it with aria-describedby and announced (role="alert"). */}
      {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${fullLabel}: ${text ?? EDIT_NOT_SET}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`col-start-2 row-span-2 row-start-1 min-h-[44px] min-w-[96px] cursor-pointer self-start rounded-[10px] border-[1.5px] px-3 text-right text-[18px] tabular-nums ${
          text === null ? "font-semibold text-ink-soft" : "font-bold"
        } ${
          error
            ? "border-danger bg-rose-soft"
            : open
              ? "border-night bg-paper shadow-[0_0_0_2px_var(--color-night-soft)]"
              : "border-line-strong bg-paper"
        }`}
      >
        {text ?? EDIT_NOT_SET}
      </button>
      <p
        id={errorId}
        role="alert"
        className="col-span-2 row-start-3 mt-1 text-[12.5px] font-semibold text-danger empty:hidden"
      >
        {error}
      </p>
      {children}
    </div>
  );
}

// The Edit times sheet (JOS-103): one sub-card inside the sleep card listing
// every time of the sleep and of each pause. All the rules live in
// lib/sleep-edit.ts; this only draws them. Nothing is saved until Save; the
// draft is rebuilt from the latest copy when someone else got there first.
export function EditTimesSheet({
  sleep,
  sleeps,
  now,
  zone,
  nameOf,
  onSave,
  onClose,
}: EditTimesSheetProps) {
  const [draft, setDraft] = useState<Draft>(() => buildDraft(sleep, now, zone));
  // The rev this sheet's times came from.
  const [openRev, setOpenRev] = useState(sleep.rev);
  const [picker, setPicker] = useState<string | null>(null);
  // What to say under the buttons after a save that did not happen.
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const uid = useId();
  const titleId = `${uid}title`;

  const others = useMemo(
    () => sleeps.filter((o) => o.id !== sleep.id),
    [sleeps, sleep.id],
  );
  const evaluation = evaluateDraft(draft, { now, others, zone });
  const byField = issuesByField(evaluation.issues);
  const summary = editSummary(evaluation, now, zone);
  const modelStart = evaluation.ms[sleepStartField] ?? null;

  const changedBySomeoneElse = sleep.rev !== openRev;
  const who = nameOf(sleep.last.by);

  // Focus moves to the first time when the sheet opens.
  useEffect(() => {
    rootRef.current
      ?.querySelector<HTMLButtonElement>("button[aria-expanded]")
      ?.focus();
  }, []);

  // A wheel opens under its row, which on a phone can be below the fold.
  useEffect(() => {
    if (!picker) return;
    rootRef.current
      ?.querySelector(`[data-field="${picker}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [picker]);

  function focusTime(id: string) {
    rootRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-field="${id}"] button[aria-expanded]`,
      )
      ?.focus();
  }

  function fieldOf(id: string) {
    return draft.fields.find((f) => f.id === id);
  }

  function textFor(id: string): string | null {
    const f = fieldOf(id);
    return f && f.clock !== null ? formatClock(f.clock) : null;
  }

  function dateFor(id: string): string {
    const ms = evaluation.ms[id];
    return ms == null ? "" : zone.fmtDay(ms);
  }

  const toggle = (id: string) => setPicker((cur) => (cur === id ? null : id));

  function reload(latest: Sleep, message: string) {
    setDraft(buildDraft(latest, now, zone));
    setOpenRev(latest.rev);
    setPicker(null);
    setNote(message);
  }

  async function save() {
    if (saving || !canSave(evaluation) || !evaluation.model) return;
    setNote(null);
    // First write wins. If we already know the sleep moved on, don't ask.
    if (sleep.rev !== openRev) {
      reload(sleep, staleResult(who, sleep.last.at, zone));
      return;
    }
    setSaving(true);
    const result = await onSave(evaluation.model, openRev);
    setSaving(false);
    if (result.kind === "saved") onClose("saved");
    else if (result.kind === "stale") {
      reload(
        result.sleep,
        staleResult(nameOf(result.sleep.last.by), result.sleep.last.at, zone),
      );
    } else setNote(result.message);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    // Escape closes the wheel first, and the sheet on the next press.
    if (picker) {
      const id = picker;
      setPicker(null);
      focusTime(id);
    } else onClose("cancel");
  }

  function addPause() {
    const next = addBlock(draft);
    setDraft(next);
    setPicker(null);
    const row = next.next - 1;
    window.setTimeout(() => {
      focusTime(pauseStartField(row));
    }, 0);
  }

  function renderWheel(id: string) {
    const f = fieldOf(id);
    if (!f || picker !== id) return null;
    return (
      <TimeWheel
        // Fresh per open row, so it starts on that row's time.
        key={id}
        value={f.clock}
        fallback={
          modelStart !== null ? zone.clockOf(modelStart) : zone.clockOf(now)
        }
        onChange={(minutes) => setDraft((d) => setClock(d, id, minutes))}
        onClear={() => {
          setDraft((d) => setClock(d, id, null));
          setPicker(null);
        }}
        onDone={() => {
          setPicker(null);
          focusTime(id);
        }}
      />
    );
  }

  const row = (id: string, label: string, fullLabel: string, hint?: string) => (
    <Row
      id={id}
      uid={uid}
      label={label}
      fullLabel={fullLabel}
      hint={hint}
      text={textFor(id)}
      date={dateFor(id)}
      error={byField[id] ?? ""}
      open={picker === id}
      onToggle={() => toggle(id)}
    >
      {renderWheel(id)}
    </Row>
  );

  const hasNew = draft.blocks.some((b) => b.isNew);

  return (
    <section
      ref={rootRef}
      data-edit-times-sheet
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="mb-2.5 flex flex-col gap-2.5 rounded-[12px] border-[1.5px] border-night bg-paper-raised p-3"
    >
      <h3 id={titleId} className="text-[16px] font-extrabold">
        {EDIT_TITLE}
      </h3>
      <p className="text-[13px] text-ink-soft">{EDIT_HELP}</p>

      <div className="flex flex-col gap-3">
        <section className={SECTION} aria-label="Sleep">
          <div className="flex items-center justify-between gap-2">
            <h4 className={SECTION_TITLE}>Sleep</h4>
          </div>
          {row(sleepStartField, "Started", "Sleep started")}
          {row(sleepEndField, "Ended", "Sleep ended", EDIT_END_HINT)}
        </section>

        {draft.blocks.map((b) => {
          const label = blockLabel(draft, b);
          const s = pauseStartField(b.row);
          const e = pauseEndField(b.row);
          if (b.removed) {
            const start = fieldOf(s)?.orig ?? null;
            const end = fieldOf(e)?.orig ?? null;
            return (
              <section
                key={b.row}
                className={SECTION}
                aria-label={label}
                data-block-removed
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className={`${SECTION_TITLE} text-ink-soft line-through`}>
                    {label}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setDraft((d) => undoRemoveBlock(d, b.row))}
                    className={`${SMALL_BUTTON} border-night text-night`}
                  >
                    Undo
                  </button>
                </div>
                <p className="mt-0.5 mb-1.5 text-[13px] text-ink-soft">
                  {removedPauseLine(zone, start, end, end === null)}
                </p>
              </section>
            );
          }
          const openPause = !b.isNew && fieldOf(e)?.orig === null;
          return (
            <section
              key={b.row}
              className={`${SECTION} ${b.isNew ? "mt-1" : ""}`}
              aria-label={label}
              data-block={b.isNew ? "new" : "pause"}
            >
              <div className="flex items-center justify-between gap-2">
                <h4
                  className={`${SECTION_TITLE} ${b.isNew ? "text-ink-soft" : ""}`}
                >
                  {label}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    if (picker === s || picker === e) setPicker(null);
                    setDraft((d) => removeBlock(d, b.row));
                  }}
                  className={`${SMALL_BUTTON} border-danger text-danger`}
                >
                  {b.isNew ? "Remove" : "Remove pause"}
                </button>
              </div>
              {row(
                s,
                "Started",
                `${label} started`,
                b.isNew ? "Optional" : undefined,
              )}
              {row(
                e,
                "Ended",
                `${label} ended`,
                b.isNew
                  ? "Optional"
                  : openPause
                    ? EDIT_OPEN_PAUSE_HINT
                    : undefined,
              )}
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addPause}
        className="min-h-[46px] w-full rounded-full border-[1.5px] border-night bg-paper-raised p-3 text-[14px] font-bold text-night"
      >
        + {hasNew ? "Add another pause" : "Add a pause"}
      </button>

      <p
        role="status"
        className="rounded-[8px] bg-night-soft px-2.5 py-2 text-[13px] font-semibold text-night empty:hidden"
      >
        {summary}
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !canSave(evaluation)}
          className="min-h-[46px] w-full rounded-full border-[1.5px] border-night bg-night p-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {EDIT_SAVE}
        </button>
        <button
          type="button"
          onClick={() => onClose("cancel")}
          className="min-h-[46px] w-full rounded-full border-[1.5px] border-line-strong bg-transparent p-3 text-[14px] font-bold"
        >
          Cancel
        </button>
      </div>

      {/* Under the buttons: the other parent changed the sleep while this was
          open (a warning), or a save did not happen (what happened). */}
      <p
        role="status"
        className="rounded-[8px] bg-rose-soft px-2.5 py-2 text-[12.5px] font-semibold text-rose-dark empty:hidden"
      >
        {note ??
          (changedBySomeoneElse ? staleWarning(who, sleep.last.at, zone) : "")}
      </p>
    </section>
  );
}

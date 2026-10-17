"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedCommit } from "@/lib/debounced-commit";
import type { Sleep, SleepField, SleepWorld } from "@/lib/sleep";
import type { SleepTimeInput } from "@/lib/sleep-api";
import {
  WHEEL_MINUTES,
  agoLabel,
  agoOutOfRange,
  clockLabel,
  defaultAgo,
  judgePick,
  type Pick,
  type Zone,
} from "@/lib/sleep-format";

// One wheel row, in px. The CSS in globals.css and the band below are sized
// for exactly this: five rows show (170px), the middle one is the value.
const WHEEL_ROW_PX = 34;

// How long after the phone's own time picker hands back a value before it is
// saved. Android's dialog answers once, on OK; a desktop field or a wheel that
// reports every change must not save the first half-typed value.
const TIME_SAVE_DELAY_MS = 400;

const CONFIRM_BUTTON =
  "w-full rounded-full border-[1.5px] border-night bg-night p-[11px] text-center text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45";

function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`h-4 w-4 flex-none text-ink-soft transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Both rows look the same: sentence-case label, the word "Choose" (or what
// was chosen), the same chevron. The whole row is the tap target.
function rowClasses(set: boolean) {
  return `relative flex min-h-[44px] w-full items-center gap-2 rounded-[8px] border px-3 text-left ${
    set ? "border-night bg-night-soft" : "border-line-strong bg-paper-raised"
  }`;
}

function RowValue({ set, children }: { set: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`min-w-0 flex-1 text-right text-[14px] tabular-nums ${
        set ? "font-bold text-night-deep" : "text-ink-soft"
      }`}
    >
      {children}
    </span>
  );
}

function Wheel({
  selected,
  isOutOfRange,
  onChange,
  onConfirm,
}: {
  selected: number | null;
  isOutOfRange: (minutes: number) => boolean;
  onChange: (minutes: number) => void;
  // Tapping the row that is already the value, or Enter on the wheel: the
  // same as the Set button under it.
  onConfirm: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initial = useRef(selected);

  // Opening the wheel lands on its first row straight away, like a phone's
  // own wheel; this puts the scroll position there before it is seen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || initial.current == null) return;
    el.scrollTop = WHEEL_MINUTES.indexOf(initial.current) * WHEEL_ROW_PX;
  }, []);

  const indexAt = (el: HTMLElement) =>
    Math.max(0, Math.min(WHEEL_MINUTES.length - 1, Math.round(el.scrollTop / WHEEL_ROW_PX)));

  return (
    <div className="relative mt-1.5 h-[170px] overflow-hidden rounded-[8px] border border-line-strong bg-paper-raised">
      <div
        className="pointer-events-none absolute top-[67px] right-1.5 left-1.5 h-[34px] rounded-[7px] border border-night bg-night-soft"
        aria-hidden="true"
      />
      <div
        ref={scrollRef}
        role="listbox"
        aria-label="How long ago"
        tabIndex={0}
        // Whichever row is centred is the value, live while scrolling.
        onScroll={(e) => {
          const minutes = WHEEL_MINUTES[indexAt(e.currentTarget)];
          if (minutes !== selected) onChange(minutes);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (selected != null && !isOutOfRange(selected)) onConfirm();
            return;
          }
          const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = Math.max(
            0,
            Math.min(WHEEL_MINUTES.length - 1, indexAt(e.currentTarget) + step),
          );
          // Instant, not smooth: a second press while the first is still
          // gliding would otherwise be measured from the middle of it and
          // lost.
          e.currentTarget.scrollTo({ top: next * WHEEL_ROW_PX });
        }}
        className="sleep-wheel-scroll relative z-[1] h-full overflow-y-auto py-[67px] focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_2px_var(--color-night)]"
      >
        {WHEEL_MINUTES.map((minutes, i) => {
          const isSelected = selected === minutes;
          return (
            <div
              key={minutes}
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                if (isSelected && !isOutOfRange(minutes)) onConfirm();
                else scrollRef.current?.scrollTo({ top: i * WHEEL_ROW_PX, behavior: "smooth" });
              }}
              className={`sleep-wheel-item h-[34px] cursor-pointer text-center leading-[34px] tabular-nums select-none ${
                isSelected ? "text-[16px] font-bold text-night-deep" : "text-[15px] text-ink-soft"
              } ${isOutOfRange(minutes) ? "opacity-35" : ""}`}
            >
              {agoLabel(minutes)}
            </div>
          );
        })}
      </div>
      <div className="sleep-wheel-mask pointer-events-none absolute inset-0 z-[2]" aria-hidden="true" />
    </div>
  );
}

interface SleepTimePickerProps {
  sleep: Sleep;
  // Every sleep we know of — the window a time may fall in depends on the
  // sleep before this one.
  sleeps: Sleep[];
  now: number;
  field: SleepField;
  zone: Zone;
  onCancel: () => void;
  // Resolves to a message when the server refused the time, null when saved.
  onSave: (input: SleepTimeInput) => Promise<string | null>;
}

// "Sleep started…" (from "Started earlier?") and "Woke up…" (from "Woke
// earlier?"): a subcard inside the sleep card. Two ways to say when — a
// how-long-ago wheel, or a time-only field — and each one saves as soon as
// it is chosen, so there is no separate Save step:
//   • the wheel: scroll, then Set (or tap the highlighted row);
//   • the time field: the phone's own picker, saved when it hands a time back.
// The one confirmation left is for a time more than 3 h ago ("Save anyway").
export function SleepTimePicker({
  sleep,
  sleeps,
  now,
  field,
  zone,
  onCancel,
  onSave,
}: SleepTimePickerProps) {
  const [mode, setMode] = useState<Pick["mode"]>(null);
  const [ago, setAgo] = useState<number | null>(null);
  const [time, setTime] = useState("");
  const [wheelOpen, setWheelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  // The subcard (and then the wheel inside it) opens below the tapped link,
  // which on a phone can be below the fold: bring it into view.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [wheelOpen]);

  const world: SleepWorld = { now, sleeps };
  const pick: Pick = { field, mode, ago, time };
  const judgement = judgePick(world, sleep, pick, zone);
  const agoSet = mode === "ago" && ago != null;
  const timeSet = mode === "time";

  const previewKind = serverError ? "err" : judgement.kind;
  const previewText = serverError ?? judgement.text;
  const canConfirm = !saving && (judgement.kind === "ok" || judgement.kind === "warn");

  async function commit(input: SleepTimeInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    const message = await onSave(input);
    inFlight.current = false;
    setSaving(false);
    if (message) setServerError(message);
  }

  // The phone's picker answered with a time that is fine: save it, a moment
  // later (see TIME_SAVE_DELAY_MS).
  const timeCommit = useDebouncedCommit<number>((ms) => void commit({ at: ms }), TIME_SAVE_DELAY_MS);

  function chooseAgo(minutes: number) {
    timeCommit.cancel();
    setMode("ago");
    setAgo(minutes);
    setTime("");
    setServerError(null);
  }

  function toggleWheel() {
    timeCommit.cancel();
    if (wheelOpen) {
      // Folding the wheel away without Set changes nothing.
      setMode(null);
      setAgo(null);
      setServerError(null);
      setWheelOpen(false);
      return;
    }
    // Opening the wheel selects its first allowed row.
    chooseAgo(defaultAgo(world, sleep, field));
    setWheelOpen(true);
  }

  function confirmWheel() {
    if (ago == null || !canConfirm) return;
    void commit({ agoMinutes: ago });
  }

  function changeTime(value: string) {
    setServerError(null);
    if (!value) {
      timeCommit.cancel();
      if (mode === "time") setMode(null);
      setTime("");
      return;
    }
    setMode("time");
    setTime(value);
    setAgo(null);
    setWheelOpen(false);
    // Fine as it is: save. Too early, in the future, or long ago: say so and
    // wait ("Save anyway" for the last one).
    const j = judgePick(world, sleep, { field, mode: "time", ago: null, time: value }, zone);
    if (j.kind === "ok") timeCommit.trigger(j.ms);
    else timeCommit.cancel();
  }

  const previewColor =
    previewKind === "ok" ? "text-sage" : previewKind === "warn" ? "text-amber" : "text-terracotta";
  const showSaveAnyway = !wheelOpen && mode === "time" && judgement.kind === "warn" && !serverError;

  return (
    <div
      ref={rootRef}
      className="mb-2.5 rounded-[10px] border border-line-strong bg-paper p-3"
      data-sleep-picker
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <b className="text-[13.5px] text-ink">{field === "start" ? "Sleep started…" : "Woke up…"}</b>
        <button
          type="button"
          onClick={onCancel}
          className="px-0.5 py-1 text-[12.5px] font-bold text-ink-soft hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <button
        type="button"
        onClick={toggleWheel}
        aria-expanded={wheelOpen}
        className={rowClasses(agoSet)}
      >
        <span className="text-[14px] font-semibold whitespace-nowrap text-ink">How long ago</span>
        <RowValue set={agoSet}>{agoSet && ago != null ? agoLabel(ago) : "Choose"}</RowValue>
        <Chevron open={wheelOpen} />
      </button>
      {wheelOpen && (
        <Wheel
          selected={ago}
          isOutOfRange={(m) => agoOutOfRange(world, sleep, field, m)}
          onChange={chooseAgo}
          onConfirm={confirmWheel}
        />
      )}

      {/* While the wheel is open it is the only way being offered: the other
          row comes back when the wheel is folded away. */}
      {!wheelOpen && (
        <>
          {/* The only upper-case label in this subcard, by decision. */}
          <div
            className="my-1.5 flex items-center gap-2.5 text-[12px] leading-5 font-bold tracking-[0.08em] text-ink-soft"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-line" />
            OR
            <span className="h-px flex-1 bg-line" />
          </div>

          <label className={`${rowClasses(timeSet)} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-night`}>
            <span className="text-[14px] font-semibold whitespace-nowrap text-ink">Pick a time</span>
            <RowValue set={timeSet}>{timeSet && time ? clockLabel(time) : "Choose"}</RowValue>
            <Chevron />
            <input
              type="time"
              step={60}
              value={time}
              aria-label="Pick a time"
              onChange={(e) => changeTime(e.target.value)}
              // Phones open the picker from any tap on the field; desktop
              // browsers need to be asked.
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  // Not allowed here: the field still works by typing.
                }
              }}
              className="sleep-time-overlay absolute -inset-px z-[2] m-0 cursor-pointer border-0 p-0 text-[16px] opacity-0"
            />
          </label>
        </>
      )}

      <div
        aria-live="polite"
        className={previewText ? `mt-2 mb-1.5 text-center text-[12.5px] leading-5 font-bold ${previewColor}` : "hidden"}
      >
        {previewText}
      </div>

      {wheelOpen && (
        <button
          type="button"
          onClick={confirmWheel}
          disabled={!canConfirm}
          className={`${CONFIRM_BUTTON} ${previewText ? "" : "mt-2"}`}
        >
          Set
        </button>
      )}
      {showSaveAnyway && (
        <button
          type="button"
          onClick={() => void commit({ at: judgement.ms })}
          disabled={!canConfirm}
          className={`${CONFIRM_BUTTON} ${previewText ? "" : "mt-2"}`}
        >
          Save anyway
        </button>
      )}
    </div>
  );
}

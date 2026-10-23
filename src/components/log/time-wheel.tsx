"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { clockFrom12, clockTo12, type Half } from "@/lib/sleep-edit";

// One wheel row, in px. The CSS in globals.css (.edit-wheel) and the selection
// band are sized for exactly this: five rows show (170px), the middle one is
// the value.
const ROW_PX = 34;

// How long after the last scroll event the nearest row becomes the value.
const SETTLE_MS = 90;

type Column = "hour" | "minute" | "half";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const HALVES: Half[] = ["am", "pm"];

const COLUMN_LABEL: Record<Column, string> = {
  hour: "Hour",
  minute: "Minute",
  half: "AM or PM",
};

const itemText = (column: Column, v: number | Half) =>
  column === "minute"
    ? String(v).padStart(2, "0")
    : column === "half"
      ? String(v).toUpperCase()
      : String(v);

interface WheelColumnProps<T extends number | Half> {
  column: Column;
  values: readonly T[];
  selected: T;
  onPick: (value: T) => void;
}

// One scrolling column. Scroll-snap does the feel; every row is also a button,
// so a tap picks it and a keyboard can reach it (arrow keys move the choice
// within the column, and only the chosen row is a tab stop).
function WheelColumn<T extends number | Half>({
  column,
  values,
  selected,
  onPick,
}: WheelColumnProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number | null>(null);
  const selectedIndex = values.indexOf(selected);
  // What the settle timer reads when it fires, not what it saw when it was set.
  const latest = useRef({ selected, onPick });
  useEffect(() => {
    latest.current = { selected, onPick };
  });

  // A scroll the wheel makes itself (opening on a value, tapping a row) ends
  // exactly on the chosen row, so when it settles it finds nothing to change;
  // only a finger moving the column picks a different one. They are instant,
  // not smooth, so there is no half-way row to be caught on.
  function scrollToIndex(index: number) {
    ref.current?.scrollTo({ top: index * ROW_PX });
  }

  // Opening lands on the value before it is seen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = selectedIndex * ROW_PX;
    return () => {
      if (settle.current !== null) window.clearTimeout(settle.current);
    };
    // Once, on mount: later changes scroll through scrollToIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    if (settle.current !== null) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(
        0,
        Math.min(values.length - 1, Math.round(el.scrollTop / ROW_PX)),
      );
      if (values[i] !== latest.current.selected)
        latest.current.onPick(values[i]);
    }, SETTLE_MS);
  }

  function choose(index: number) {
    onPick(values[index]);
    scrollToIndex(index);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step =
      e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowUp"
          ? -1
          : e.key === "Home"
            ? -Infinity
            : e.key === "End"
              ? Infinity
              : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(values.length - 1, selectedIndex + step));
    choose(next);
    ref.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label={COLUMN_LABEL[column]}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      className="edit-wheel h-[170px] overflow-y-auto"
    >
      <div className="h-[68px]" aria-hidden="true" />
      {values.map((v, i) => {
        const on = i === selectedIndex;
        return (
          <button
            key={String(v)}
            type="button"
            aria-pressed={on}
            tabIndex={on ? 0 : -1}
            onClick={() => choose(i)}
            className={`edit-wheel-item block h-[34px] w-full cursor-pointer tabular-nums focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_2px_var(--color-night)] ${
              on
                ? "text-[18px] font-extrabold text-night"
                : "text-[18px] font-semibold text-ink-soft"
            }`}
          >
            {itemText(column, v)}
          </button>
        );
      })}
      <div className="h-[68px]" aria-hidden="true" />
    </div>
  );
}

interface TimeWheelProps {
  // The field's time as minutes since midnight, or null while it is empty.
  value: number | null;
  // What an empty field opens on: the sleep's start time.
  fallback: number;
  // Live: every choice updates the field at once.
  onChange: (minutes: number) => void;
  onClear: () => void;
  onDone: () => void;
}

// The 12-hour time wheel (JOS-103): hour, minute, AM / PM, Clear and Done. It
// replaces the phone's own time field, which follows the phone's 24-hour
// setting and can't be overridden by a page. Mount one per open row.
export function TimeWheel({
  value,
  fallback,
  onChange,
  onClear,
  onDone,
}: TimeWheelProps) {
  const [pick, setPick] = useState(() => clockTo12(value ?? fallback));

  function choose<K extends keyof typeof pick>(key: K, v: (typeof pick)[K]) {
    const next = { ...pick, [key]: v };
    setPick(next);
    onChange(clockFrom12(next.hour, next.minute, next.half));
  }

  return (
    <div
      role="group"
      aria-label="Pick a time"
      onClick={(e) => e.stopPropagation()}
      className="col-span-2 mt-2 cursor-default rounded-[12px] border border-line bg-paper-raised p-2"
    >
      <div className="relative grid grid-cols-3 gap-1.5">
        <WheelColumn
          column="hour"
          values={HOURS}
          selected={pick.hour}
          onPick={(v) => choose("hour", v)}
        />
        <WheelColumn
          column="minute"
          values={MINUTES}
          selected={pick.minute}
          onPick={(v) => choose("minute", v)}
        />
        <WheelColumn
          column="half"
          values={HALVES}
          selected={pick.half}
          onPick={(v) => choose("half", v)}
        />
        <div
          className="pointer-events-none absolute right-0 left-0 top-[68px] h-[34px] rounded-[6px] border-y-[1.5px] border-night"
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onClear}
          className="min-h-[46px] flex-1 rounded-full border-[1.5px] border-line-strong bg-transparent p-3 text-[14px] font-bold"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(clockFrom12(pick.hour, pick.minute, pick.half));
            onDone();
          }}
          className="min-h-[46px] flex-1 rounded-full border-[1.5px] border-night bg-night p-3 text-[14px] font-bold text-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}

import type { EntryType } from "@/lib/supabase/database.types";

export interface CheckboxStyle {
  border: string;
  bg: string;
  check: string;
  label: string;
}

export function Check({
  colorClass,
  active = true,
}: {
  colorClass: string;
  active?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4 w-4 shrink-0 transition-opacity duration-100 ${colorClass} ${active ? "opacity-100" : "opacity-0"}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5L6.5 12L13 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Pump isn't part of this checkbox lineup — it's a bespoke chip (PumpPill
// below), not an EditableCheckbox/EditableToggleTile, so it's excluded here.
export const TYPE_STYLES: Record<Exclude<EntryType, "pump">, CheckboxStyle> = {
  feed: {
    border: "border-amber",
    bg: "bg-amber-soft",
    check: "text-amber",
    label: "Feed",
  },
  poop: {
    border: "border-terracotta",
    bg: "bg-terracotta-soft",
    check: "text-terracotta",
    label: "Poo",
  },
  pee: {
    border: "border-brand-blue",
    bg: "bg-brand-blue-soft",
    check: "text-brand-blue",
    label: "Pee",
  },
};

// Bottle/Breast are sub-flags on a feed-type row, not their own EntryType —
// same tick/checkmark treatment as Poo/Pee, just color-coded differently.
export const FEED_FLAG_STYLES: Record<"bottle" | "breast", CheckboxStyle> = {
  bottle: {
    border: "border-amber",
    bg: "bg-amber-soft",
    check: "text-amber",
    label: "Bottle",
  },
  breast: {
    border: "border-rose",
    bg: "bg-rose-soft",
    check: "text-rose",
    label: "Breast",
  },
};

export function EditableCheckbox({
  style,
  checked,
  onChange,
}: {
  style: CheckboxStyle;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-center">
      <span className="relative inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={style.label}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          className={`pointer-events-none flex h-full w-full items-center justify-center rounded-[8px] border-[1.5px] transition-colors duration-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-sage ${
            checked
              ? `${style.border} ${style.bg}`
              : "border-line-strong bg-transparent"
          }`}
        >
          {checked && <Check colorClass={style.check} />}
        </span>
      </span>
    </label>
  );
}

// Larger tap-target variant for the phone card layout — icon + label
// stacked, same color-coding, sized for a thumb rather than a mouse.
export function EditableToggleTile({
  style,
  checked,
  onChange,
}: {
  style: CheckboxStyle;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="relative flex flex-1 cursor-pointer flex-col items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={style.label}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />
      <span
        className={`pointer-events-none flex w-full flex-col items-center gap-1 rounded-[10px] border-[1.5px] py-2.5 transition-colors duration-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-sage ${
          checked ? `${style.border} ${style.bg}` : "border-line-strong bg-paper"
        }`}
      >
        <Check colorClass={style.check} active={checked} />
        <span
          className={`text-[10.5px] font-bold ${checked ? style.check : "text-ink-soft"}`}
        >
          {style.label}
        </span>
      </span>
    </label>
  );
}

// Non-interactive equivalent for read-only contexts (Timeline) — same
// visual language, no input/handlers.
export function StaticToggleTile({
  style,
  checked,
}: {
  style: CheckboxStyle;
  checked: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-1 rounded-[10px] border-[1.5px] py-2.5 ${
        checked ? `${style.border} ${style.bg}` : "border-line bg-paper"
      }`}
    >
      <Check colorClass={style.check} active={checked} />
      <span
        className={`text-[10.5px] font-bold ${checked ? style.check : "text-ink-soft"}`}
      >
        {style.label}
      </span>
    </div>
  );
}

// Pump's control — a pill/chip, not a checkbox: off state has no checkmark
// markup at all (genuinely absent, not hidden) so "Pump" centers on its
// own; on state adds the checkmark before the label. Used compact/inline on
// desktop and full-width/taller on mobile via the fullWidth/large props.
const PUMP_ON = "border-plum bg-plum-soft text-plum";
const PUMP_OFF = "border-line bg-transparent text-line-strong";

export function PumpPill({
  checked,
  onChange,
  fullWidth = false,
  large = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  fullWidth?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border font-bold whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sage ${
        large ? "px-3 py-3 text-[13px]" : "px-3 py-1.5 text-[11.5px]"
      } ${fullWidth ? "w-full" : ""} ${checked ? PUMP_ON : PUMP_OFF}`}
    >
      {checked && <Check colorClass="text-plum" />}
      Pump
    </button>
  );
}

// Non-interactive equivalent for read-only contexts (Timeline).
export function PumpPillStatic({
  checked,
  fullWidth = false,
  large = false,
}: {
  checked: boolean;
  fullWidth?: boolean;
  large?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border font-bold whitespace-nowrap ${
        large ? "px-3 py-3 text-[13px]" : "px-3 py-1.5 text-[11.5px]"
      } ${fullWidth ? "w-full" : ""} ${checked ? PUMP_ON : PUMP_OFF}`}
    >
      {checked && <Check colorClass="text-plum" />}
      Pump
    </span>
  );
}

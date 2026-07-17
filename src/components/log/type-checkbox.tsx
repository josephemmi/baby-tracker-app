type EntryColor = "amber" | "terracotta" | "brand-blue";

interface TypeCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color: EntryColor;
  label: string;
}

const COLOR_CLASSES: Record<
  EntryColor,
  { border: string; bg: string; check: string }
> = {
  amber: { border: "border-amber", bg: "bg-amber-soft", check: "text-amber" },
  terracotta: {
    border: "border-terracotta",
    bg: "bg-terracotta-soft",
    check: "text-terracotta",
  },
  "brand-blue": {
    border: "border-brand-blue",
    bg: "bg-brand-blue-soft",
    check: "text-brand-blue",
  },
};

// Native <input type="checkbox"> for real accessible semantics, visually
// styled as a 30x30 rounded square per the design spec.
export function TypeCheckbox({
  checked,
  onChange,
  color,
  label,
}: TypeCheckboxProps) {
  const c = COLOR_CLASSES[color];

  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13.5px] text-ink select-none">
      <span className="relative inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          className={`pointer-events-none flex h-full w-full items-center justify-center rounded-[8px] border-[1.5px] transition-colors duration-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-sage ${
            checked
              ? `${c.border} ${c.bg}`
              : "border-line-strong bg-transparent"
          }`}
        >
          {checked && (
            <svg
              viewBox="0 0 16 16"
              className={`h-4 w-4 ${c.check}`}
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
          )}
        </span>
      </span>
      {label}
    </label>
  );
}

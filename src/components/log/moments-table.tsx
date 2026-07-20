import type { Moment } from "@/lib/entries";
import type { EntryType } from "@/lib/supabase/database.types";
import { toDatetimeLocalValue } from "@/lib/entries";
import { initials, personColor } from "@/lib/person-colors";

interface Member {
  id: string;
  name: string;
}

interface MomentsTableProps {
  moments: Moment[];
  memberNames: Record<string, string>;
  emptyMessage?: string;
  timeFormat?: "datetime" | "time";
  flashMomentKey?: string | null;
  // When set, rows render as always-editable cells instead of plain text —
  // used on Home. Timeline omits these and stays read-only.
  editable?: boolean;
  members?: Member[];
  // Poo/Pee — each is its own entry row, toggling inserts/deletes it.
  onToggleType?: (moment: Moment, type: EntryType, checked: boolean) => void;
  // Bottle/Breast — independent sub-flags on the same feed-type row.
  onToggleFeedFlag?: (
    moment: Moment,
    flag: "bottle" | "breast",
    checked: boolean,
  ) => void;
  onTimeCommit?: (moment: Moment, value: string) => void;
  onNotesCommit?: (moment: Moment, value: string) => void;
  onAmountCommit?: (moment: Moment, value: string) => void;
  onLoggedByCycle?: (moment: Moment) => void;
  // Reveals a leading row-select checkbox column for bulk delete — the
  // field cells stay editable regardless, this is purely for selection.
  selectMode?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (momentKey: string) => void;
}

function Check({ colorClass }: { colorClass: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4 w-4 ${colorClass}`}
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

const TYPE_STYLES: Record<
  EntryType,
  { border: string; bg: string; check: string; label: string }
> = {
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
const FEED_FLAG_STYLES: Record<
  "bottle" | "breast",
  { border: string; bg: string; check: string; label: string }
> = {
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

function EditableCheckbox({
  style,
  checked,
  onChange,
}: {
  style: { border: string; bg: string; check: string; label: string };
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

export function MomentsTable({
  moments,
  memberNames,
  emptyMessage = "No entries yet.",
  timeFormat = "datetime",
  flashMomentKey = null,
  editable = false,
  members = [],
  onToggleType,
  onToggleFeedFlag,
  onTimeCommit,
  onNotesCommit,
  onAmountCommit,
  onLoggedByCycle,
  selectMode = false,
  selectedKeys,
  onToggleSelect,
}: MomentsTableProps) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-paper-raised shadow-card">
      <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-line-strong text-left text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
            {selectMode && <th className="w-10 px-3 py-2.5" aria-hidden="true" />}
            <th className="px-3 py-2.5">Time</th>
            <th className="px-3 py-2.5">Breast</th>
            <th className="px-3 py-2.5">Bottle</th>
            <th className="px-3 py-2.5">mL</th>
            <th className="px-3 py-2.5">Poo</th>
            <th className="px-3 py-2.5">Pee</th>
            <th className="px-3 py-2.5">Notes</th>
            <th className="px-3 py-2.5">Logged by</th>
          </tr>
        </thead>
        <tbody>
          {moments.length === 0 ? (
            <tr>
              <td
                colSpan={selectMode ? 9 : 8}
                className="px-3 py-6 text-center text-ink-soft"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            moments.map((moment) => {
              const loggedByIndex = members.findIndex(
                (m) => m.id === moment.loggedBy,
              );
              const loggedByName =
                (moment.loggedBy && memberNames[moment.loggedBy]) ??
                "Unknown";

              return (
                <tr
                  key={moment.key}
                  className={`border-b border-line transition-colors last:border-0 hover:bg-sage/4 ${
                    moment.key === flashMomentKey ? "row-flash" : ""
                  }`}
                >
                  {selectMode && (
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedKeys?.has(moment.key) ?? false}
                        onChange={() => onToggleSelect?.(moment.key)}
                        aria-label="Select row"
                        className="h-4 w-4 accent-sage"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5 tabular-nums text-ink">
                    {editable ? (
                      <input
                        key={`time-${moment.key}-${moment.timestamp}`}
                        type="datetime-local"
                        defaultValue={toDatetimeLocalValue(
                          new Date(moment.timestamp),
                        )}
                        onBlur={(e) =>
                          onTimeCommit?.(moment, e.target.value)
                        }
                        className="w-full rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] tabular-nums text-ink hover:border-line focus:border-line-strong focus:bg-paper focus:outline-none"
                      />
                    ) : timeFormat === "time" ? (
                      new Date(moment.timestamp).toLocaleTimeString(
                        undefined,
                        { hour: "numeric", minute: "2-digit" },
                      )
                    ) : (
                      new Date(moment.timestamp).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <EditableCheckbox
                        style={FEED_FLAG_STYLES.breast}
                        checked={!!moment.feed?.breast}
                        onChange={(checked) =>
                          onToggleFeedFlag?.(moment, "breast", checked)
                        }
                      />
                    ) : (
                      moment.feed?.breast && <Check colorClass="text-rose" />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <EditableCheckbox
                        style={FEED_FLAG_STYLES.bottle}
                        checked={!!moment.feed?.bottle}
                        onChange={(checked) =>
                          onToggleFeedFlag?.(moment, "bottle", checked)
                        }
                      />
                    ) : (
                      moment.feed?.bottle && <Check colorClass="text-amber" />
                    )}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-ink">
                    {editable ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          key={`ml-${moment.key}-${moment.feed?.amount_ml ?? ""}`}
                          type="number"
                          step="0.1"
                          min="0"
                          defaultValue={moment.feed?.amount_ml ?? ""}
                          disabled={!moment.feed?.bottle}
                          onBlur={(e) =>
                            onAmountCommit?.(moment, e.target.value)
                          }
                          className="w-16 rounded-[10px] border border-line-strong bg-paper-raised px-2 py-1 text-right text-[13.5px] tabular-nums text-ink focus:border-amber focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-amber disabled:cursor-not-allowed disabled:border-line disabled:text-line-strong"
                        />
                        <span className="text-[13.5px] text-ink-soft">
                          ml
                        </span>
                      </div>
                    ) : (
                      (moment.feed?.amount_ml ?? "")
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <EditableCheckbox
                        style={TYPE_STYLES.poop}
                        checked={!!moment.poop}
                        onChange={(checked) =>
                          onToggleType?.(moment, "poop", checked)
                        }
                      />
                    ) : (
                      moment.poop && <Check colorClass="text-terracotta" />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <EditableCheckbox
                        style={TYPE_STYLES.pee}
                        checked={!!moment.pee}
                        onChange={(checked) =>
                          onToggleType?.(moment, "pee", checked)
                        }
                      />
                    ) : (
                      moment.pee && <Check colorClass="text-brand-blue" />
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-ink">
                    {editable ? (
                      <input
                        key={`notes-${moment.key}-${moment.notes ?? ""}`}
                        defaultValue={moment.notes ?? ""}
                        placeholder="Add a note…"
                        onBlur={(e) =>
                          onNotesCommit?.(moment, e.target.value)
                        }
                        className="w-full min-w-40 rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] text-ink placeholder:text-line-strong placeholder:italic hover:border-line focus:border-line-strong focus:bg-paper focus:outline-none"
                      />
                    ) : (
                      moment.notes
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => onLoggedByCycle?.(moment)}
                        className="flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-1 text-[12px] font-bold text-ink transition-colors hover:bg-paper"
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${personColor(Math.max(0, loggedByIndex)).bg} ${personColor(Math.max(0, loggedByIndex)).text}`}
                        >
                          {initials(loggedByName)}
                        </span>
                        {loggedByName}
                      </button>
                    ) : (
                      loggedByName
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

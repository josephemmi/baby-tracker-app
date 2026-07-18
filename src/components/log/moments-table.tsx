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
  onToggleType?: (moment: Moment, type: EntryType, checked: boolean) => void;
  onTimeCommit?: (moment: Moment, value: string) => void;
  onNotesCommit?: (moment: Moment, value: string) => void;
  onAmountCommit?: (moment: Moment, value: string) => void;
  onLoggedByCycle?: (moment: Moment) => void;
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

function EditableTypeCheckbox({
  type,
  checked,
  onChange,
}: {
  type: EntryType;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const c = TYPE_STYLES[type];
  return (
    <label className="flex cursor-pointer items-center justify-center">
      <span className="relative inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={c.label}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          className={`pointer-events-none flex h-full w-full items-center justify-center rounded-[8px] border-[1.5px] transition-colors duration-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-sage ${
            checked
              ? `${c.border} ${c.bg}`
              : "border-line-strong bg-transparent"
          }`}
        >
          {checked && <Check colorClass={c.check} />}
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
  onTimeCommit,
  onNotesCommit,
  onAmountCommit,
  onLoggedByCycle,
}: MomentsTableProps) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-paper-raised shadow-card">
      <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-line-strong text-left text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
            <th className="px-3 py-2.5">Time</th>
            <th className="px-3 py-2.5">Feed</th>
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
              <td colSpan={7} className="px-3 py-6 text-center text-ink-soft">
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
                      <EditableTypeCheckbox
                        type="feed"
                        checked={!!moment.feed}
                        onChange={(checked) =>
                          onToggleType?.(moment, "feed", checked)
                        }
                      />
                    ) : (
                      moment.feed && <Check colorClass="text-amber" />
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
                          disabled={!moment.feed}
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
                      <EditableTypeCheckbox
                        type="poop"
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
                      <EditableTypeCheckbox
                        type="pee"
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

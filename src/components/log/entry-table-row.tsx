import type { Moment } from "@/lib/entries";
import type { EntryType } from "@/lib/supabase/database.types";
import { toDatetimeLocalValue } from "@/lib/entries";
import { initials, personColor } from "@/lib/person-colors";
import { Check, EditableCheckbox, TYPE_STYLES, FEED_FLAG_STYLES } from "@/components/log/entry-styles";

interface Member {
  id: string;
  name: string;
}

export interface EntryRowHandlers {
  onToggleType?: (moment: Moment, type: EntryType, checked: boolean) => void;
  onToggleFeedFlag?: (
    moment: Moment,
    flag: "bottle" | "breast",
    checked: boolean,
  ) => void;
  onTimeCommit?: (moment: Moment, value: string) => void;
  onNotesCommit?: (moment: Moment, value: string) => void;
  onAmountCommit?: (moment: Moment, value: string) => void;
  onLoggedByCycle?: (moment: Moment) => void;
}

interface EntryTableRowProps extends EntryRowHandlers {
  moment: Moment;
  memberNames: Record<string, string>;
  members: Member[];
  timeFormat: "datetime" | "time";
  editable: boolean;
  flashMomentKey: string | null;
  selectMode: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (momentKey: string) => void;
}

// Table-row presentation — iPad/desktop only (hidden below the phone
// breakpoint by its parent wrapper). Renders the same moment data and
// handlers as EntryCard; only the layout differs.
export function EntryTableRow({
  moment,
  memberNames,
  members,
  timeFormat,
  editable,
  flashMomentKey,
  selectMode,
  selectedKeys,
  onToggleSelect,
  onToggleType,
  onToggleFeedFlag,
  onTimeCommit,
  onNotesCommit,
  onAmountCommit,
  onLoggedByCycle,
}: EntryTableRowProps) {
  const loggedByIndex = members.findIndex((m) => m.id === moment.loggedBy);
  const loggedByName = (moment.loggedBy && memberNames[moment.loggedBy]) ?? "Unknown";

  return (
    <tr
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
            defaultValue={toDatetimeLocalValue(new Date(moment.timestamp))}
            onBlur={(e) => onTimeCommit?.(moment, e.target.value)}
            className="w-full rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] tabular-nums text-ink hover:border-line focus:border-line-strong focus:bg-paper focus:outline-none"
          />
        ) : timeFormat === "time" ? (
          new Date(moment.timestamp).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
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
            onChange={(checked) => onToggleFeedFlag?.(moment, "breast", checked)}
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
            onChange={(checked) => onToggleFeedFlag?.(moment, "bottle", checked)}
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
              onBlur={(e) => onAmountCommit?.(moment, e.target.value)}
              className="w-16 rounded-[10px] border border-line-strong bg-paper-raised px-2 py-1 text-right text-[13.5px] tabular-nums text-ink focus:border-amber focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-amber disabled:cursor-not-allowed disabled:border-line disabled:text-line-strong"
            />
            <span className="text-[13.5px] text-ink-soft">ml</span>
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
            onChange={(checked) => onToggleType?.(moment, "poop", checked)}
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
            onChange={(checked) => onToggleType?.(moment, "pee", checked)}
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
            onBlur={(e) => onNotesCommit?.(moment, e.target.value)}
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
}

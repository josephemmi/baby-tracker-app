import { useState } from "react";
import type { Moment } from "@/lib/entries";
import type { BreastSide, EntryType } from "@/lib/supabase/database.types";
import { formatTime, toDatetimeLocalValue } from "@/lib/entries";
import { initials, personColor } from "@/lib/person-colors";
import {
  Check,
  EditableCheckbox,
  TYPE_STYLES,
  FEED_FLAG_STYLES,
  PumpPill,
  PumpPillStatic,
} from "@/components/log/entry-styles";
import { NotesCell } from "@/components/log/notes-cell";
import { BreastSessionSummary, BreastTimerPanel } from "@/components/log/breast-timer-panel";

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
  onPumpAmountCommit?: (moment: Moment, value: string) => void;
  onBreastSideToggle?: (moment: Moment, side: BreastSide) => void;
  onEndBreastSession?: (moment: Moment) => void;
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
  // Previous-day continuity row (JOS-21) — muted border so it reads as
  // context, not fresh data. No other styling change.
  tail?: boolean;
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
  tail = false,
  onToggleType,
  onToggleFeedFlag,
  onTimeCommit,
  onNotesCommit,
  onAmountCommit,
  onPumpAmountCommit,
  onBreastSideToggle,
  onEndBreastSession,
  onLoggedByCycle,
}: EntryTableRowProps) {
  const loggedByIndex = members.findIndex((m) => m.id === moment.loggedBy);
  const loggedByName = (moment.loggedBy && memberNames[moment.loggedBy]) ?? "Unknown";
  const [breastSummaryExpanded, setBreastSummaryExpanded] = useState(false);
  const showBreastPanel = !!moment.feed?.breast && !moment.feed?.breast_session_ended;
  // Sums to the same total either way — the Pump/mL pair always spans 2
  // columns, merged or split, matching how the header itself decides.
  const totalColumns = (selectMode ? 1 : 0) + 10;

  return (
    <>
    <tr
      className={`border-b ${tail ? "border-line-strong" : "border-line"} transition-colors last:border-0 hover:bg-sage/4 ${
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
        <div className="flex flex-col items-center gap-1">
          {editable ? (
            <EditableCheckbox
              style={FEED_FLAG_STYLES.breast}
              checked={!!moment.feed?.breast}
              onChange={(checked) => onToggleFeedFlag?.(moment, "breast", checked)}
            />
          ) : (
            moment.feed?.breast && <Check colorClass="text-rose" />
          )}
          {moment.feed && (
            <BreastSessionSummary
              entry={moment.feed}
              variant="expandable"
              expanded={breastSummaryExpanded}
              onToggleExpand={() => setBreastSummaryExpanded((e) => !e)}
            />
          )}
        </div>
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
      {moment.pump ? (
        <>
          <td className="border-l-[1.5px] border-dashed border-line-strong px-3 py-2.5 text-center">
            {editable ? (
              <PumpPill
                checked
                onChange={(checked) => onToggleType?.(moment, "pump", checked)}
              />
            ) : (
              <PumpPillStatic checked />
            )}
          </td>
          <td className="border-r-[1.5px] border-dashed border-line-strong px-3 py-2.5 tabular-nums text-ink">
            {editable ? (
              <div className="flex items-center justify-center gap-1">
                <span aria-hidden="true" className="invisible text-[11px] text-ink-soft">
                  ml
                </span>
                <input
                  key={`pump-ml-${moment.key}-${moment.pump.amount_ml ?? ""}`}
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="—"
                  defaultValue={moment.pump.amount_ml ?? ""}
                  onBlur={(e) => onPumpAmountCommit?.(moment, e.target.value)}
                  className="w-14 rounded-[10px] border border-line-strong bg-paper-raised px-2 py-1 text-right text-[13.5px] tabular-nums text-ink focus:border-plum focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-plum"
                />
                <span className="text-[11px] text-ink-soft">ml</span>
              </div>
            ) : (
              <div className="text-center">{moment.pump.amount_ml ?? ""}</div>
            )}
          </td>
        </>
      ) : (
        <td
          colSpan={2}
          className="border-x-[1.5px] border-dashed border-line-strong px-3 py-2.5 text-center"
        >
          {editable ? (
            <PumpPill
              checked={false}
              fullWidth
              onChange={(checked) => onToggleType?.(moment, "pump", checked)}
            />
          ) : (
            <PumpPillStatic checked={false} fullWidth />
          )}
        </td>
      )}
      <td className="px-3 py-2.5 text-ink">
        <NotesCell
          moment={moment}
          editable={editable}
          timeLabel={formatTime(moment.timestamp, timeFormat)}
          onNotesCommit={onNotesCommit}
          size="table"
        />
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
    {showBreastPanel && moment.feed && (
      <tr className="border-b border-line last:border-0">
        <td colSpan={totalColumns} className="bg-rose-soft/30 px-3 py-2.5">
          <div className="mx-auto max-w-[360px]">
            <BreastTimerPanel
              entry={moment.feed}
              editable={editable}
              onToggleSide={(side) => onBreastSideToggle?.(moment, side)}
              onEndSession={() => onEndBreastSession?.(moment)}
            />
          </div>
        </td>
      </tr>
    )}
    </>
  );
}

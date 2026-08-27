import type { Moment } from "@/lib/entries";
import { formatTime, toDatetimeLocalValue } from "@/lib/entries";
import { initials, personColor } from "@/lib/person-colors";
import {
  EditableToggleTile,
  StaticToggleTile,
  FEED_FLAG_STYLES,
  TYPE_STYLES,
  PumpPill,
  PumpPillStatic,
} from "@/components/log/entry-styles";
import { NotesCell } from "@/components/log/notes-cell";
import { BreastSessionSummary, BreastTimerPanel } from "@/components/log/breast-timer-panel";
import type { EntryRowHandlers } from "@/components/log/entry-table-row";

interface Member {
  id: string;
  name: string;
}

interface EntryCardProps extends EntryRowHandlers {
  moment: Moment;
  memberNames: Record<string, string>;
  members: Member[];
  timeFormat: "datetime" | "time";
  editable: boolean;
  flashMomentKey: string | null;
  selectMode: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (momentKey: string) => void;
  onDeleteMoment?: (moment: Moment) => void;
  // Previous-day continuity card (JOS-21) — muted border so it reads as
  // context, not fresh data. No other styling change.
  tail?: boolean;
}

// Phone-only stacked-card presentation of a moment (≤640px) — same data and
// handlers as EntryTableRow, just a different shape. Home renders editable
// cards; Timeline renders read-only cards (editable=false), matching the
// same split that already exists at desktop width.
export function EntryCard({
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
  onPumpAmountCommit,
  onBreastSideToggle,
  onEndBreastSession,
  onLoggedByCycle,
  onDeleteMoment,
  tail = false,
}: EntryCardProps) {
  const loggedByIndex = members.findIndex((m) => m.id === moment.loggedBy);
  const loggedByName = (moment.loggedBy && memberNames[moment.loggedBy]) ?? "Unknown";
  const color = personColor(Math.max(0, loggedByIndex));
  const showMl = !!moment.feed?.bottle;
  const showPumpMl = !!moment.pump;
  const showBreastPanel = !!moment.feed?.breast && !moment.feed?.breast_session_ended;

  return (
    <div
      className={`relative rounded-[12px] border ${tail ? "border-line-strong" : "border-line"} bg-paper-raised p-3 shadow-card ${
        moment.key === flashMomentKey ? "row-flash" : ""
      }`}
    >
      {editable && onDeleteMoment && (
        <button
          type="button"
          onClick={() => onDeleteMoment(moment)}
          aria-label="Delete this logged moment"
          className="absolute top-2.5 right-2.5 rounded-md p-1 text-line-strong transition-colors hover:bg-terracotta-soft hover:text-terracotta"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      <div className="mb-2.5 flex items-center justify-between gap-2 pr-7">
        <div className="flex items-center gap-2">
          {selectMode && (
            <input
              type="checkbox"
              checked={selectedKeys?.has(moment.key) ?? false}
              onChange={() => onToggleSelect?.(moment.key)}
              aria-label="Select card"
              className="h-4 w-4 accent-sage"
            />
          )}
          {editable ? (
            <input
              key={`time-${moment.key}-${moment.timestamp}`}
              type="datetime-local"
              defaultValue={toDatetimeLocalValue(new Date(moment.timestamp))}
              onBlur={(e) => onTimeCommit?.(moment, e.target.value)}
              className="rounded-md border border-transparent bg-transparent text-[15px] font-bold tabular-nums text-ink hover:border-line focus:border-line-strong focus:bg-paper focus:outline-none"
            />
          ) : (
            <span className="text-[15px] font-bold tabular-nums text-ink">
              {formatTime(moment.timestamp, timeFormat)}
            </span>
          )}
        </div>

        {editable ? (
          <button
            type="button"
            onClick={() => onLoggedByCycle?.(moment)}
            className="flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-1 text-[12px] font-bold text-ink transition-colors hover:bg-paper"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${color.bg} ${color.text}`}
            >
              {initials(loggedByName)}
            </span>
            {loggedByName}
          </button>
        ) : (
          <span className="text-[12px] text-ink-soft">{loggedByName}</span>
        )}
      </div>

      <div className="mb-2.5 flex gap-1.5">
        {editable ? (
          <>
            <EditableToggleTile
              style={FEED_FLAG_STYLES.breast}
              checked={!!moment.feed?.breast}
              onChange={(checked) => onToggleFeedFlag?.(moment, "breast", checked)}
            />
            <EditableToggleTile
              style={FEED_FLAG_STYLES.bottle}
              checked={!!moment.feed?.bottle}
              onChange={(checked) => onToggleFeedFlag?.(moment, "bottle", checked)}
            />
            <EditableToggleTile
              style={TYPE_STYLES.poop}
              checked={!!moment.poop}
              onChange={(checked) => onToggleType?.(moment, "poop", checked)}
            />
            <EditableToggleTile
              style={TYPE_STYLES.pee}
              checked={!!moment.pee}
              onChange={(checked) => onToggleType?.(moment, "pee", checked)}
            />
          </>
        ) : (
          <>
            <StaticToggleTile style={FEED_FLAG_STYLES.breast} checked={!!moment.feed?.breast} />
            <StaticToggleTile style={FEED_FLAG_STYLES.bottle} checked={!!moment.feed?.bottle} />
            <StaticToggleTile style={TYPE_STYLES.poop} checked={!!moment.poop} />
            <StaticToggleTile style={TYPE_STYLES.pee} checked={!!moment.pee} />
          </>
        )}
      </div>

      {showBreastPanel && moment.feed && (
        <div className="mb-2.5 rounded-[10px] border border-line-strong bg-paper px-3 py-2.5">
          <BreastTimerPanel
            entry={moment.feed}
            editable={editable}
            onToggleSide={(side) => onBreastSideToggle?.(moment, side)}
            onEndSession={() => onEndBreastSession?.(moment)}
            large
          />
        </div>
      )}

      {moment.feed?.breast_session_ended && moment.feed && (
        <div className="mb-2.5">
          <BreastSessionSummary entry={moment.feed} variant="inline" />
        </div>
      )}

      {showMl && (
        <div className="mb-2.5 flex items-center gap-2 rounded-[8px] border border-line-strong bg-paper px-3 py-2">
          <span className="text-[11.5px] font-bold text-ink-soft uppercase">mL</span>
          {editable ? (
            <input
              key={`ml-${moment.key}-${moment.feed?.amount_ml ?? ""}`}
              type="number"
              step="0.1"
              min="0"
              placeholder="Amount"
              defaultValue={moment.feed?.amount_ml ?? ""}
              onBlur={(e) => onAmountCommit?.(moment, e.target.value)}
              className="flex-1 bg-transparent text-right text-[14px] tabular-nums text-ink focus:outline-none"
            />
          ) : (
            <span className="flex-1 text-right text-[14px] tabular-nums text-ink">
              {moment.feed?.amount_ml ?? ""}
            </span>
          )}
          <span className="text-[11.5px] text-ink-soft">ml</span>
        </div>
      )}

      {/* Mobile's Pump treatment is deliberately its own thing, not a
          resized desktop chip: full-width/taller, mL in its own row below
          (Bottle's show/hide pattern), and this wrapper — not the mL row —
          owns the bottom margin so the gap before Notes stays constant
          whether Pump is on or off. */}
      <div className="mb-2.5 border-t-[1.5px] border-b-[1.5px] border-dashed border-line-strong py-2.5">
        {editable ? (
          <PumpPill
            checked={!!moment.pump}
            fullWidth
            large
            onChange={(checked) => onToggleType?.(moment, "pump", checked)}
          />
        ) : (
          <PumpPillStatic checked={!!moment.pump} fullWidth large />
        )}

        {showPumpMl && (
          <div className="mt-2 flex items-center gap-2 rounded-[8px] border border-line-strong bg-paper px-3 py-2">
            <span className="text-[11.5px] font-bold text-ink-soft uppercase">mL</span>
            {editable ? (
              <input
                key={`pump-ml-${moment.key}-${moment.pump?.amount_ml ?? ""}`}
                type="number"
                step="0.1"
                min="0"
                placeholder="Amount"
                defaultValue={moment.pump?.amount_ml ?? ""}
                onBlur={(e) => onPumpAmountCommit?.(moment, e.target.value)}
                className="flex-1 bg-transparent text-right text-[14px] tabular-nums text-ink focus:outline-none"
              />
            ) : (
              <span className="flex-1 text-right text-[14px] tabular-nums text-ink">
                {moment.pump?.amount_ml ?? ""}
              </span>
            )}
            <span className="text-[11.5px] text-ink-soft">ml</span>
          </div>
        )}
      </div>

      <NotesCell
        moment={moment}
        editable={editable}
        timeLabel={formatTime(moment.timestamp, timeFormat)}
        onNotesCommit={onNotesCommit}
        size="card"
      />
    </div>
  );
}

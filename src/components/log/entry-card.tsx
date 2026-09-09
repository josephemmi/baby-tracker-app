import { useEffect, useRef, useState } from "react";
import type { Moment } from "@/lib/entries";
import { formatTime, toDatetimeLocalValue } from "@/lib/entries";
import { useDebouncedCommit } from "@/lib/debounced-commit";
import { useSavePulse } from "@/lib/save-pulse";
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
  // A native datetime-local input always displays its full date + time
  // when not focused — that's browser rendering, not something the
  // timeFormat prop can override. Home's day dividers (JOS-21) now carry
  // the date, so at rest this shows just the time, matching Timeline;
  // tapping it still opens the real date+time picker, so nothing about
  // editing capability is lost, only what's shown before you tap in.
  const [timeEditing, setTimeEditing] = useState(false);
  const showPumpMl = !!moment.pump;
  const showBreastPanel = !!moment.feed?.breast && !moment.feed?.breast_session_ended;
  // JOS-42: debounce the mL commit alongside onBlur — see debounced-commit.ts.
  // JOS-48: back to the original 600ms (was briefly 3.5s during JOS-47).
  // That longer delay was only ever compensating for JOS-47's remount bug —
  // once fixed, the debounce stopped having any UI-visible role, since
  // blur() (checkmark tap, tap-elsewhere, or a working OS dismiss) already
  // commits instantly via flush() regardless of this delay. Its only
  // remaining job is a silent background safety net for the case blur never
  // fires at all (the original JOS-42 Android quirk); shorter is strictly
  // better for that, with no UX cost now that the checkmark below is the
  // real save-and-close affordance.
  const amountCommit = useDebouncedCommit<string>(
    (value) => onAmountCommit?.(moment, value),
    600,
  );
  const pumpAmountCommit = useDebouncedCommit<string>(
    (value) => onPumpAmountCommit?.(moment, value),
    600,
  );
  // JOS-48: explicit save-and-close button. Reuses the exact commit path
  // above (blur() triggers the existing onBlur → flush()) — this only adds
  // a deliberate way to trigger that blur, plus a brief confirmation flash
  // (the app's existing row-flash keyframes) so the user has visual proof
  // the value saved, instead of relying on a timing guess.
  //
  // Visibility is tracked with explicit onFocus/onBlur state on the INPUT
  // itself, not CSS `:focus-within` on the row — the checkmark button lives
  // inside that same row, and tapping it moves focus onto the button, which
  // would keep `:focus-within` true forever and leave the checkmark stuck
  // visible instead of handing off to the "Saved" text. Tying visibility to
  // the input's own focus state sidesteps that entirely.
  const [amountEditing, setAmountEditing] = useState(false);
  const [pumpAmountEditing, setPumpAmountEditing] = useState(false);
  const [amountJustSaved, pulseAmountSaved] = useSavePulse(900);
  const [pumpAmountJustSaved, pulsePumpAmountSaved] = useSavePulse(900);

  // JOS-47: these mL inputs are uncontrolled (defaultValue), so an external
  // change to amount_ml (another device's edit landing via realtime, or the
  // periodic refetch) needs some way to reach an already-mounted field. That
  // used to be done by keying the input on the value itself, forcing a
  // remount whenever it changed. But that included changes this very field
  // had just committed via the JOS-42 debounce — so typing a value and
  // pausing would, ~600ms later, remount the input as a side effect of its
  // own commit succeeding, which drops mobile's on-screen keyboard mid-entry
  // (JOS-42 introduced the debounce commit; this remount hazard already
  // existed but was latent until then, since onBlur-only commits happened
  // after focus had already moved away). Sync the DOM value imperatively
  // instead, and only when the field isn't the one currently focused.
  const amountInputRef = useRef<HTMLInputElement>(null);
  const pumpAmountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = amountInputRef.current;
    if (!el || document.activeElement === el) return;
    el.value = moment.feed?.amount_ml != null ? String(moment.feed.amount_ml) : "";
  }, [moment.feed?.amount_ml]);

  useEffect(() => {
    const el = pumpAmountInputRef.current;
    if (!el || document.activeElement === el) return;
    el.value = moment.pump?.amount_ml != null ? String(moment.pump.amount_ml) : "";
  }, [moment.pump?.amount_ml]);

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
          {editable && timeEditing ? (
            <input
              key={`time-${moment.key}-${moment.timestamp}`}
              type="datetime-local"
              autoFocus
              defaultValue={toDatetimeLocalValue(new Date(moment.timestamp))}
              onBlur={(e) => {
                onTimeCommit?.(moment, e.target.value);
                setTimeEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="rounded-md border border-transparent bg-transparent text-[15px] font-bold tabular-nums text-ink hover:border-line focus:border-line-strong focus:bg-paper focus:outline-none"
            />
          ) : editable ? (
            <button
              type="button"
              onClick={() => setTimeEditing(true)}
              className="rounded-md px-1 -mx-1 text-[15px] font-bold whitespace-nowrap tabular-nums text-ink hover:bg-paper"
            >
              {formatTime(moment.timestamp, "time")}
            </button>
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
        <div
          className={`mb-2.5 flex items-center gap-2 rounded-[8px] border border-line-strong bg-paper px-3 py-2 ${amountJustSaved ? "row-flash" : ""}`}
        >
          <span className="text-[11.5px] font-bold text-ink-soft uppercase">mL</span>
          {editable ? (
            <input
              key={`ml-${moment.key}`}
              ref={amountInputRef}
              type="number"
              step="0.1"
              min="0"
              placeholder="Amount"
              defaultValue={moment.feed?.amount_ml ?? ""}
              onChange={(e) => amountCommit.trigger(e.target.value)}
              onFocus={() => setAmountEditing(true)}
              onBlur={(e) => {
                setAmountEditing(false);
                amountCommit.flush(e.target.value);
                pulseAmountSaved();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="flex-1 bg-transparent text-right text-[14px] tabular-nums text-ink focus:outline-none"
            />
          ) : (
            <span className="flex-1 text-right text-[14px] tabular-nums text-ink">
              {moment.feed?.amount_ml ?? ""}
            </span>
          )}
          <span
            className={`text-[11.5px] text-ink-soft transition-opacity duration-150 ${amountEditing ? "opacity-0" : ""}`}
          >
            ml
          </span>
          {editable && (
            <div
              className={`relative h-[26px] flex-shrink-0 overflow-hidden transition-[width] duration-150 ${
                amountEditing ? "w-[26px]" : "w-0"
              }`}
            >
              <button
                type="button"
                onClick={() => amountInputRef.current?.blur()}
                aria-label="Save and close keyboard"
                className={`absolute left-0 top-0 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-sage text-white transition-all duration-150 ${
                  amountEditing
                    ? "scale-100 opacity-100 pointer-events-auto"
                    : "scale-[0.6] opacity-0 pointer-events-none"
                }`}
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                  <path
                    d="M3 8.5l3 3 7-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
          {amountJustSaved && (
            <span className="pr-3 text-[11px] font-bold whitespace-nowrap text-sage">Saved</span>
          )}
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
          <div
            className={`mt-2 flex items-center gap-2 rounded-[8px] border border-line-strong bg-paper px-3 py-2 ${pumpAmountJustSaved ? "row-flash" : ""}`}
          >
            <span className="text-[11.5px] font-bold text-ink-soft uppercase">mL</span>
            {editable ? (
              <input
                key={`pump-ml-${moment.key}`}
                ref={pumpAmountInputRef}
                type="number"
                step="0.1"
                min="0"
                placeholder="Amount"
                defaultValue={moment.pump?.amount_ml ?? ""}
                onChange={(e) => pumpAmountCommit.trigger(e.target.value)}
                onFocus={() => setPumpAmountEditing(true)}
                onBlur={(e) => {
                  setPumpAmountEditing(false);
                  pumpAmountCommit.flush(e.target.value);
                  pulsePumpAmountSaved();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="flex-1 bg-transparent text-right text-[14px] tabular-nums text-ink focus:outline-none"
              />
            ) : (
              <span className="flex-1 text-right text-[14px] tabular-nums text-ink">
                {moment.pump?.amount_ml ?? ""}
              </span>
            )}
            <span
              className={`text-[11.5px] text-ink-soft transition-opacity duration-150 ${pumpAmountEditing ? "opacity-0" : ""}`}
            >
              ml
            </span>
            {editable && (
              <div
                className={`relative h-[26px] flex-shrink-0 overflow-hidden transition-[width] duration-150 ${
                  pumpAmountEditing ? "w-[26px]" : "w-0"
                }`}
              >
                <button
                  type="button"
                  onClick={() => pumpAmountInputRef.current?.blur()}
                  aria-label="Save and close keyboard"
                  className={`absolute left-0 top-0 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-sage text-white transition-all duration-150 ${
                    pumpAmountEditing
                      ? "scale-100 opacity-100 pointer-events-auto"
                      : "scale-[0.6] opacity-0 pointer-events-none"
                  }`}
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <path
                      d="M3 8.5l3 3 7-7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}
            {pumpAmountJustSaved && (
              <span className="pr-3 text-[11px] font-bold whitespace-nowrap text-sage">Saved</span>
            )}
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

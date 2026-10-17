import { Fragment, type ReactNode } from "react";
import type { Moment } from "@/lib/entries";
import { interleaveByTime, type Sleep } from "@/lib/sleep";
import { EntryTableRow, type EntryRowHandlers } from "@/components/log/entry-table-row";
import { EntryCard } from "@/components/log/entry-card";
import { DayDivider } from "@/components/log/day-divider";

interface Member {
  id: string;
  name: string;
}

// A day-aware section of moments (JOS-21, Home only) — an optional divider
// rendered before the group, and a "tail" styling flag applied to every
// moment in it (the previous day's muted last-3). Timeline's flat per-day
// tables don't use this — they just pass `moments`.
export interface MomentGroup {
  moments: Moment[];
  // Sleeps in this section (JOS-56), newest first by when each began, drawn
  // by `renderSleep`. They are cards, never table rows: on a phone they sit
  // among the moments by time (a running or reopened one included — none is
  // pinned to the top); on iPad/desktop they stack above the table.
  sleeps?: Sleep[];
  divider?: { label: string };
  tail?: boolean;
}

interface MomentsTableProps extends EntryRowHandlers {
  moments: Moment[];
  // Day-grouped rendering order (Home) — must contain exactly the same
  // moments as `moments`, above, split into sections. When omitted, all of
  // `moments` render as a single flat, divider-less group (Timeline).
  groups?: MomentGroup[];
  memberNames: Record<string, string>;
  emptyMessage?: string;
  timeFormat?: "datetime" | "time";
  flashMomentKey?: string | null;
  // When set, rows render as always-editable cells instead of plain text —
  // used on Home. Timeline omits these and stays read-only.
  editable?: boolean;
  members?: Member[];
  // Reveals a leading row-select checkbox column for bulk delete — the
  // field cells stay editable regardless, this is purely for selection.
  selectMode?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (momentKey: string) => void;
  // Phone-card-only single-moment delete (Home only — Timeline stays
  // read-only and never receives this).
  onDeleteMoment?: (moment: Moment) => void;
  // Draws a sleep card (Home only). "wide" is the iPad/desktop stack above the
  // table, "phone" the card among the moments.
  renderSleep?: (sleep: Sleep, layout: "phone" | "wide") => ReactNode;
}

// Renders each moment as both a table row (iPad/desktop, ≥640px) and a
// stacked card (phone, <640px) from the same moments/handlers — Tailwind's
// responsive display classes decide which is visible, so there's no
// separate mobile state to keep in sync with the desktop one.
export function MomentsTable({
  moments,
  groups,
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
  onPumpAmountCommit,
  onBreastSideToggle,
  onEndBreastSession,
  onLoggedByCycle,
  onStartSleep,
  selectMode = false,
  selectedKeys,
  onToggleSelect,
  onDeleteMoment,
  renderSleep,
}: MomentsTableProps) {
  const handlers: EntryRowHandlers = {
    onToggleType,
    onToggleFeedFlag,
    onTimeCommit,
    onNotesCommit,
    onAmountCommit,
    onPumpAmountCommit,
    onBreastSideToggle,
    onEndBreastSession,
    onLoggedByCycle,
    onStartSleep,
  };

  // The Pump/mL header merges into one centered cell when nothing in this
  // table has Pump on, and splits into two the instant any row does — scoped
  // to whatever `moments` this instance renders (Home's whole list, or one
  // Timeline day-group), matching each row's own per-moment merge/split.
  const anyPumpOn = moments.some((moment) => !!moment.pump);
  // Matches EntryTableRow's own column-count calc, so a divider row's
  // colSpan always spans every column that row renders.
  const totalColumns = (selectMode ? 1 : 0) + 10 + (onStartSleep ? 1 : 0);
  const renderGroups: MomentGroup[] = groups ?? [{ moments }];

  // Wide layout: every sleep as the groups run (newest first). Sleeps from
  // another day say so on their card.
  const wideSleeps: Sleep[] = renderGroups.flatMap((group) => group.sleeps ?? []);
  const hasSleeps = !!renderSleep && wideSleeps.length > 0;

  if (moments.length === 0 && !hasSleeps) {
    return (
      <div className="rounded-[10px] border border-line bg-paper-raised px-3 py-6 text-center text-ink-soft shadow-card">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* iPad / desktop — sleep cards stacked above the table (a sleep has
          pauses and a live timer, so it can't be a row in it) */}
      {hasSleeps && renderSleep && (
        <div className="hidden grid-cols-1 gap-2.5 sm:grid md:grid-cols-2">
          {wideSleeps.map((sleep) => (
            <div key={sleep.id} className="max-w-[440px]">
              {renderSleep(sleep, "wide")}
            </div>
          ))}
        </div>
      )}

      {/* iPad / desktop — table, hidden below the phone breakpoint */}
      {moments.length > 0 && (
        <div className="hidden overflow-x-auto rounded-[10px] border border-line bg-paper-raised shadow-card sm:block">
          <table className="w-full min-w-[960px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
                {selectMode && <th className="w-10 px-3 py-2.5" aria-hidden="true" />}
                <th className="px-3 py-2.5">Time</th>
                <th className="px-3 py-2.5">Breast</th>
                <th className="px-3 py-2.5">Bottle</th>
                <th className="px-3 py-2.5">mL</th>
                <th className="px-3 py-2.5">Poo</th>
                <th className="px-3 py-2.5">Pee</th>
                {onStartSleep && <th className="px-3 py-2.5">Sleep</th>}
                {anyPumpOn ? (
                  <>
                    <th className="border-l-[1.5px] border-dashed border-line-strong px-3 py-2.5 text-center">
                      Pump
                    </th>
                    <th className="border-r-[1.5px] border-dashed border-line-strong px-3 py-2.5 text-center">
                      mL
                    </th>
                  </>
                ) : (
                  <th
                    colSpan={2}
                    className="border-x-[1.5px] border-dashed border-line-strong px-3 py-2.5 text-center"
                  >
                    Pump
                  </th>
                )}
                <th className="max-w-[280px] px-3 py-2.5">Notes</th>
                <th className="px-3 py-2.5">Logged by</th>
              </tr>
            </thead>
            <tbody>
              {renderGroups.map((group, groupIndex) => (
                <Fragment key={group.divider?.label ?? `group-${groupIndex}`}>
                  {group.divider && (
                    <tr>
                      <td colSpan={totalColumns} className="px-3 py-2.5">
                        <DayDivider label={group.divider.label} />
                      </td>
                    </tr>
                  )}
                  {group.moments.map((moment) => (
                    <EntryTableRow
                      key={moment.key}
                      moment={moment}
                      memberNames={memberNames}
                      members={members}
                      timeFormat={timeFormat}
                      editable={editable}
                      flashMomentKey={flashMomentKey}
                      selectMode={selectMode}
                      selectedKeys={selectedKeys}
                      onToggleSelect={onToggleSelect}
                      tail={group.tail}
                      {...handlers}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phone — stacked cards, hidden at and above the phone breakpoint */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        {renderGroups.map((group, groupIndex) => (
          <Fragment key={group.divider?.label ?? `group-${groupIndex}`}>
            {group.divider && (
              <DayDivider label={group.divider.label} />
            )}
            {interleaveByTime(group.moments, renderSleep ? (group.sleeps ?? []) : []).map(
              (item) =>
                item.kind === "sleep" ? (
                  <Fragment key={item.sleep.id}>{renderSleep?.(item.sleep, "phone")}</Fragment>
                ) : (
                  <EntryCard
                    key={item.moment.key}
                    moment={item.moment}
                    memberNames={memberNames}
                    members={members}
                    timeFormat={timeFormat}
                    editable={editable}
                    flashMomentKey={flashMomentKey}
                    selectMode={selectMode}
                    selectedKeys={selectedKeys}
                    onToggleSelect={onToggleSelect}
                    onDeleteMoment={onDeleteMoment}
                    tail={group.tail}
                    {...handlers}
                  />
                ),
            )}
          </Fragment>
        ))}
      </div>
    </>
  );
}

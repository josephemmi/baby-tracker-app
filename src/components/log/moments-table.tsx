import type { Moment } from "@/lib/entries";
import { EntryTableRow, type EntryRowHandlers } from "@/components/log/entry-table-row";
import { EntryCard } from "@/components/log/entry-card";

interface Member {
  id: string;
  name: string;
}

interface MomentsTableProps extends EntryRowHandlers {
  moments: Moment[];
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
}

// Renders each moment as both a table row (iPad/desktop, ≥640px) and a
// stacked card (phone, <640px) from the same moments/handlers — Tailwind's
// responsive display classes decide which is visible, so there's no
// separate mobile state to keep in sync with the desktop one.
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
  onDeleteMoment,
}: MomentsTableProps) {
  const handlers: EntryRowHandlers = {
    onToggleType,
    onToggleFeedFlag,
    onTimeCommit,
    onNotesCommit,
    onAmountCommit,
    onLoggedByCycle,
  };

  if (moments.length === 0) {
    return (
      <div className="rounded-[10px] border border-line bg-paper-raised px-3 py-6 text-center text-ink-soft shadow-card">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      {/* iPad / desktop — table, hidden below the phone breakpoint */}
      <div className="hidden overflow-x-auto rounded-[10px] border border-line bg-paper-raised shadow-card sm:block">
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
            {moments.map((moment) => (
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
                {...handlers}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone — stacked cards, hidden at and above the phone breakpoint */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        {moments.map((moment) => (
          <EntryCard
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
            onDeleteMoment={onDeleteMoment}
            {...handlers}
          />
        ))}
      </div>
    </>
  );
}

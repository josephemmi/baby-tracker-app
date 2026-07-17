import type { Moment } from "@/lib/entries";

interface MomentsTableProps {
  moments: Moment[];
  memberNames: Record<string, string>;
  emptyMessage?: string;
  timeFormat?: "datetime" | "time";
  flashMomentKey?: string | null;
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

export function MomentsTable({
  moments,
  memberNames,
  emptyMessage = "No entries yet.",
  timeFormat = "datetime",
  flashMomentKey = null,
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
            moments.map((moment) => (
              <tr
                key={moment.key}
                className={`border-b border-line transition-colors last:border-0 hover:bg-sage/4 ${
                  moment.key === flashMomentKey ? "row-flash" : ""
                }`}
              >
                <td className="px-3 py-2.5 tabular-nums text-ink">
                  {timeFormat === "time"
                    ? new Date(moment.timestamp).toLocaleTimeString(
                        undefined,
                        { hour: "numeric", minute: "2-digit" },
                      )
                    : new Date(moment.timestamp).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                </td>
                <td className="px-3 py-2.5">
                  {moment.feed && <Check colorClass="text-amber" />}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-ink">
                  {moment.feed?.amount_ml ?? ""}
                </td>
                <td className="px-3 py-2.5">
                  {moment.poop && <Check colorClass="text-terracotta" />}
                </td>
                <td className="px-3 py-2.5">
                  {moment.pee && <Check colorClass="text-brand-blue" />}
                </td>
                <td className="px-3 py-2.5 text-ink">{moment.notes}</td>
                <td className="px-3 py-2.5 text-ink-soft">
                  {(moment.loggedBy && memberNames[moment.loggedBy]) ??
                    "Unknown"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

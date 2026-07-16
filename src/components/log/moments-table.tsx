import type { Moment } from "@/lib/entries";

interface MomentsTableProps {
  moments: Moment[];
  memberNames: Record<string, string>;
  emptyMessage?: string;
  timeFormat?: "datetime" | "time";
}

export function MomentsTable({
  moments,
  memberNames,
  emptyMessage = "No entries yet.",
  timeFormat = "datetime",
}: MomentsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-100 text-left text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Feed</th>
            <th className="px-3 py-2 font-medium">mL</th>
            <th className="px-3 py-2 font-medium">Poo</th>
            <th className="px-3 py-2 font-medium">Pee</th>
            <th className="px-3 py-2 font-medium">Notes</th>
            <th className="px-3 py-2 font-medium">Logged by</th>
          </tr>
        </thead>
        <tbody>
          {moments.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-3 py-6 text-center text-zinc-500 dark:text-zinc-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            moments.map((moment) => (
              <tr
                key={moment.key}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
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
                <td className="px-3 py-2">{moment.feed ? "✓" : ""}</td>
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                  {moment.feed?.amount_ml ?? ""}
                </td>
                <td className="px-3 py-2">{moment.poop ? "✓" : ""}</td>
                <td className="px-3 py-2">{moment.pee ? "✓" : ""}</td>
                <td className="px-3 py-2 text-zinc-950 dark:text-zinc-50">
                  {moment.notes}
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
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

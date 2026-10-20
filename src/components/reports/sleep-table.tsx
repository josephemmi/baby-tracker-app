import { SECTION_TITLE } from "@/components/reports/sleep-report-parts";
import type { Day } from "@/lib/sleep-reports";
import { TABLE_COLUMNS, tableRows } from "@/lib/sleep-report-view";

// The daily summary table (JOS-83): one row per day, newest first, today tagged
// "so far". Night + naps adds up to Total on every row. It also stands in for
// the charts for anyone who can't see them. The title sits above the part that
// scrolls (JOS-91) so it stays put, and so does the Day column while the rest
// scrolls sideways.
export function SleepTable({ days }: { days: Day[] }) {
  const rows = tableRows(days);
  return (
    <section
      aria-labelledby="sleep-table-h"
      className="rounded-[10px] border border-line bg-paper-raised shadow-card"
      data-card="table"
    >
      <h2 id="sleep-table-h" className={`${SECTION_TITLE} px-3 pt-3.5 pb-2`}>
        Sleep summary
      </h2>
      <div
        tabIndex={0}
        role="region"
        aria-label="Sleep summary by day"
        className="overflow-x-auto rounded-b-[10px]"
      >
        <table className="w-full min-w-[700px] border-collapse text-[13.5px]">
          <thead>
            <tr>
              {TABLE_COLUMNS.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`border-b border-line-strong bg-paper-raised px-3 py-2.5 text-[11px] font-bold tracking-[0.05em] whitespace-nowrap text-ink-soft uppercase ${
                    i === 0 ? "sticky left-0 text-left shadow-[1px_0_0_var(--color-line)]" : "text-center"
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="sticky left-0 border-b border-line bg-paper-raised px-3 py-2.5 text-left whitespace-nowrap shadow-[1px_0_0_var(--color-line)] [tr:last-child_&]:border-b-0">
                  {r.day}
                  {r.partial && (
                    <>
                      {" "}
                      <small className="text-[11px] text-ink-soft">so far</small>
                    </>
                  )}
                </td>
                {r.cells.map((cell, i) => (
                  <td
                    key={i}
                    className="border-b border-line px-3 py-2.5 text-center whitespace-nowrap tabular-nums [tr:last-child_&]:border-b-0"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { ReportsView } from "@/components/reports/reports-view";
import { SleepReportsView } from "@/components/reports/sleep-reports-view";
import type { EntryRow } from "@/lib/entries";

export type ReportsTab = "feeds" | "sleep";

const TABS: { value: ReportsTab; label: string }[] = [
  { value: "feeds", label: "Feeds & nappies" },
  { value: "sleep", label: "Sleep" },
];

// The two reports under the header (JOS-83): Feeds & nappies exactly as it was,
// and Sleep beside it. Switching is on this page, with no trip to the server;
// the address follows (/reports?tab=sleep) so a reload or a shared link lands
// on the same one. Only the open one is mounted, so the Sleep tab reads and
// listens for sleeps only while it is on screen.
export function ReportsShell({
  entries,
  babyId,
  initialTab,
}: {
  entries: EntryRow[];
  babyId: string;
  initialTab: ReportsTab;
}) {
  const [tab, setTab] = useState<ReportsTab>(initialTab);

  function choose(next: ReportsTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "sleep") url.searchParams.set("tab", "sleep");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Report type" className="flex rounded-full border border-line bg-paper p-1">
        {TABS.map((t) => {
          const on = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={on}
              onClick={() => choose(t.value)}
              className={`min-h-10 flex-1 rounded-full px-1.5 py-2 text-sm font-bold transition-colors ${
                on ? "bg-ink text-paper-raised" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "feeds" ? <ReportsView entries={entries} babyId={babyId} /> : <SleepReportsView babyId={babyId} />}
    </div>
  );
}

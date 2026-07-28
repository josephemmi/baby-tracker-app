"use client";

import { useState } from "react";

interface GroupedBarChartDatum {
  label: string;
  bottle: number;
  breast: number;
}

interface GroupedBarChartProps {
  title: string;
  data: GroupedBarChartDatum[];
}

export function GroupedBarChart({ title, data }: GroupedBarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.bottle, d.breast]));

  // Two bars + inter-bar gap per day needs more room than a single-bar
  // chart — without a floor, the date labels get squeezed into ellipsis
  // on phones long before the bars themselves look cramped.
  const minGroupWidth = 52;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <div
          className="flex flex-col gap-2"
          style={{ minWidth: data.length * minGroupWidth }}
        >
          <div className="flex h-36 items-end gap-3 border-b border-line-strong">
            {data.map((d, index) => (
              <div
                key={`${d.label}-${index}`}
                className="flex h-full min-w-0 flex-1 items-end justify-center gap-1"
              >
                {(
                  [
                    { key: "bottle", value: d.bottle, className: "bg-amber" },
                    { key: "breast", value: d.breast, className: "bg-rose" },
                  ] as const
                ).map((bar) => {
                  const hoverKey = `${index}-${bar.key}`;
                  return (
                    <div
                      key={bar.key}
                      className="group relative flex h-full max-w-5 min-w-0 flex-1 flex-col items-center justify-end"
                      onMouseEnter={() => setHovered(hoverKey)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {hovered === hoverKey && (
                        <div className="absolute -top-7 z-10 whitespace-nowrap rounded-full bg-ink px-2 py-1 text-xs font-bold text-paper-raised">
                          {bar.value}
                        </div>
                      )}
                      <div
                        className={`w-full rounded-t-[4px] ${bar.className}`}
                        style={{
                          height: `${Math.max((bar.value / max) * 100, bar.value > 0 ? 4 : 0)}%`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-[10px] tabular-nums text-ink-soft">
            {data.map((d, index) => (
              <div key={`${d.label}-${index}`} className="min-w-0 flex-1 truncate text-center">
                {d.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

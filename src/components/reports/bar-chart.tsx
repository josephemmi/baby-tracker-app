"use client";

import { useState } from "react";

interface BarChartDatum {
  label: string;
  value: number;
  // When set, shown as a second, smaller plum-colored line stacked under
  // the primary value — and switches that bar from a hover-only tooltip to
  // a permanent label, since the point (e.g. "150 mL / 5 sessions") only
  // reads at a glance if it's always visible, not hidden behind a hover.
  subLabel?: string;
}

interface BarChartProps {
  title: string;
  data: BarChartDatum[];
  valueFormatter?: (value: number) => string;
  color?: "amber" | "sage" | "plum";
  // Marks specific bars (by index) with a small indicator under the day
  // label — used for "also had a breastfeed" on the bottle-only mL chart.
  indicators?: boolean[];
  indicatorLabel?: string;
}

const BAR_COLOR = {
  amber: "bg-amber",
  sage: "bg-sage",
  plum: "bg-plum",
};

export function BarChart({
  title,
  data,
  valueFormatter = (value) => String(value),
  color = "sage",
  indicators,
  indicatorLabel = "Also breastfed",
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-ink-soft">
          {valueFormatter(max)}
        </span>
      </div>
      <div className="flex h-36 items-end gap-1.5 border-b border-line-strong">
        {data.map((d, index) => (
          <div
            key={`${d.label}-${index}`}
            className="group relative flex h-full flex-1 flex-col items-center justify-end"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {d.subLabel ? (
              <div className="mb-1 flex flex-col items-center gap-0.5 whitespace-nowrap text-[11px] font-bold text-ink">
                <span>{valueFormatter(d.value)}</span>
                <span className="text-[10px] font-semibold text-plum">{d.subLabel}</span>
              </div>
            ) : (
              hoveredIndex === index && (
                <div className="absolute -top-7 z-10 whitespace-nowrap rounded-full bg-ink px-2 py-1 text-xs font-bold text-paper-raised">
                  {valueFormatter(d.value)}
                </div>
              )
            )}
            <div
              className={`w-full max-w-6 rounded-t-[4px] ${BAR_COLOR[color]}`}
              style={{
                height: `${Math.max((d.value / max) * 100, 4)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 text-[10px] tabular-nums text-ink-soft">
        {data.map((d, index) => (
          <div
            key={`${d.label}-${index}`}
            className="flex-1 truncate text-center"
          >
            {d.label}
            {indicators?.[index] && (
              <span
                className="ml-0.5"
                role="img"
                aria-label={indicatorLabel}
                title={indicatorLabel}
              >
                🤱
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

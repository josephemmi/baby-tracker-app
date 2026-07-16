"use client";

import { useState } from "react";

interface BarChartDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  title: string;
  data: BarChartDatum[];
  valueFormatter?: (value: number) => string;
}

export function BarChart({
  title,
  data,
  valueFormatter = (value) => String(value),
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {title}
        </h3>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {valueFormatter(max)}
        </span>
      </div>
      <div className="flex h-36 items-end gap-1.5 border-b border-zinc-300 dark:border-zinc-700">
        {data.map((d, index) => (
          <div
            key={`${d.label}-${index}`}
            className="group relative flex h-full flex-1 flex-col items-center justify-end"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {hoveredIndex === index && (
              <div className="absolute -top-7 z-10 whitespace-nowrap rounded bg-zinc-950 px-2 py-1 text-xs text-white dark:bg-zinc-50 dark:text-zinc-950">
                {valueFormatter(d.value)}
              </div>
            )}
            <div
              className="w-full max-w-6 rounded-t-[4px] bg-[#2a78d6] dark:bg-[#3987e5]"
              style={{
                height: d.value > 0 ? `${Math.max((d.value / max) * 100, 2)}%` : "0",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 text-[10px] text-zinc-500">
        {data.map((d, index) => (
          <div
            key={`${d.label}-${index}`}
            className="flex-1 truncate text-center"
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

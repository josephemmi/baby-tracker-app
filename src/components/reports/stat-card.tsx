interface StatCardProps {
  label: string;
  value: string;
  accent?: "default" | "plum";
}

export function StatCard({ label, value, accent = "default" }: StatCardProps) {
  return (
    <div className="rounded-[10px] border border-line bg-paper-raised p-4 shadow-card">
      <p className="text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
        {label}
      </p>
      <p
        className={`text-2xl font-bold tabular-nums ${accent === "plum" ? "text-plum" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

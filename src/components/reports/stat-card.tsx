interface StatCardProps {
  label: string;
  value: string;
  accent?: "default" | "pump" | "breast";
}

const ACCENT_CLASS: Record<NonNullable<StatCardProps["accent"]>, string> = {
  default: "text-ink",
  pump: "text-cat-pump-ink",
  breast: "text-cat-breast-ink",
};

export function StatCard({ label, value, accent = "default" }: StatCardProps) {
  return (
    <div className="rounded-[10px] border border-line bg-paper-raised p-4 shadow-card">
      <p className="text-[11px] font-bold tracking-[0.05em] text-ink-soft uppercase">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${ACCENT_CLASS[accent]}`}>{value}</p>
    </div>
  );
}

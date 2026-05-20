export function KpiCard({ label, value, delta, hint }: { label: string; value: string | number | null; delta?: string; hint?: string }) {
  return (
    <div className="card">
      <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</div>
      <div className="text-2xl font-bold mt-1">{value ?? '—'}</div>
      {delta && <div className="text-xs text-success font-semibold mt-1">{delta}</div>}
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </div>
  );
}

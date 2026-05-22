'use client';
// Reports — generates from Supabase snapshots + posts. AI summary via Claude.
import { useState } from 'react';
import { useActiveAccount } from '@/components/useActiveAccount';

const KINDS = [
  { id: 'weekly',         label: 'Weekly performance' },
  { id: 'monthly',        label: '30-day account report' },
  { id: 'campaign',       label: 'Campaign performance' },
  { id: 'content',        label: 'Content performance' },
  { id: 'recommendation', label: 'Monthly content recommendation' },
];

export default function ReportsPage() {
  const { id, account } = useActiveAccount();
  const [kind, setKind] = useState('weekly');
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*86400e3).toISOString().slice(0,10);
  const monthAgo = new Date(Date.now() - 30*86400e3).toISOString().slice(0,10);
  const [start, setStart] = useState(weekAgo);
  const [end, setEnd] = useState(today);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!id) return;
    setBusy(true); setErr(null); setReport(null);
    try {
      const r = await fetch('/api/reports/generate', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ account_id: id, kind, range_start: start, range_end: end }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Report failed');
      setReport(d);
    } catch (e: any) { setErr(e?.message ?? 'Report failed'); }
    finally { setBusy(false); }
  }

  if (!id || !account) return <div className="p-6 text-soft text-sm">Choose an account.</div>;

  return (
    <section className="px-4 lg:px-7 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Reports · {account.display_name}</h1>
        <p className="text-sm text-soft">Generated from real Apify-synced data in Supabase. AI summary via Claude.</p>
      </div>

      <div className="card grid md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end">
        <div><label className="field-label">Report kind</label>
          <select className="select" value={kind} onChange={e => { setKind(e.target.value); if (e.target.value === 'monthly') setStart(monthAgo); else if (e.target.value === 'weekly') setStart(weekAgo); }}>
            {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div><label className="field-label">From</label><input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className="field-label">To</label><input type="date" className="input" value={end} onChange={e => setEnd(e.target.value)} /></div>
        <button onClick={run} disabled={busy} className="btn btn-primary">{busy ? 'Generating…' : 'Generate report'}</button>
      </div>

      {err && <p className="text-xs text-danger">{err}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Posts in range" value={report.totals?.posts ?? 0} />
            <Kpi label="Avg ER" value={report.totals?.avg_er != null ? `${report.totals.avg_er}%` : '—'} />
            <Kpi label="Δ Followers" value={report.totals?.delta_followers ?? '—'} />
            <Kpi label="Top post ER" value={report.totals?.top_post?.engagement_rate != null ? `${report.totals.top_post.engagement_rate}%` : '—'} />
          </div>

          <div className="card">
            <h3 className="font-semibold text-sm mb-2">AI executive summary</h3>
            {report.ai_summary ? (
              <pre className="text-sm whitespace-pre-wrap text-soft leading-relaxed font-sans">{report.ai_summary}</pre>
            ) : <p className="text-sm text-muted">AI summary unavailable for this run.</p>}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Export</h3>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={() => alert('PDF export will be wired up in a follow-up.')}>📄 PDF</button>
                <button className="btn btn-sm" onClick={() => downloadCsv(report)}>📊 CSV</button>
                <button className="btn btn-sm" onClick={() => alert('PPT export will be wired up in a follow-up.')}>📽 PPT</button>
              </div>
            </div>
            <p className="text-[11px] text-muted">Data source: Supabase analytics_snapshots + posts. Re-run after the next Apify sync for fresh numbers.</p>
          </div>
        </>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return <div className="card"><div className="text-[11px] uppercase text-muted font-semibold">{label}</div><div className="text-2xl font-bold mt-1">{value}</div></div>;
}

function downloadCsv(report: any) {
  const rows = [['date','followers','engagement_rate']];
  (report.report?.data?.snapshots ?? []).forEach((s: any) => rows.push([s.snapshot_date, s.followers, s.engagement_rate]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `lumen-report-${report.report?.kind}-${report.report?.range_start}_${report.report?.range_end}.csv`; a.click();
  URL.revokeObjectURL(url);
}

'use client';
// Account-aware executive dashboard. Compact charts (above-the-fold).
import { useEffect, useState } from 'react';
import { useActiveAccount } from '@/components/useActiveAccount';
import { KpiCard } from '@/components/KpiCard';
import { EngagementArea, FollowersLine } from '@/components/Charts';
import ConnectAccountState from '@/components/ConnectAccountState';

interface Snap { snapshot_date: string; followers: number | null; engagement_rate: number | null; reach: number | null; impressions: number | null; }
interface Post { id: string; caption: string | null; engagement_rate: number | null; content_type: string | null; url: string | null; }

export default function DashboardPage() {
  const { id, account } = useActiveAccount();
  const [summary, setSummary] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<Snap[]>([]);
  const [topPosts, setTopPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/analytics/${id}?range=30`);
      const d = await r.json();
      setSummary(d.summary);
      setSnapshots(d.snapshots ?? []);
      setTopPosts(d.top_posts ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]);

  if (!id || !account) {
    return <div className="p-6 text-soft text-sm">Choose an account to view the dashboard.</div>;
  }

  const needsConnect = !snapshots.length && (account.status !== 'syncing');
  const isLinkedIn = account.platform === 'linkedin';
  const chartData = snapshots.map(s => ({ date: s.snapshot_date.slice(5), engagement_rate: s.engagement_rate, followers: s.followers }));

  return (
    <section className="px-4 lg:px-7 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">{account.display_name}</h1>
        <p className="text-sm text-soft">{account.profile_type}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Followers" value={fmt(summary?.followers)} delta={summary?.delta_followers != null && summary.delta_followers !== 0 ? `▲ ${summary.delta_followers.toLocaleString()} (30d)` : undefined} />
        <KpiCard label="Engagement rate" value={summary?.engagement_rate != null ? `${summary.engagement_rate}%` : null} />
        <KpiCard label={isLinkedIn ? 'Impressions' : 'Reach (30d)'} value={fmt(isLinkedIn ? summary?.impressions : summary?.reach)} />
        <KpiCard label="Last sync" value={summary?.last_synced_at ? new Date(summary.last_synced_at).toLocaleDateString() : '—'} hint={summary?.last_synced_at ? new Date(summary.last_synced_at).toLocaleTimeString() : undefined} />
      </div>

      {/* Connect / loading / error */}
      {needsConnect && (
        <ConnectAccountState
          accountId={id}
          handle={account.handle}
          platform={account.platform}
          status={account.status}
          lastSyncedAt={summary?.last_synced_at ?? null}
          onSynced={load}
        />
      )}

      {/* Charts — compact + responsive */}
      {!!snapshots.length && (
        <div className="chart-grid">
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold text-sm">Engagement (30d)</h3>
                <p className="text-[11px] text-muted">Daily ER%, account-specific.</p>
              </div>
            </div>
            <EngagementArea data={chartData} />
          </div>
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-semibold text-sm">Followers (30d)</h3>
                <p className="text-[11px] text-muted">Followers trajectory.</p>
              </div>
            </div>
            <FollowersLine data={chartData} />
          </div>
        </div>
      )}

      {/* Top posts */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Top performing posts</h3>
          {loading && <span className="text-xs text-muted">Loading…</span>}
        </div>
        {topPosts.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">No posts indexed yet. Run an Apify sync from the Connections page.</p>
        ) : (
          <ul className="divide-y divide-line">
            {topPosts.map(p => (
              <li key={p.id} className="py-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand to-brand-2 grid place-items-center text-white text-xs uppercase font-bold shrink-0">{(p.content_type ?? 'P').slice(0,2)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium line-clamp-2">{p.caption ?? '(no caption)'}</p>
                  <p className="text-[11px] text-muted mt-1">{p.content_type ?? '—'} · ER {p.engagement_rate ?? '—'}%</p>
                </div>
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-brand font-semibold whitespace-nowrap">Open ↗</a>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function fmt(v: any) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

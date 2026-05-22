'use client';
import { useEffect, useState } from 'react';
import { useActiveAccount } from '@/components/useActiveAccount';
import { ContentTypeBar, EngagementArea, FollowersLine } from '@/components/Charts';
import { KpiCard } from '@/components/KpiCard';
import ConnectAccountState from '@/components/ConnectAccountState';

export default function AnalyticsPage() {
  const { id, account } = useActiveAccount();
  const [range, setRange] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/analytics/${id}?range=${range}`);
      setData(await r.json());
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id, range]);

  if (!id || !account) return <div className="p-6 text-soft text-sm">Choose an account.</div>;

  const snapshots = data?.snapshots ?? [];
  const summary = data?.summary;
  const posts = data?.top_posts ?? [];
  const chartData = snapshots.map((s: any) => ({ date: s.snapshot_date.slice(5), engagement_rate: s.engagement_rate, followers: s.followers }));
  const byType = aggregateByType(posts);

  return (
    <section className="px-4 lg:px-7 py-6 lg:py-8 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Analytics · {account.display_name}</h1>
          <p className="text-sm text-soft">{account.platform === 'linkedin' ? 'LinkedIn analytics' : 'Instagram analytics'} pulled from Apify.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="select w-auto" value={range} onChange={e => setRange(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </select>
        </div>
      </div>

      {!snapshots.length ? (
        <ConnectAccountState accountId={id} handle={account.handle} platform={account.platform} status={account.status} lastSyncedAt={summary?.last_synced_at ?? null} onSynced={load} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Followers" value={summary?.followers?.toLocaleString() ?? '—'} />
            <KpiCard label="Engagement rate" value={summary?.engagement_rate != null ? `${summary.engagement_rate}%` : '—'} />
            <KpiCard label="Posts (range)" value={posts.length} />
            <KpiCard label="Δ Followers" value={summary?.delta_followers?.toLocaleString() ?? '—'} />
          </div>

          <div className="chart-grid">
            <div className="card">
              <h3 className="font-semibold text-sm mb-2">Engagement trend</h3>
              <EngagementArea data={chartData} />
            </div>
            <div className="card">
              <h3 className="font-semibold text-sm mb-2">Follower trajectory</h3>
              <FollowersLine data={chartData} />
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-sm mb-2">Engagement by content type</h3>
            {byType.length ? <ContentTypeBar data={byType} /> : <p className="text-sm text-muted py-6 text-center">Not enough categorized posts yet.</p>}
          </div>
        </>
      )}
    </section>
  );
}

function aggregateByType(posts: any[]) {
  const m = new Map<string, { sum: number; n: number }>();
  posts.forEach(p => {
    const t = (p.content_type ?? 'unknown') as string;
    const e = Number(p.engagement_rate) || 0;
    const c = m.get(t) ?? { sum: 0, n: 0 };
    c.sum += e; c.n += 1; m.set(t, c);
  });
  return Array.from(m.entries()).map(([type, c]) => ({ type, engagement_rate: Number((c.sum / c.n).toFixed(2)) }));
}

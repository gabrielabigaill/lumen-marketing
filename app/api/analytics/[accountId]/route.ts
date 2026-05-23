// GET /api/analytics/[accountId]?range=30
// Returns snapshots + top posts + engagement series for the chosen account.
// No auth — shared across devices.
import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { accountId: string } }) {
  const admin = createSupabaseAdmin();
  const url = new URL(req.url);
  const days = Math.min(180, Number(url.searchParams.get('range') ?? 30));
  const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);

  const [{ data: account }, { data: snapshots }, { data: topPosts }] = await Promise.all([
    admin.from('connected_accounts').select('*').eq('id', params.accountId).single(),
    admin.from('analytics_snapshots')
      .select('*').eq('account_id', params.accountId).gte('snapshot_date', since)
      .order('snapshot_date', { ascending: true }),
    admin.from('posts')
      .select('*').eq('account_id', params.accountId)
      .order('engagement_rate', { ascending: false, nullsFirst: false })
      .limit(5),
  ]);

  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const latest = snapshots?.[snapshots.length - 1] ?? null;
  const first = snapshots?.[0] ?? null;
  const deltaFollowers = latest && first ? (latest.followers ?? 0) - (first.followers ?? 0) : null;

  return NextResponse.json({
    account,
    snapshots: snapshots ?? [],
    top_posts: topPosts ?? [],
    summary: {
      followers: latest?.followers ?? null,
      engagement_rate: latest?.engagement_rate ?? null,
      reach: latest?.reach ?? null,
      impressions: latest?.impressions ?? null,
      delta_followers: deltaFollowers,
      last_synced_at: account.last_synced_at,
      status: account.status,
    },
  });
}

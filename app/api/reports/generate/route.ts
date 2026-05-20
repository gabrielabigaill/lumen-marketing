// POST /api/reports/generate
// Body: { account_id, kind, range_start, range_end, campaign_id? }
// Aggregates real data (snapshots + posts) and asks Claude for an exec summary.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { generate } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { account_id, kind, range_start, range_end, campaign_id } = await req.json();
  if (!account_id || !kind || !range_start || !range_end) {
    return NextResponse.json({ error: 'account_id, kind, range_start, range_end required' }, { status: 400 });
  }

  const [{ data: account }, { data: snapshots }, { data: posts }] = await Promise.all([
    sb.from('connected_accounts').select('*').eq('id', account_id).single(),
    sb.from('analytics_snapshots').select('*').eq('account_id', account_id)
      .gte('snapshot_date', range_start).lte('snapshot_date', range_end)
      .order('snapshot_date', { ascending: true }),
    sb.from('posts').select('*').eq('account_id', account_id)
      .gte('posted_at', range_start).lte('posted_at', range_end + 'T23:59:59')
      .order('engagement_rate', { ascending: false, nullsFirst: false }),
  ]);
  if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const first = snapshots?.[0];
  const last = snapshots?.[snapshots.length - 1];
  const totals = {
    posts: posts?.length ?? 0,
    delta_followers: first && last ? (last.followers ?? 0) - (first.followers ?? 0) : null,
    avg_er: posts?.length
      ? Number((posts.reduce((a, p) => a + (Number(p.engagement_rate) || 0), 0) / posts.length).toFixed(3))
      : null,
    top_post: posts?.[0] ?? null,
  };

  let ai_summary: string | null = null;
  try {
    const { text } = await generate({
      kind: 'report',
      account: {
        account: { platform: account.platform, handle: account.handle, display_name: account.display_name, profile_type: account.profile_type },
        snapshot: last ?? null,
        recent_top_posts: (posts ?? []).slice(0, 3).map(p => ({
          caption: p.caption, engagement_rate: p.engagement_rate, content_type: p.content_type,
        })),
      },
      extra: { range_start, range_end, totals },
    });
    ai_summary = text;
  } catch (err: any) {
    ai_summary = null; // report still works without AI
  }

  const { data: report, error } = await sb.from('reports').insert({
    user_id: user.id,
    account_id,
    campaign_id: campaign_id ?? null,
    kind,
    range_start,
    range_end,
    data: { totals, snapshots, post_count: posts?.length ?? 0 },
    ai_summary,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ report, totals, ai_summary });
}

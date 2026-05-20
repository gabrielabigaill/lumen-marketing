// POST /api/apify/sync  { account_id }
// Runs an Apify actor for the account, normalizes the data, persists snapshots + posts.
import { NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { scrapeAccount, engagementRate } from '@/lib/apify';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — Apify scrapes are slow.

export async function POST(req: Request) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { account_id } = await req.json();
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });

  const { data: account, error: aErr } = await sb
    .from('connected_accounts').select('*').eq('id', account_id).single();
  if (aErr || !account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Use service-role for writes after we've authorized the user — RLS would already permit, but this is faster.
  const admin = createSupabaseAdmin();

  await admin.from('connected_accounts').update({ status: 'syncing' }).eq('id', account_id);
  const syncRow = await admin
    .from('account_syncs')
    .insert({ account_id, source: 'apify', status: 'running' })
    .select().single();

  try {
    const result = await scrapeAccount(account.platform, account.handle);

    // Save daily snapshot.
    const today = new Date().toISOString().slice(0, 10);
    const totalEngagement = result.posts.reduce(
      (acc, p) => acc + p.likes + p.comments + p.shares + p.saves, 0,
    );
    const er = result.profile.followers
      ? Number(((totalEngagement / Math.max(1, result.posts.length)) / result.profile.followers * 100).toFixed(3))
      : null;

    await admin.from('analytics_snapshots').upsert({
      account_id,
      snapshot_date: today,
      followers: result.profile.followers,
      following: result.profile.following,
      posts_count: result.profile.posts_count,
      engagement_rate: er,
      raw: result.profile.raw,
    }, { onConflict: 'account_id,snapshot_date' });

    // Save posts.
    if (result.posts.length) {
      const rows = result.posts.map(p => ({
        account_id,
        external_id: p.external_id,
        url: p.url,
        posted_at: p.posted_at,
        content_type: p.content_type,
        caption: p.caption,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        saves: p.saves,
        thumbnail_url: p.thumbnail_url,
        engagement_rate: engagementRate(p, result.profile.followers),
        raw: p.raw,
      }));
      await admin.from('posts').upsert(rows, { onConflict: 'account_id,external_id' });
    }

    await admin.from('connected_accounts').update({
      status: 'connected',
      apify_dataset_id: result.datasetId,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', account_id);

    await admin.from('account_syncs').update({
      status: 'succeeded',
      run_id: result.runId,
      records_in: result.posts.length,
      finished_at: new Date().toISOString(),
    }).eq('id', syncRow.data?.id);

    return NextResponse.json({
      ok: true,
      records: result.posts.length,
      followers: result.profile.followers,
      run_id: result.runId,
    });
  } catch (err: any) {
    const message = err?.message ?? 'Sync failed';
    await admin.from('connected_accounts').update({
      status: 'error', last_error: message,
    }).eq('id', account_id);
    await admin.from('account_syncs').update({
      status: 'failed', error: message, finished_at: new Date().toISOString(),
    }).eq('id', syncRow.data?.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

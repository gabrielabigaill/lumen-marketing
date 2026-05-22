// POST /api/apify/finalize  { account_id, plan }
//
// Polls the Apify runs in the supplied plan. Possible responses:
//   - { status: 'running' }                 → keep polling
//   - { status: 'succeeded', records: N }   → done; data has been upserted
//   - { status: 'failed', error: '...' }    → done; sync failed
//
// Designed to return in well under 10s so it's safe to poll every 10s within
// EdgeOne's 30s function ceiling.

import { NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { checkSyncState, collectSyncResults, engagementRate, type SyncPlan } from '@/lib/apify';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const account_id: string | undefined = body.account_id;
  const plan: SyncPlan | undefined = body.plan;
  if (!account_id || !plan) {
    return NextResponse.json({ error: 'account_id and plan required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  try {
    const { state, error } = await checkSyncState(plan);

    if (state === 'running') {
      return NextResponse.json({ status: 'running' });
    }

    if (state === 'failed') {
      try {
        await admin.from('connected_accounts').update({
          status: 'error', last_error: error ?? 'Apify run failed',
        }).eq('id', account_id);
      } catch { /* best effort */ }
      return NextResponse.json({ status: 'failed', error });
    }

    // Succeeded — fetch dataset items, normalize, upsert
    const result = await collectSyncResults(plan);
    const today = new Date().toISOString().slice(0, 10);
    const totalEngagement = result.posts.reduce(
      (acc, p) => acc + p.likes + p.comments + p.shares + p.saves, 0,
    );
    const er = result.profile.followers
      ? Number(((totalEngagement / Math.max(1, result.posts.length)) / result.profile.followers * 100).toFixed(3))
      : null;

    const { error: snapErr } = await admin.from('analytics_snapshots').upsert({
      account_id,
      snapshot_date: today,
      followers: result.profile.followers,
      following: result.profile.following,
      posts_count: result.profile.posts_count,
      engagement_rate: er,
      raw: result.profile.raw,
    }, { onConflict: 'account_id,snapshot_date' });
    if (snapErr) {
      return NextResponse.json({ status: 'failed', error: `Snapshot upsert failed: ${snapErr.message}` }, { status: 500 });
    }

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
      const { error: postsErr } = await admin.from('posts').upsert(rows, { onConflict: 'account_id,external_id' });
      if (postsErr) {
        return NextResponse.json({ status: 'failed', error: `Posts upsert failed: ${postsErr.message}` }, { status: 500 });
      }
    }

    try {
      await admin.from('connected_accounts').update({
        status: 'connected',
        apify_dataset_id: result.datasetId,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', account_id);
    } catch { /* best effort */ }

    return NextResponse.json({ ok: true, status: 'succeeded', records: result.posts.length, followers: result.profile.followers });
  } catch (err: any) {
    const message = err?.message ?? 'Finalize failed';
    try {
      await admin.from('connected_accounts').update({
        status: 'error', last_error: message,
      }).eq('id', account_id);
    } catch { /* best effort */ }
    return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
  }
}

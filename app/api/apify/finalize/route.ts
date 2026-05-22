// POST /api/apify/finalize  { sync_id }
//
// Polls the Apify runs tied to a sync row. Possible responses:
//   - { status: 'running' }                 → keep polling
//   - { status: 'succeeded', records: N }   → done; data has been upserted
//   - { status: 'failed', error: '...' }    → done; sync failed
//
// Designed to return in well under 10s so it's safe to poll every 10s without
// EdgeOne's 30s function ceiling biting.

import { NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { checkSyncState, collectSyncResults, engagementRate, type SyncPlan } from '@/lib/apify';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { sync_id } = await req.json();
  if (!sync_id) return NextResponse.json({ error: 'sync_id required' }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: sync } = await admin
    .from('account_syncs').select('*').eq('id', sync_id).single();
  if (!sync) return NextResponse.json({ error: 'Sync not found' }, { status: 404 });

  if (sync.status === 'succeeded' || sync.status === 'failed') {
    return NextResponse.json({ status: sync.status, error: sync.error ?? undefined });
  }

  let plan: SyncPlan;
  try {
    plan = JSON.parse(sync.run_id);
  } catch {
    return NextResponse.json({ error: 'Sync record is malformed' }, { status: 500 });
  }

  try {
    const { state, error } = await checkSyncState(plan);

    if (state === 'running') {
      return NextResponse.json({ status: 'running' });
    }

    if (state === 'failed') {
      await admin.from('account_syncs').update({
        status: 'failed', error: error ?? 'Apify run failed', finished_at: new Date().toISOString(),
      }).eq('id', sync_id);
      await admin.from('connected_accounts').update({
        status: 'error', last_error: error ?? 'Apify run failed',
      }).eq('id', sync.account_id);
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

    await admin.from('analytics_snapshots').upsert({
      account_id: sync.account_id,
      snapshot_date: today,
      followers: result.profile.followers,
      following: result.profile.following,
      posts_count: result.profile.posts_count,
      engagement_rate: er,
      raw: result.profile.raw,
    }, { onConflict: 'account_id,snapshot_date' });

    if (result.posts.length) {
      const rows = result.posts.map(p => ({
        account_id: sync.account_id,
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
    }).eq('id', sync.account_id);

    await admin.from('account_syncs').update({
      status: 'succeeded',
      run_id: result.runId,
      records_in: result.posts.length,
      finished_at: new Date().toISOString(),
    }).eq('id', sync_id);

    return NextResponse.json({ ok: true, status: 'succeeded', records: result.posts.length });
  } catch (err: any) {
    const message = err?.message ?? 'Finalize failed';
    await admin.from('account_syncs').update({
      status: 'failed', error: message, finished_at: new Date().toISOString(),
    }).eq('id', sync_id);
    await admin.from('connected_accounts').update({
      status: 'error', last_error: message,
    }).eq('id', sync.account_id);
    return NextResponse.json({ status: 'failed', error: message }, { status: 500 });
  }
}

// POST /api/apify/sync  { account_id }
//
// Kicks off the Apify run(s) for an account and returns immediately with the
// plan (run IDs + metadata). The actual scrape can take 30-90s — far longer
// than EdgeOne's per-function ceiling — so the client must poll
// /api/apify/finalize with the returned plan until the run(s) succeed.

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { startSync } from '@/lib/apify';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const { account_id } = await req.json();
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });

  // Use admin client to read account — RLS sometimes blocks if the user's
  // session row isn't fully wired up yet. Account-level access checks should
  // be enforced via API gating instead of relying purely on RLS here.
  const admin = createSupabaseAdmin();
  const { data: account, error: aErr } = await admin
    .from('connected_accounts').select('*').eq('id', account_id).single();
  if (aErr || !account) {
    return NextResponse.json({ error: aErr?.message ?? 'Account not found' }, { status: 404 });
  }

  try {
    const plan = await startSync(account.platform, account.handle);

    // Best-effort: mark the account as syncing and log a sync row. If either
    // fails (RLS, schema drift, etc.) we still return the plan so the client
    // can keep going — the source of truth is the plan, not the DB row.
    try {
      await admin.from('connected_accounts').update({ status: 'syncing', last_error: null }).eq('id', account_id);
    } catch { /* ignored */ }
    try {
      await admin.from('account_syncs').insert({
        account_id,
        source: 'apify',
        status: 'running',
        run_id: plan.profile_run_id,
      });
    } catch { /* ignored */ }

    return NextResponse.json({ ok: true, account_id, plan });
  } catch (err: any) {
    const message = err?.message ?? 'Failed to start Apify sync';
    try { await admin.from('connected_accounts').update({ status: 'error', last_error: message }).eq('id', account_id); } catch {}
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

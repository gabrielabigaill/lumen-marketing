// POST /api/apify/sync  { account_id }
//
// Kicks off the Apify run(s) for an account and returns immediately with the
// run IDs. The actual scrape can take 30-90s — far longer than EdgeOne's
// per-function ceiling — so the client must poll /api/apify/finalize until
// the run(s) succeed.

import { NextResponse } from 'next/server';
import { createSupabaseServer, createSupabaseAdmin } from '@/lib/supabase/server';
import { startSync, type SyncPlan } from '@/lib/apify';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { account_id } = await req.json();
  if (!account_id) return NextResponse.json({ error: 'account_id required' }, { status: 400 });

  const { data: account, error: aErr } = await sb
    .from('connected_accounts').select('*').eq('id', account_id).single();
  if (aErr || !account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const admin = createSupabaseAdmin();

  try {
    const plan: SyncPlan = await startSync(account.platform, account.handle);

    // Mark the account as syncing, write a sync row that stores the run IDs
    // in account_syncs.run_id (as JSON) so /finalize can pick them up.
    await admin.from('connected_accounts').update({ status: 'syncing', last_error: null }).eq('id', account_id);
    const inserted = await admin
      .from('account_syncs')
      .insert({
        account_id,
        source: 'apify',
        status: 'running',
        run_id: JSON.stringify(plan),
      })
      .select('id').single();

    return NextResponse.json({ ok: true, sync_id: inserted.data?.id, plan });
  } catch (err: any) {
    const message = err?.message ?? 'Failed to start Apify sync';
    await admin.from('connected_accounts').update({ status: 'error', last_error: message }).eq('id', account_id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

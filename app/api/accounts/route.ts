// GET  /api/accounts          → list ALL connected accounts (shared across devices)
// POST /api/accounts          → upsert one account
//
// No auth required — the dashboard is shareable across devices. Anyone with
// the URL sees the same accounts and data. If you want to lock this down, put
// it behind a network rule or add a shared secret check here.

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { ACCOUNT_SEEDS } from '@/lib/accounts';

export const runtime = 'nodejs';

export async function GET() {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('connected_accounts')
    .select('id, platform, handle, display_name, profile_type, status, profile_pic_url, followers_cache, last_synced_at, last_error, apify_dataset_id, user_id')
    .order('platform')
    .order('handle');

  // If the table doesn't have the new columns yet (migration not applied) or
  // is empty for any reason, fall back to seeds so the UI still renders.
  if (error || !data || data.length === 0) {
    return NextResponse.json({
      accounts: ACCOUNT_SEEDS.map((s, i) => ({
        id: `seed-${i}`,
        platform: s.platform,
        handle: s.handle,
        display_name: s.display_name,
        profile_type: s.profile_type,
        status: 'needs_connection',
        profile_pic_url: null,
        followers_cache: null,
        last_synced_at: null,
      })),
      authenticated: false,
      seeded: true,
      error: error?.message ?? undefined,
    });
  }

  return NextResponse.json({ accounts: data, authenticated: true });
}

export async function POST(req: Request) {
  const admin = createSupabaseAdmin();
  const body = await req.json();
  const { platform, handle, display_name, profile_type, status } = body;
  if (!platform || !handle) {
    return NextResponse.json({ error: 'platform and handle are required' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('connected_accounts')
    .upsert(
      {
        platform,
        handle,
        display_name: display_name || `@${handle}`,
        profile_type: profile_type || '',
        status: status || 'connecting',
      },
      { onConflict: 'platform,handle' },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ account: data });
}

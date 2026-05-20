// GET  /api/accounts          → list current user's connected accounts
// POST /api/accounts          → upsert one account (used by Connect Account flow)
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ACCOUNT_SEEDS } from '@/lib/accounts';

export const runtime = 'nodejs';

export async function GET() {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  // Unauthenticated → return seed list so the account-select screen still renders.
  if (!user) {
    return NextResponse.json({
      accounts: ACCOUNT_SEEDS.map((s, i) => ({
        id: `seed-${i}`,
        platform: s.platform,
        handle: s.handle,
        display_name: s.display_name,
        profile_type: s.profile_type,
        status: 'needs_connection',
        last_synced_at: null,
      })),
      authenticated: false,
    });
  }

  const { data, error } = await sb
    .from('connected_accounts')
    .select('*')
    .order('platform')
    .order('handle');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ accounts: data, authenticated: true });
}

export async function POST(req: Request) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { platform, handle, display_name, profile_type, status } = body;
  if (!platform || !handle) {
    return NextResponse.json({ error: 'platform and handle are required' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('connected_accounts')
    .upsert(
      {
        user_id: user.id,
        platform,
        handle,
        display_name: display_name || `@${handle}`,
        profile_type: profile_type || '',
        status: status || 'connecting',
      },
      { onConflict: 'user_id,platform,handle' },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ account: data });
}

// POST /api/ai/generate
// Reusable Claude generator. Pulls account + recent posts from Supabase so every
// generation is grounded in real data. Persists the output to ai_outputs.
//
// No auth required — the site is intended to be openly accessible across
// devices. Data access uses the admin client so RLS doesn't block reads.

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';
import { generate } from '@/lib/ai';
import type { AiKind } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { kind, account_id, campaign_id, save, ...inputs } = body as {
    kind: AiKind; account_id?: string; campaign_id?: string; save?: boolean;
    [k: string]: any;
  };
  if (!kind) return NextResponse.json({ error: 'kind required' }, { status: 400 });

  const admin = createSupabaseAdmin();

  // Pull grounding context for the active account.
  let accountContext: any = undefined;
  if (account_id) {
    const [{ data: account }, { data: snapshot }, { data: topPosts }] = await Promise.all([
      admin.from('connected_accounts').select('platform, handle, display_name, profile_type, status')
        .eq('id', account_id).single(),
      admin.from('analytics_snapshots').select('*').eq('account_id', account_id)
        .order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
      admin.from('posts').select('caption, engagement_rate, content_type').eq('account_id', account_id)
        .order('engagement_rate', { ascending: false, nullsFirst: false }).limit(3),
    ]);
    if (account) {
      accountContext = { account, snapshot: snapshot ?? null, recent_top_posts: topPosts ?? [] };
    }
  }

  try {
    const result = await generate({ kind, account: accountContext, ...inputs });
    // Best-effort log to ai_outputs. user_id may be null on the schema if you've
    // already migrated it to drop the NOT NULL constraint.
    try {
      const { data: row } = await admin.from('ai_outputs').insert({
        user_id: null,
        account_id: account_id ?? null,
        campaign_id: campaign_id ?? null,
        kind,
        inputs: { ...inputs, account_id, campaign_id },
        output: result.text,
        model: result.model,
        tokens_in: result.tokens_in ?? null,
        tokens_out: result.tokens_out ?? null,
        saved: !!save,
      }).select().single();
      return NextResponse.json({ output: result.text, model: result.model, id: row?.id ?? null });
    } catch {
      return NextResponse.json({ output: result.text, model: result.model, id: null });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'AI generation failed' }, { status: 500 });
  }
}

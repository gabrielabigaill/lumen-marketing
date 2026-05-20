// POST /api/ai/generate
// Reusable Claude generator. Pulls account + recent posts from Supabase so every
// generation is grounded in real data. Persists the output to ai_outputs.
import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { generate } from '@/lib/ai';
import type { AiKind, AccountStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { kind, account_id, campaign_id, save, ...inputs } = body as {
    kind: AiKind; account_id?: string; campaign_id?: string; save?: boolean;
    [k: string]: any;
  };
  if (!kind) return NextResponse.json({ error: 'kind required' }, { status: 400 });

  // Pull grounding context for the active account.
  let accountContext: any = undefined;
  if (account_id) {
    const [{ data: account }, { data: snapshot }, { data: topPosts }] = await Promise.all([
      sb.from('connected_accounts').select('platform, handle, display_name, profile_type, status')
        .eq('id', account_id).single(),
      sb.from('analytics_snapshots').select('*').eq('account_id', account_id)
        .order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
      sb.from('posts').select('caption, engagement_rate, content_type').eq('account_id', account_id)
        .order('engagement_rate', { ascending: false, nullsFirst: false }).limit(3),
    ]);
    if (account) {
      accountContext = { account, snapshot: snapshot ?? null, recent_top_posts: topPosts ?? [] };
    }
  }

  try {
    const result = await generate({ kind, account: accountContext, ...inputs });
    const { data: row } = await sb.from('ai_outputs').insert({
      user_id: user.id,
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
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'AI generation failed' }, { status: 500 });
  }
}

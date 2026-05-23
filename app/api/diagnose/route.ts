// GET /api/diagnose
//
// Returns a sanitized view of env vars + a live ping of Apify so we can
// confirm what the deployed function is actually seeing. Safe to expose:
// only token prefixes/suffixes are returned, never the full secret.

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

function mask(v: string | undefined): string {
  if (!v) return '(unset)';
  if (v.length < 12) return `(set, length ${v.length}, looks too short)`;
  return `${v.slice(0, 8)}…${v.slice(-4)} (length ${v.length})`;
}

export async function GET() {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : '(unset)',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
    APIFY_TOKEN: mask(process.env.APIFY_TOKEN),
    APIFY_ACTOR_INSTAGRAM_PROFILE: process.env.APIFY_ACTOR_INSTAGRAM_PROFILE ?? '(unset → defaulting to apify/instagram-profile-scraper)',
    APIFY_ACTOR_INSTAGRAM_POSTS: process.env.APIFY_ACTOR_INSTAGRAM_POSTS ?? '(unset → defaulting to apify/instagram-post-scraper)',
    APIFY_ACTOR_LINKEDIN_PROFILE: process.env.APIFY_ACTOR_LINKEDIN_PROFILE ?? '(unset → defaulting to apify/linkedin-profile-scraper)',
    ANTHROPIC_API_KEY: mask(process.env.ANTHROPIC_API_KEY),
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? '(unset)',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '(unset)',
  };

  // Live ping Apify to see if the token Apify sees matches one of your account's tokens.
  let apify_check: any = { tested: false };
  if (process.env.APIFY_TOKEN) {
    try {
      const res = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`);
      const body = await res.json();
      if (res.ok) {
        apify_check = { tested: true, ok: true, username: body?.data?.username ?? null, plan: body?.data?.plan ?? null };
      } else {
        apify_check = { tested: true, ok: false, status: res.status, error: body?.error?.message ?? body?.error ?? body };
      }
    } catch (e: any) {
      apify_check = { tested: true, ok: false, error: e?.message ?? 'fetch failed' };
    }
  }

  return NextResponse.json({ env, apify_check });
}

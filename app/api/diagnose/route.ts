// GET /api/diagnose
// Sanitized view of env vars + a live ping of Apify so we can confirm what the
// deployed function is actually seeing. Safe to expose: only token prefixes/
// suffixes are returned. No auth required.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

function mask(v: string | undefined): string {
  if (!v) return '(unset)';
  if (v.length < 12) return `(set, length ${v.length}, looks too short)`;
  return `${v.slice(0, 8)}…${v.slice(-4)} (length ${v.length})`;
}

export async function GET() {
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

  let apify_check: any = { tested: false };
  if (process.env.APIFY_TOKEN) {
    try {
      const res = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(process.env.APIFY_TOKEN)}`);
      const body = await res.json();
      apify_check = res.ok
        ? { tested: true, ok: true, username: body?.data?.username ?? null, plan: body?.data?.plan?.tier ?? null }
        : { tested: true, ok: false, status: res.status, error: body?.error?.message ?? body?.error ?? body };
    } catch (e: any) {
      apify_check = { tested: true, ok: false, error: e?.message ?? 'fetch failed' };
    }
  }

  let anthropic_check: any = { tested: false };
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      const body = await res.json();
      anthropic_check = res.ok
        ? { tested: true, ok: true, model: body?.model ?? null }
        : { tested: true, ok: false, status: res.status, error: body?.error?.message ?? body?.error?.type ?? body };
    } catch (e: any) {
      anthropic_check = { tested: true, ok: false, error: e?.message ?? 'fetch failed' };
    }
  }

  return NextResponse.json({ env, apify_check, anthropic_check });
}

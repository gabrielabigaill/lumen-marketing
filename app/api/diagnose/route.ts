// GET /api/diagnose
// Sanitized view of env vars + live pings to Apify, Anthropic, and OpenAI so we
// can tell exactly what each provider sees. No auth required. Token prefixes
// and suffixes only — never the full secret.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

function mask(v: string | undefined): string {
  if (!v) return '(unset)';
  if (v.length < 12) return `(set, length ${v.length}, looks too short)`;
  return `${v.slice(0, 10)}…${v.slice(-4)} (length ${v.length})`;
}

async function pingAnthropic(model: string): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { skipped: 'no ANTHROPIC_API_KEY' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
    });
    const text = await res.text();
    let body: any; try { body = text ? JSON.parse(text) : {}; } catch { body = { _raw: text.slice(0, 200) }; }
    return res.ok
      ? { ok: true, model: body?.model ?? model }
      : { ok: false, status: res.status, error: body?.error?.message ?? body?.error?.type ?? body?._raw ?? `${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'fetch failed' };
  }
}

async function pingOpenAI(model: string): Promise<any> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { skipped: 'no OPENAI_API_KEY' };
  return pingOpenAICompatible('https://api.openai.com/v1', key, model);
}

async function pingGroq(model: string): Promise<any> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { skipped: 'no GROQ_API_KEY — sign up free at console.groq.com' };
  return pingOpenAICompatible('https://api.groq.com/openai/v1', key, model);
}

async function pingOpenAICompatible(base: string, key: string, model: string): Promise<any> {
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
    });
    const text = await res.text();
    let body: any; try { body = text ? JSON.parse(text) : {}; } catch { body = { _raw: text.slice(0, 200) }; }
    return res.ok
      ? { ok: true, model: body?.model ?? model }
      : { ok: false, status: res.status, error: body?.error?.message ?? body?.error?.type ?? body?._raw ?? `${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'fetch failed' };
  }
}

async function pingApify(): Promise<any> {
  const key = process.env.APIFY_TOKEN;
  if (!key) return { skipped: 'no APIFY_TOKEN' };
  try {
    const res = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(key)}`);
    const body = await res.json();
    return res.ok
      ? { ok: true, username: body?.data?.username ?? null, plan: body?.data?.plan?.tier ?? null }
      : { ok: false, status: res.status, error: body?.error?.message ?? body?.error ?? body };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'fetch failed' };
  }
}

export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : '(unset)',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: mask(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
    APIFY_TOKEN: mask(process.env.APIFY_TOKEN),
    APIFY_ACTOR_INSTAGRAM_PROFILE: process.env.APIFY_ACTOR_INSTAGRAM_PROFILE ?? '(unset — default: apify/instagram-profile-scraper)',
    APIFY_ACTOR_INSTAGRAM_POSTS: process.env.APIFY_ACTOR_INSTAGRAM_POSTS ?? '(unset — default: apify/instagram-post-scraper)',
    APIFY_ACTOR_LINKEDIN_PROFILE: process.env.APIFY_ACTOR_LINKEDIN_PROFILE ?? '(unset — default: apify/linkedin-profile-scraper)',
    ANTHROPIC_API_KEY: mask(process.env.ANTHROPIC_API_KEY),
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? '(unset)',
    OPENAI_API_KEY: mask(process.env.OPENAI_API_KEY),
    OPENAI_MODEL: process.env.OPENAI_MODEL ?? '(unset)',
    GROQ_API_KEY: mask(process.env.GROQ_API_KEY),
    GROQ_MODEL: process.env.GROQ_MODEL ?? '(unset)',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '(unset)',
  };

  const [apify_check, anthropic_env_model, anthropic_haiku, openai_check, groq_check] = await Promise.all([
    pingApify(),
    pingAnthropic(process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'),
    pingAnthropic('claude-3-5-haiku-20241022'),
    pingOpenAI(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
    pingGroq(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'),
  ]);

  return NextResponse.json({
    env,
    apify_check,
    anthropic_check: { env_model: anthropic_env_model, fallback_haiku: anthropic_haiku },
    openai_check,
    groq_check,
  });
}

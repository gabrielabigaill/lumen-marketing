// Single reusable AI service. Used by:
//   - /api/ai/generate       (AI Studio)
//   - /api/reports/generate  (AI summaries on reports)
//
// Provider chain (first available wins; on failure, falls through to next):
//   1. Anthropic Claude   (ANTHROPIC_API_KEY)  — premium, paid
//   2. OpenAI             (OPENAI_API_KEY)     — paid
//   3. Groq               (GROQ_API_KEY)       — FREE, no credit card needed
//
// Groq exists as a backstop so AI Studio + Reports keep working even if the
// paid providers run out of credit. Get a free key at console.groq.com.
//
// All calls use raw fetch() to avoid SDK + edge-runtime header issues.

import type { AiKind, ConnectedAccount, AnalyticsSnapshot } from './types';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const OPENAI_BASE    = 'https://api.openai.com/v1';
const GROQ_BASE      = 'https://api.groq.com/openai/v1';

export const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
export const DEFAULT_OPENAI_MODEL    = process.env.OPENAI_MODEL    || 'gpt-4o-mini';
export const DEFAULT_GROQ_MODEL      = process.env.GROQ_MODEL      || 'llama-3.3-70b-versatile';

export interface AccountContext {
  account: Pick<ConnectedAccount, 'platform' | 'handle' | 'display_name' | 'profile_type'>;
  snapshot?: AnalyticsSnapshot | null;
  recent_top_posts?: Array<{ caption: string | null; engagement_rate: number | null; content_type: string | null }>;
}

export interface GenerateInputs {
  kind: AiKind;
  topic?: string;
  brief?: string;
  platform?: string;
  content_type?: string;
  tone?: string;
  goal?: string;
  campaign_name?: string;
  cta?: string;
  audience?: string;
  account?: AccountContext;
  extra?: Record<string, unknown>;
}

function systemPrompt(input: GenerateInputs): string {
  const a = input.account?.account;
  const snap = input.account?.snapshot;
  const top = input.account?.recent_top_posts?.slice(0, 3) || [];

  return [
    'You are Lumen, a senior marketing strategist embedded in Judith Bemnet\'s marketing intelligence platform.',
    'You write copy that is premium, executive, on-brand, and free of cliche. No filler.',
    a ? `Active account: ${a.display_name} on ${a.platform} (${a.profile_type}).` : '',
    snap ? `Latest snapshot: ${snap.followers ?? '—'} followers, ${snap.engagement_rate ?? '—'}% ER, ${snap.reach ?? '—'} reach.` : '',
    top.length ? `Top-performing recent posts:\n${top.map((p, i) => `  ${i + 1}. [${p.content_type ?? '?'} · ${p.engagement_rate ?? '—'}% ER] ${(p.caption ?? '').slice(0, 140)}`).join('\n')}` : '',
    'Always tailor output to the active account. Do NOT invent numbers — if you reference performance, only use the numbers above.',
  ].filter(Boolean).join('\n');
}

const TEMPLATES: Record<AiKind, (i: GenerateInputs) => string> = {
  ig_caption: i => `Write 3 Instagram caption options for "${i.topic ?? i.brief ?? 'this post'}".
Tone: ${i.tone ?? 'authentic, premium'}. Goal: ${i.goal ?? 'engagement'}. CTA: ${i.cta ?? 'authentic'}.
Each caption: hook line, 2-4 short paragraphs, single clear CTA, ≤6 relevant hashtags. Number them 1/2/3.`,

  li_post: i => `Write 2 LinkedIn post options for "${i.topic ?? i.brief}".
Tone: ${i.tone ?? 'executive, confident'}. Goal: ${i.goal ?? 'thought leadership'}.
Each post: contrarian or specific hook, 4-7 short lines with line breaks, end with a single question to drive comments.`,

  li_article: i => `Outline a LinkedIn article on "${i.topic ?? i.brief}".
Sections: Hook · Thesis · 3 supporting arguments with one specific example each · Counter-take · CTA.
Then draft the opening 2 paragraphs in full prose. Tone: ${i.tone ?? 'executive'}.`,

  carousel: i => `Design a 10-slide Instagram carousel for "${i.topic ?? i.brief}".
Output: SLIDE 1 (hook) through SLIDE 10 (CTA). Each slide: one-line headline + one supporting line. Goal: ${i.goal}.`,

  graphic_brief: i => `Write a designer brief for "${i.topic ?? i.brief}" on ${i.platform ?? 'Instagram'}.
Include: format & dimensions, visual direction, copy overlay, mood, CTA, export specs. Tone: ${i.tone ?? 'premium'}.`,

  hashtags: i => `Generate a hashtag set for "${i.topic ?? i.brief}" on ${i.platform ?? 'Instagram'}.
Return three groups: Core (3), Growth (5), Niche (5). One line each, no commentary.`,

  report: i => `Write an executive summary report for the active account.
Cover: Headline, What worked, What did not, What to do next, Risks. Be specific to the snapshot and top posts in the system prompt — do not invent metrics. Range: ${(i.extra?.range_start as string) ?? ''} to ${(i.extra?.range_end as string) ?? ''}.`,

  repurpose: i => `Build a repurposing plan from "${i.topic ?? i.brief}". Map 1 source piece → 8 derivative assets across IG, LinkedIn, email, and ads. Each item: one-line action.`,

  campaign_concept: i => `Develop a campaign concept for "${i.campaign_name ?? i.topic}".
Brief: ${i.brief ?? ''}. Audience: ${i.audience ?? ''}. Goal: ${i.goal ?? ''}. Platforms: ${i.platform ?? ''}.
Output: (1) one-sentence concept, (2) tagline, (3) 3 narrative pillars, (4) hero asset description, (5) success metric.`,

  workflow: () => `(removed)`,
};

// ---------- Providers ----------

async function jsonOrThrow(res: Response, label: string): Promise<any> {
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text.slice(0, 200) }; }
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.error?.type ?? json?._raw ?? `${res.status} ${res.statusText}`;
    throw new Error(`[${label}] ${res.status}: ${msg}`);
  }
  return json;
}

export async function callAnthropic(system: string, user: string, model: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 1400, system, messages: [{ role: 'user', content: user }] }),
  });
  const json = await jsonOrThrow(res, 'claude');
  const text = (json?.content ?? []).map((c: any) => (c?.type === 'text' ? c.text : '')).join('\n').trim();
  return { text, tokens_in: json?.usage?.input_tokens, tokens_out: json?.usage?.output_tokens, model: json?.model ?? model };
}

async function callOpenAICompatible(base: string, label: string, system: string, user: string, model: string, apiKey: string) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const json = await jsonOrThrow(res, label);
  const text = json?.choices?.[0]?.message?.content ?? '';
  return { text, tokens_in: json?.usage?.prompt_tokens, tokens_out: json?.usage?.completion_tokens, model: json?.model ?? model };
}

export async function callOpenAI(system: string, user: string, model: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return callOpenAICompatible(OPENAI_BASE, 'openai', system, user, model, apiKey);
}

export async function callGroq(system: string, user: string, model: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
  return callOpenAICompatible(GROQ_BASE, 'groq', system, user, model, apiKey);
}

// ---------- Public API ----------

interface ProviderAttempt { name: string; error: string }

/** Single-shot generation. Cascades through providers, returns first success. */
export async function generate(input: GenerateInputs): Promise<{ text: string; tokens_in?: number; tokens_out?: number; model: string; provider?: string; fallbacks?: ProviderAttempt[] }> {
  const prompt = TEMPLATES[input.kind](input);
  const system = systemPrompt(input);

  const providers: Array<{ name: string; enabled: boolean; run: () => Promise<{ text: string; tokens_in?: number; tokens_out?: number; model: string }> }> = [
    { name: 'anthropic', enabled: !!process.env.ANTHROPIC_API_KEY, run: () => callAnthropic(system, prompt, DEFAULT_ANTHROPIC_MODEL) },
    { name: 'openai',    enabled: !!process.env.OPENAI_API_KEY,    run: () => callOpenAI(system, prompt, DEFAULT_OPENAI_MODEL) },
    { name: 'groq',      enabled: !!process.env.GROQ_API_KEY,      run: () => callGroq(system, prompt, DEFAULT_GROQ_MODEL) },
  ];

  const enabled = providers.filter(p => p.enabled);
  if (enabled.length === 0) {
    throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY.');
  }

  const fallbacks: ProviderAttempt[] = [];
  for (const p of enabled) {
    try {
      const out = await p.run();
      return { ...out, provider: p.name, fallbacks };
    } catch (err: any) {
      fallbacks.push({ name: p.name, error: err?.message ?? String(err) });
    }
  }

  // All providers failed.
  const detail = fallbacks.map(f => `${f.name}: ${f.error}`).join(' | ');
  throw new Error(`All AI providers failed. ${detail}`);
}

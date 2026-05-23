// Single reusable Claude service. Used by:
//   - /api/ai/generate       (AI Studio)
//   - /api/reports/generate  (AI summaries on reports)
//
// Uses raw fetch() against api.anthropic.com to avoid SDK + edge-runtime
// header-stripping headaches. Same pattern as lib/apify.ts.

import type { AiKind, ConnectedAccount, AnalyticsSnapshot } from './types';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

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

/** Single-shot generation. Returns plain text. */
export async function generate(input: GenerateInputs): Promise<{ text: string; tokens_in?: number; tokens_out?: number; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const prompt = TEMPLATES[input.kind](input);
  const model = DEFAULT_MODEL;

  const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1400,
      system: systemPrompt(input),
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }

  if (!res.ok) {
    const msg = json?.error?.message ?? json?.error?.type ?? `${res.status} ${res.statusText}`;
    throw new Error(`[claudev2] Anthropic ${res.status}: ${msg}`);
  }

  const out = (json?.content ?? [])
    .map((c: any) => (c?.type === 'text' ? c.text : ''))
    .join('\n')
    .trim();

  return {
    text: out,
    tokens_in: json?.usage?.input_tokens,
    tokens_out: json?.usage?.output_tokens,
    model: json?.model ?? model,
  };
}

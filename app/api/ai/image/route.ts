// POST /api/ai/image  { prompt, aspect_ratio?, account_id? }
//
// Generates a marketing graphic via Google's Gemini image model
// ("Nano Banana" — gemini-2.5-flash-image-preview). Returns a data URL the
// browser can render + download directly. No auth — shared site.
//
// Required env var: GEMINI_API_KEY (free at aistudio.google.com/app/apikey)
// Optional: GEMINI_IMAGE_MODEL (defaults to gemini-2.5-flash-image-preview)

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: 'GEMINI_API_KEY is not configured. Get a free key at https://aistudio.google.com/app/apikey and add it as an EdgeOne env var.',
    }, { status: 500 });
  }

  const body = await req.json();
  const promptIn: string = (body.prompt ?? '').trim();
  if (!promptIn) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  const aspect: string = body.aspect_ratio ?? '1:1';
  const account_id: string | undefined = body.account_id;
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';

  // Lightly enrich the prompt so output stays on-brand.
  const stylePreamble =
    aspect === '9:16'
      ? 'Vertical 9:16 social story graphic, modern, premium, high-contrast, brand-safe.'
      : aspect === '16:9'
        ? 'Wide 16:9 banner graphic, modern, premium, brand-safe, room for overlay copy.'
        : 'Square 1:1 social post graphic, modern, premium, brand-safe, room for overlay copy.';
  const prompt = `${stylePreamble}\n\nUser brief: ${promptIn}`;

  try {
    const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], temperature: 0.9 },
      }),
    });

    const text = await res.text();
    let json: any;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text.slice(0, 300) }; }

    if (!res.ok) {
      const msg = json?.error?.message ?? json?.error?.status ?? json?._raw ?? `${res.status} ${res.statusText}`;
      return NextResponse.json({ error: `[gemini] ${res.status}: ${msg}` }, { status: 500 });
    }

    // Walk the response to find the first inline image part.
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p?.inlineData?.data);
    if (!imagePart) {
      const textOut = parts.map((p: any) => p?.text).filter(Boolean).join('\n');
      return NextResponse.json({
        error: `Gemini returned no image. Response text: ${textOut.slice(0, 200) || '(empty)'}`,
      }, { status: 500 });
    }

    const mime = imagePart.inlineData.mimeType || 'image/png';
    const b64 = imagePart.inlineData.data as string;
    const dataUrl = `data:${mime};base64,${b64}`;

    // Best-effort log to ai_outputs so it surfaces in any future history view.
    try {
      const admin = createSupabaseAdmin();
      await admin.from('ai_outputs').insert({
        user_id: null,
        account_id: account_id ?? null,
        campaign_id: null,
        kind: 'graphic_brief',
        inputs: { prompt: promptIn, aspect_ratio: aspect, model, source: 'gemini-image' },
        output: dataUrl.slice(0, 60) + '…(truncated; full image returned in HTTP response)',
        model,
        tokens_in: null,
        tokens_out: null,
        saved: false,
      });
    } catch { /* table may be unmigrated, ignore */ }

    return NextResponse.json({
      ok: true,
      image: dataUrl,
      mime,
      model,
      aspect_ratio: aspect,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'image generation failed' }, { status: 500 });
  }
}

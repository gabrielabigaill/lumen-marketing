// POST /api/ai/image  { prompt, aspect_ratio?, account_id? }
//
// Generates a marketing graphic. Tries providers in order until one succeeds:
//
//   1. Pollinations.ai (DEFAULT, no key needed, free, FLUX.1 under the hood)
//   2. Hugging Face Inference  (free if HF_TOKEN set, runs FLUX.1-schnell)
//   3. Gemini Imagen / image-preview (if GEMINI_API_KEY + a model that the
//      key can access)
//
// Returns a data URL the browser can render + download directly.
// No auth — shared site.

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface GeneratedImage { mime: string; b64: string; provider: string; model: string }

function dims(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case '9:16': return { width: 768,  height: 1344 };
    case '16:9': return { width: 1344, height: 768 };
    default:     return { width: 1024, height: 1024 };
  }
}

function stylize(promptIn: string, aspect: string): string {
  const preamble =
    aspect === '9:16'
      ? 'Vertical 9:16 social story graphic, modern, premium, high-contrast, brand-safe.'
      : aspect === '16:9'
        ? 'Wide 16:9 banner graphic, modern, premium, brand-safe, room for overlay copy.'
        : 'Square 1:1 social post graphic, modern, premium, brand-safe, room for overlay copy.';
  return `${preamble} ${promptIn}`;
}

// ----- Pollinations.ai (free, no key) -----
async function generateViaPollinations(prompt: string, aspect: string): Promise<GeneratedImage> {
  const { width, height } = dims(aspect);
  // Pollinations docs: https://image.pollinations.ai
  // ?nologo=true removes watermark, &enhance lets their LLM improve prompt
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&model=flux&enhance=true`;
  const res = await fetch(url, { headers: { 'Accept': 'image/png, image/jpeg, image/*' } });
  if (!res.ok) {
    throw new Error(`[pollinations] ${res.status}: ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') || 'image/png';
  return { mime, b64: buf.toString('base64'), provider: 'pollinations', model: 'flux.1' };
}

// ----- Hugging Face Inference (free with HF_TOKEN) -----
async function generateViaHuggingFace(prompt: string): Promise<GeneratedImage> {
  const key = process.env.HF_TOKEN;
  if (!key) throw new Error('HF_TOKEN not set');
  const model = process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell';
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'image/png' },
    body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4 } }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[huggingface] ${res.status}: ${errText.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') || 'image/png';
  return { mime, b64: buf.toString('base64'), provider: 'huggingface', model };
}

// ----- Gemini (premium fallback if user has paid access) -----
async function generateViaGemini(prompt: string): Promise<GeneratedImage> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  // Try the production image-preview model name first; older names removed.
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], temperature: 0.9 },
    }),
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text.slice(0, 200) }; }
  if (!res.ok) {
    throw new Error(`[gemini] ${res.status}: ${json?.error?.message ?? json?.error?.status ?? json?._raw ?? res.statusText}`);
  }
  const part = (json?.candidates?.[0]?.content?.parts ?? []).find((p: any) => p?.inlineData?.data);
  if (!part) throw new Error('[gemini] Response contained no inline image data');
  return { mime: part.inlineData.mimeType || 'image/png', b64: part.inlineData.data, provider: 'gemini', model };
}

export async function POST(req: Request) {
  const body = await req.json();
  const promptIn: string = (body.prompt ?? '').trim();
  if (!promptIn) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  const aspect: string = body.aspect_ratio ?? '1:1';
  const account_id: string | undefined = body.account_id;
  const prompt = stylize(promptIn, aspect);

  // Provider cascade. First success wins. Failures collected so the client
  // can see them if everything goes down.
  const attempts: Array<{ name: string; error: string }> = [];
  const order: Array<() => Promise<GeneratedImage>> = [
    () => generateViaPollinations(prompt, aspect),
  ];
  if (process.env.HF_TOKEN) order.push(() => generateViaHuggingFace(prompt));
  if (process.env.GEMINI_API_KEY) order.push(() => generateViaGemini(prompt));

  let img: GeneratedImage | null = null;
  for (const run of order) {
    try {
      img = await run();
      break;
    } catch (e: any) {
      attempts.push({ name: 'provider', error: e?.message ?? String(e) });
    }
  }
  if (!img) {
    return NextResponse.json({
      error: `All image providers failed. ${attempts.map(a => a.error).join(' | ')}`,
    }, { status: 500 });
  }

  const dataUrl = `data:${img.mime};base64,${img.b64}`;

  // Best-effort: log the generation so the user can see history.
  try {
    const admin = createSupabaseAdmin();
    await admin.from('ai_outputs').insert({
      user_id: null,
      account_id: account_id ?? null,
      campaign_id: null,
      kind: 'graphic_brief',
      inputs: { prompt: promptIn, aspect_ratio: aspect, model: img.model, source: img.provider },
      output: `(image generated via ${img.provider} / ${img.model})`,
      model: img.model,
      tokens_in: null,
      tokens_out: null,
      saved: false,
    });
  } catch { /* log table may be unmigrated, ignore */ }

  return NextResponse.json({
    ok: true,
    image: dataUrl,
    mime: img.mime,
    provider: img.provider,
    model: img.model,
    aspect_ratio: aspect,
    fallbacks: attempts,
  });
}

// POST /api/ai/image  { prompt, aspect_ratio?, account_id?, raw_prompt? }
//
// Two-step pipeline for high quality:
//
//   1. PROMPT ENHANCEMENT  — Send the user's short brief to Groq (free, fast)
//      with an art-direction system prompt that rewrites it into a detailed,
//      FLUX-ready prompt with composition, lighting, color, mood, camera, etc.
//      Skipped if `raw_prompt: true` is set in the request body.
//
//   2. IMAGE GENERATION    — Try providers in cascade until one succeeds:
//        a) Pollinations FLUX-dev    (free, no key, default)
//        b) Together AI FLUX-schnell (free tier if TOGETHER_API_KEY set)
//        c) Hugging Face FLUX-schnell (free tier if HF_TOKEN set)
//
// Returns a data URL the browser can render and download.

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

// ----- Step 1: Prompt enhancement via Groq (free, ~1s) -----

const ENHANCE_SYSTEM = `You are an expert prompt engineer for FLUX image generation, specializing in premium marketing graphics. Your job: take a brief description and rewrite it into a detailed, vivid image prompt that produces magazine-quality results.

Rules:
- Output ONLY the final prompt. No preamble, no quotes, no explanation.
- Length: 60-120 words. Concrete and visual.
- Always include: subject, composition (rule of thirds, negative space, layout), lighting (direction, quality, color temp), mood, color palette (specific hex/name pairs), style (e.g., editorial, cinematic, brutalist, soft-glow, glassmorphism), camera/lens equivalents when relevant, and any text/copy overlay zones if the brief implies a social graphic.
- If the brief mentions a social platform (LinkedIn, Instagram), tune for that platform's aesthetic.
- NEVER hallucinate specific brand names, logos, or real people.
- Prefer "premium, editorial, on-brand, modern, high-contrast" over "beautiful, stunning, masterpiece" clichés.
- End the prompt with technical quality cues: "sharp focus, professional color grading, 4K, ultra-detailed".`;

async function enhancePromptViaGroq(brief: string, aspect: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const aspectHint =
    aspect === '9:16' ? 'Vertical 9:16 social story format.' :
    aspect === '16:9' ? 'Wide 16:9 banner format.' :
    'Square 1:1 social post format.';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        max_tokens: 350,
        temperature: 0.8,
        messages: [
          { role: 'system', content: ENHANCE_SYSTEM },
          { role: 'user', content: `${aspectHint}\n\nBrief: ${brief}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json?.choices?.[0]?.message?.content ?? '').trim();
    return text || null;
  } catch {
    return null;
  }
}

// ----- Step 2: Image providers -----

// Pollinations.ai supports a small zoo of models. 'flux' is FLUX.1-dev quality.
// nofeed=true keeps it out of their public gallery; safe=false for marketing.
async function generateViaPollinations(prompt: string, aspect: string, seed?: number): Promise<GeneratedImage> {
  const { width, height } = dims(aspect);
  const params = new URLSearchParams({
    width:  String(width),
    height: String(height),
    nologo: 'true',
    nofeed: 'true',
    model:  'flux',
    enhance: 'false', // we already enhanced via Groq
    safe:   'false',
  });
  if (seed != null) params.set('seed', String(seed));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;

  const res = await fetch(url, {
    headers: { 'Accept': 'image/png, image/jpeg, image/*', 'User-Agent': 'LumenMarketing/1.0' },
  });
  if (!res.ok) {
    throw new Error(`[pollinations] ${res.status}: ${res.statusText}`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength < 1024) {
    // Likely an error response disguised as image bytes
    throw new Error(`[pollinations] response too small (${ab.byteLength} bytes), provider likely failed silently`);
  }
  const buf = Buffer.from(ab);
  const mime = res.headers.get('content-type') || 'image/png';
  return { mime, b64: buf.toString('base64'), provider: 'pollinations', model: 'flux.1-dev' };
}

// Together AI: free tier specifically includes FLUX.1-schnell-Free.
// Sign up at api.together.xyz; set TOGETHER_API_KEY.
async function generateViaTogether(prompt: string, aspect: string): Promise<GeneratedImage> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error('TOGETHER_API_KEY not set');
  const { width, height } = dims(aspect);
  const res = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.TOGETHER_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell-Free',
      prompt,
      width,
      height,
      steps: 4,
      n: 1,
      response_format: 'b64_json',
    }),
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text.slice(0, 200) }; }
  if (!res.ok) {
    throw new Error(`[together] ${res.status}: ${json?.error?.message ?? json?.error ?? json?._raw ?? res.statusText}`);
  }
  const item = json?.data?.[0];
  if (item?.b64_json) {
    return { mime: 'image/png', b64: item.b64_json, provider: 'together', model: 'flux.1-schnell-free' };
  }
  if (item?.url) {
    // Need to fetch the image bytes ourselves
    const img = await fetch(item.url);
    if (!img.ok) throw new Error(`[together] image fetch ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    return { mime: 'image/png', b64: buf.toString('base64'), provider: 'together', model: 'flux.1-schnell-free' };
  }
  throw new Error('[together] response contained no image data');
}

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

// ----- Route -----

export async function POST(req: Request) {
  const body = await req.json();
  const briefIn: string = (body.prompt ?? '').trim();
  if (!briefIn) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  const aspect: string = body.aspect_ratio ?? '1:1';
  const account_id: string | undefined = body.account_id;
  const useRawPrompt: boolean = !!body.raw_prompt;

  // Step 1: enhance unless caller opted out.
  let enhancedPrompt: string | null = null;
  if (!useRawPrompt) {
    enhancedPrompt = await enhancePromptViaGroq(briefIn, aspect);
  }
  const finalPrompt = enhancedPrompt || briefIn;

  // Step 2: cascade through image providers. Random seed per request.
  const seed = Math.floor(Math.random() * 2 ** 31);
  const attempts: Array<{ provider: string; error: string }> = [];
  const providers: Array<{ name: string; run: () => Promise<GeneratedImage> }> = [
    { name: 'pollinations', run: () => generateViaPollinations(finalPrompt, aspect, seed) },
  ];
  if (process.env.TOGETHER_API_KEY) providers.push({ name: 'together', run: () => generateViaTogether(finalPrompt, aspect) });
  if (process.env.HF_TOKEN)         providers.push({ name: 'huggingface', run: () => generateViaHuggingFace(finalPrompt) });

  let img: GeneratedImage | null = null;
  for (const p of providers) {
    try {
      img = await p.run();
      break;
    } catch (e: any) {
      attempts.push({ provider: p.name, error: e?.message ?? String(e) });
    }
  }

  if (!img) {
    return NextResponse.json({
      error: `All image providers failed. ${attempts.map(a => `${a.provider}: ${a.error}`).join(' | ')}`,
      enhanced_prompt: enhancedPrompt,
    }, { status: 500 });
  }

  const dataUrl = `data:${img.mime};base64,${img.b64}`;

  // Best-effort log
  try {
    const admin = createSupabaseAdmin();
    await admin.from('ai_outputs').insert({
      user_id: null,
      account_id: account_id ?? null,
      campaign_id: null,
      kind: 'graphic_brief',
      inputs: { brief: briefIn, enhanced_prompt: enhancedPrompt, aspect_ratio: aspect, model: img.model, source: img.provider, seed },
      output: `(image generated via ${img.provider} / ${img.model})`,
      model: img.model,
      tokens_in: null,
      tokens_out: null,
      saved: false,
    });
  } catch { /* table may be unmigrated */ }

  return NextResponse.json({
    ok: true,
    image: dataUrl,
    mime: img.mime,
    provider: img.provider,
    model: img.model,
    aspect_ratio: aspect,
    enhanced_prompt: enhancedPrompt,
    seed,
    fallbacks: attempts,
  });
}

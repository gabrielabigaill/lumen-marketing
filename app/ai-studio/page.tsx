'use client';
// AI Studio — text generators (Claude/OpenAI/Groq cascade) + Graphic generator
// (Gemini "Nano Banana" image model). Account-aware. Strong visual cue for
// the currently-selected tool.

import { useState } from 'react';
import { useActiveAccount } from '@/components/useActiveAccount';
import type { AiKind } from '@/lib/types';

type ToolKind = AiKind | 'graphic_image';

const TOOLS: Array<{ kind: ToolKind; title: string; desc: string; emoji: string; group: 'text' | 'image' }> = [
  { kind: 'li_article',    title: 'LinkedIn Article',     desc: 'Long-form outline + opening prose.',    emoji: '📰', group: 'text'  },
  { kind: 'li_post',       title: 'LinkedIn Post',        desc: '2 short options w/ hooks.',             emoji: '💼', group: 'text'  },
  { kind: 'ig_caption',    title: 'Instagram Caption',    desc: '3 options + hashtags.',                 emoji: '📷', group: 'text'  },
  { kind: 'carousel',      title: 'Carousel (10 slides)', desc: 'Slide-by-slide structure.',             emoji: '🎠', group: 'text'  },
  { kind: 'graphic_brief', title: 'Graphic Brief',        desc: 'Designer-ready creative brief.',        emoji: '🎨', group: 'text'  },
  { kind: 'hashtags',      title: 'Hashtag Set',          desc: 'Core / Growth / Niche groups.',         emoji: '#',  group: 'text'  },
  { kind: 'repurpose',     title: 'Repurposing Plan',     desc: '1 piece → 8 derivatives.',              emoji: '♻️', group: 'text'  },
  { kind: 'graphic_image', title: 'Graphic Generator',    desc: 'Generate a downloadable image (Gemini).', emoji: '🖼️', group: 'image' },
];

export default function AiStudioPage() {
  const { id, account } = useActiveAccount();
  const [kind, setKind] = useState<ToolKind>('li_article');

  // Text inputs (shared)
  const [topic, setTopic] = useState('');
  const [brief, setBrief] = useState('');
  const [tone, setTone] = useState('Executive');
  const [platform, setPlatform] = useState('LinkedIn');
  const [content_type, setContentType] = useState('Long-form');
  const [goal, setGoal] = useState('Build authority');
  const [cta, setCta] = useState('');

  // Text output
  const [output, setOutput] = useState('');
  const [outputId, setOutputId] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Image output
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageErr, setImageErr] = useState<string | null>(null);
  const [aspect, setAspect] = useState<'1:1' | '9:16' | '16:9'>('1:1');

  const tool = TOOLS.find(t => t.kind === kind)!;
  const isImageTool = tool.group === 'image';

  async function generateText(save = false) {
    setLoading(true); setErr(null); setOutput(''); setProvider(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, account_id: id, topic, brief, tone, platform, content_type, goal, cta, save }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI request failed');
      setOutput(data.output);
      setOutputId(data.id ?? null);
      setProvider(data.provider ?? null);
    } catch (e: any) { setErr(e?.message ?? 'AI request failed'); }
    finally { setLoading(false); }
  }

  async function generateImage() {
    setImageBusy(true); setImageErr(null); setImageUrl(null);
    try {
      const promptText = (topic || brief || '').trim();
      if (!promptText) throw new Error('Add a topic or brief first.');
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, aspect_ratio: aspect, account_id: id }),
      });
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        const body = await res.text();
        throw new Error(`Server returned non-JSON (${res.status}). Preview: ${body.slice(0, 160)}`);
      }
      const data = await res.json();
      if (!res.ok || !data.image) throw new Error(data.error ?? 'Image generation failed');
      setImageUrl(data.image);
    } catch (e: any) { setImageErr(e?.message ?? 'Image generation failed'); }
    finally { setImageBusy(false); }
  }

  function downloadImage() {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `lumen-graphic-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function addToCalendar() {
    if (!id || !output) return;
    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: id,
        title: topic || brief?.slice(0, 60) || 'AI-generated content',
        platform: platform.toLowerCase(),
        content_type: content_type.toLowerCase(),
        caption: output,
        cta,
        scheduled_for: new Date(Date.now() + 24 * 3600e3).toISOString(),
        status: 'draft',
        source: 'ai_studio',
      }),
    });
    alert('Added to your content calendar.');
  }

  if (!id || !account) return <div className="p-6 text-soft text-sm">Choose an account.</div>;

  return (
    <section className="px-4 lg:px-7 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">AI Studio</h1>
        <p className="text-sm text-soft">Grounded in {account.display_name}'s real data — top posts and latest snapshot are added to every prompt.</p>
      </div>

      {/* Tool tiles with strong selected-state */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TOOLS.map(t => {
          const selected = kind === t.kind;
          const isImg = t.group === 'image';
          return (
            <button
              key={t.kind}
              onClick={() => setKind(t.kind)}
              aria-pressed={selected}
              className={`relative text-left rounded-2xl border p-4 transition-all duration-200 ${
                selected
                  ? 'bg-gradient-to-br from-brand/10 via-brand-2/10 to-pink/10 border-brand glow-ring -translate-y-0.5'
                  : 'bg-elev border-line hover:border-brand/40 hover:-translate-y-0.5'
              }`}
            >
              {selected && (
                <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  Active
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl text-white grid place-items-center text-lg mb-2 shadow-soft ${
                isImg
                  ? 'bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600'
                  : 'bg-gradient-to-br from-brand to-brand-2'
              }`}>
                {t.emoji}
              </div>
              <div className={`font-semibold text-sm ${selected ? 'text-brand' : ''}`}>{t.title}</div>
              <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{t.desc}</p>
              {isImg && (
                <span className="absolute bottom-2.5 right-2.5 text-[9px] uppercase tracking-wider font-bold text-amber-500">
                  Gemini
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!isImageTool ? (
        // ---------------- Text generation UI ----------------
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold text-sm mb-3">Inputs · <span className="text-brand">{tool.title}</span></h3>
            <div className="space-y-3">
              <div><label className="field-label">Topic / Brief</label>
                <textarea className="textarea" value={topic} onChange={e => setTopic(e.target.value)} placeholder="What's the post about?" />
              </div>
              <div><label className="field-label">Deeper context (optional)</label>
                <textarea className="textarea" value={brief} onChange={e => setBrief(e.target.value)} placeholder="Background, audience pain, evidence to cite…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Platform</label>
                  <select className="select" value={platform} onChange={e => setPlatform(e.target.value)}>
                    <option>LinkedIn</option><option>Instagram</option><option>Both</option>
                  </select></div>
                <div><label className="field-label">Tone</label>
                  <select className="select" value={tone} onChange={e => setTone(e.target.value)}>
                    <option>Executive</option><option>Friendly</option><option>Bold</option><option>Inspirational</option><option>Educational</option>
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Content type</label>
                  <select className="select" value={content_type} onChange={e => setContentType(e.target.value)}>
                    <option>Long-form</option><option>Short post</option><option>Carousel</option><option>Reel</option><option>Story</option>
                  </select></div>
                <div><label className="field-label">Goal</label>
                  <select className="select" value={goal} onChange={e => setGoal(e.target.value)}>
                    <option>Build authority</option><option>Drive engagement</option><option>Generate leads</option><option>Grow followers</option><option>Educate audience</option>
                  </select></div>
              </div>
              <div><label className="field-label">CTA</label>
                <input className="input" value={cta} onChange={e => setCta(e.target.value)} placeholder="Single, clear call to action" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => generateText(false)} disabled={loading} className="btn btn-primary flex-1 justify-center">{loading ? 'Generating…' : '✨ Generate'}</button>
                <button onClick={() => generateText(false)} disabled={loading} className="btn">🔁 Regenerate</button>
                <button onClick={() => { setOutput(''); setOutputId(null); }} className="btn btn-danger">Clear</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Generated output {provider && <span className="text-[10px] text-muted font-normal ml-1">via {provider}</span>}</h3>
              <div className="flex gap-2">
                <button onClick={() => navigator.clipboard.writeText(output)} disabled={!output} className="btn btn-sm">Copy</button>
                <button onClick={addToCalendar} disabled={!output} className="btn btn-sm">Add to Calendar</button>
                <button onClick={() => generateText(true)} disabled={!output} className="btn btn-sm btn-primary">Save</button>
              </div>
            </div>
            {err && <p className="text-xs text-danger mb-2">{err}</p>}
            <div className={`output-box bg-bg border ${output ? 'border-line' : 'border-dashed border-line'} rounded-xl p-4 min-h-[260px] text-sm whitespace-pre-wrap leading-relaxed`}>
              {output || <span className="text-muted">Your generated content will appear here. Try a topic, pick a tone, and click Generate.</span>}
            </div>
            {outputId && <p className="text-[10px] text-muted mt-2">Saved as ai_outputs.{outputId.slice(0, 8)}</p>}
          </div>
        </div>
      ) : (
        // ---------------- Graphic generator UI ----------------
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold text-sm mb-3">Inputs · <span className="text-brand">{tool.title}</span></h3>
            <p className="text-[11px] text-muted mb-3 leading-relaxed">
              Describe the graphic in plain English. Be specific about subject, mood, color, and what overlay copy you want. The image returns as PNG you can download and finish in Canva/Figma.
            </p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Prompt</label>
                <textarea
                  className="textarea"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Premium dark-mode hero graphic for an Instagram post about ‘5 mistakes founders make on LinkedIn’. Magenta + amber accents, abstract waveform, leave the top third empty for text overlay."
                  rows={4}
                />
              </div>
              <div>
                <label className="field-label">Aspect ratio</label>
                <div className="inline-flex gap-2">
                  {(['1:1', '9:16', '16:9'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setAspect(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        aspect === r ? 'bg-brand text-white border-brand' : 'border-line text-soft hover:border-brand/40'
                      }`}
                    >
                      {r === '1:1' ? '1:1 · Post' : r === '9:16' ? '9:16 · Story' : '16:9 · Banner'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={generateImage} disabled={imageBusy} className="btn btn-primary flex-1 justify-center">
                  {imageBusy ? 'Asking Gemini…' : '✨ Generate graphic'}
                </button>
                <button onClick={() => { setImageUrl(null); setImageErr(null); }} className="btn btn-danger">Clear</button>
              </div>
              <p className="text-[10px] text-muted">
                Needs <code className="bg-bg px-1 rounded">GEMINI_API_KEY</code> set in EdgeOne. Free at{' '}
                <a className="text-brand underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
                  aistudio.google.com/app/apikey
                </a>.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Generated graphic</h3>
              <div className="flex gap-2">
                <button onClick={downloadImage} disabled={!imageUrl} className="btn btn-sm btn-primary">⬇ Download PNG</button>
              </div>
            </div>
            {imageErr && <p className="text-xs text-danger mb-2">{imageErr}</p>}
            <div className={`bg-bg border rounded-xl p-3 min-h-[280px] grid place-items-center ${imageUrl ? 'border-line' : 'border-dashed border-line'}`}>
              {imageBusy ? (
                <div className="text-center text-sm text-soft">
                  <div className="inline-block w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin mb-2" />
                  <p>Generating image… (usually 5-15 seconds)</p>
                </div>
              ) : imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Generated graphic" className="max-h-[480px] rounded-lg shadow-pop" />
              ) : (
                <span className="text-muted text-sm">Your generated graphic will appear here.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

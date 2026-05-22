'use client';
// AI Studio — reusable Claude generator. Account-aware. Save / Regenerate / Add to Calendar.
import { useState } from 'react';
import { useActiveAccount } from '@/components/useActiveAccount';
import type { AiKind } from '@/lib/types';

const TOOLS: Array<{ kind: AiKind; title: string; desc: string; emoji: string }> = [
  { kind: 'li_article',       title: 'LinkedIn Article',     desc: 'Long-form outline + opening prose.',    emoji: '💼' },
  { kind: 'li_post',          title: 'LinkedIn Post',        desc: '2 short options w/ hooks.',             emoji: '📝' },
  { kind: 'ig_caption',       title: 'Instagram Caption',    desc: '3 options + hashtags.',                 emoji: '📷' },
  { kind: 'carousel',         title: 'Carousel (10 slides)', desc: 'Slide-by-slide structure.',             emoji: '🎠' },
  { kind: 'graphic_brief',    title: 'Graphic Brief',        desc: 'Designer-ready brief.',                 emoji: '🎨' },
  { kind: 'hashtags',         title: 'Hashtag Set',          desc: 'Core / Growth / Niche groups.',         emoji: '#'  },
  { kind: 'repurpose',        title: 'Repurposing Plan',     desc: '1 piece → 8 derivatives.',              emoji: '♻️' },
];

export default function AiStudioPage() {
  const { id, account } = useActiveAccount();
  const [kind, setKind] = useState<AiKind>('li_article');
  const [topic, setTopic] = useState('');
  const [brief, setBrief] = useState('');
  const [tone, setTone] = useState('Executive');
  const [platform, setPlatform] = useState('LinkedIn');
  const [content_type, setContentType] = useState('Long-form');
  const [goal, setGoal] = useState('Build authority');
  const [cta, setCta] = useState('');

  const [output, setOutput] = useState('');
  const [outputId, setOutputId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate(save = false) {
    setLoading(true); setErr(null); setOutput('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, account_id: id, topic, brief, tone, platform, content_type, goal, cta, save }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI request failed');
      setOutput(data.output);
      setOutputId(data.id);
    } catch (e: any) { setErr(e?.message ?? 'AI request failed'); }
    finally { setLoading(false); }
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TOOLS.map(t => (
          <button key={t.kind} onClick={() => setKind(t.kind)} className={`card text-left transition-all ${kind === t.kind ? 'border-brand bg-brand/5' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand to-brand-2 text-white grid place-items-center mb-2">{t.emoji}</div>
            <div className="font-semibold text-sm">{t.title}</div>
            <p className="text-[11px] text-muted mt-0.5">{t.desc}</p>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-sm mb-3">Inputs</h3>
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
              <button onClick={() => generate(false)} disabled={loading} className="btn btn-primary flex-1 justify-center">{loading ? 'Generating…' : '✨ Generate'}</button>
              <button onClick={() => generate(false)} disabled={loading} className="btn">🔁 Regenerate</button>
              <button onClick={() => { setOutput(''); setOutputId(null); }} className="btn btn-danger">Clear</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Generated output</h3>
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard.writeText(output)} disabled={!output} className="btn btn-sm btn-ghost">Copy</button>
              <button onClick={addToCalendar} disabled={!output} className="btn btn-sm">Add to Calendar</button>
              <button onClick={() => generate(true)} disabled={!output} className="btn btn-sm btn-primary">Save</button>
            </div>
          </div>
          {err && <p className="text-xs text-danger mb-2">{err}</p>}
          <div className={`output-box bg-bg border ${output ? 'border-line' : 'border-dashed border-line'} rounded-xl p-4 min-h-[260px] text-sm whitespace-pre-wrap leading-relaxed`}>
            {output || <span className="text-muted">Your generated content will appear here. Try a topic, pick a tone, and click Generate.</span>}
          </div>
          {outputId && <p className="text-[10px] text-muted mt-2">Saved as ai_outputs.{outputId.slice(0, 8)}</p>}
        </div>
      </div>
    </section>
  );
}

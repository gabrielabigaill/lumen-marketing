'use client';
import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [brandVoice, setBrandVoice] = useState({ tone: 'Executive · Confident · Insightful', words_use: '', words_avoid: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sb = createSupabaseBrowser();
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function save() {
    const sb = createSupabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return alert('Sign in first to save settings.');
    await sb.from('users').update({ brand_voice: brandVoice }).eq('id', user.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <section className="px-4 lg:px-7 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Settings</h1>
        <p className="text-sm text-soft">Account, brand voice, and integrations.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="font-semibold text-sm">Profile</h3>
          <div><label className="field-label">Email</label><input className="input" value={email ?? 'Not signed in'} readOnly /></div>
          <p className="text-[11px] text-muted">Supabase auth is wired but sign-in UI is intentionally minimal — add a magic-link page once you're ready.</p>
        </div>

        <div className="card space-y-3">
          <h3 className="font-semibold text-sm">Brand voice (used by Claude)</h3>
          <div><label className="field-label">Tone profile</label>
            <select className="select" value={brandVoice.tone} onChange={e => setBrandVoice(v => ({...v, tone: e.target.value}))}>
              <option>Executive · Confident · Insightful</option>
              <option>Friendly · Warm · Approachable</option>
              <option>Bold · Provocative · Punchy</option>
            </select></div>
          <div><label className="field-label">Words we use</label><input className="input" value={brandVoice.words_use} onChange={e => setBrandVoice(v => ({...v, words_use: e.target.value}))} placeholder="Comma-separated keywords on-brand for this account" /></div>
          <div><label className="field-label">Words we avoid</label><input className="input" value={brandVoice.words_avoid} onChange={e => setBrandVoice(v => ({...v, words_avoid: e.target.value}))} placeholder="Comma-separated keywords to keep out of generations" /></div>
          <button onClick={save} className="btn btn-primary">{saved ? 'Saved ✓' : 'Save'}</button>
        </div>

        <div className="card space-y-2">
          <h3 className="font-semibold text-sm">Integrations</h3>
          <Row name="Apify"     status="env" hint="APIFY_TOKEN required" />
          <Row name="Supabase"  status="env" hint="NEXT_PUBLIC_SUPABASE_URL + keys" />
          <Row name="Anthropic Claude" status="env" hint="ANTHROPIC_API_KEY" />
          <Row name="Meta / IG Graph" status="future" hint="Reserved for direct IG Graph API" />
          <Row name="LinkedIn API" status="future" hint="Reserved for LinkedIn Marketing API" />
        </div>

        <div className="card space-y-2">
          <h3 className="font-semibold text-sm">Notifications</h3>
          <p className="text-[11px] text-muted">Recurring tasks (weekly digest, 30-day calendar refresh) live in <code className="text-xs bg-bg px-1.5 py-0.5 rounded">scheduled_tasks</code> — wire to your cron/Edge Function once deployed.</p>
        </div>
      </div>
    </section>
  );
}

function Row({ name, status, hint }: { name: string; status: 'env' | 'future' | 'live'; hint: string }) {
  const pill = status === 'live' ? 'pill-green' : status === 'env' ? 'pill-amber' : 'pill-gray';
  const label = status === 'live' ? 'Live' : status === 'env' ? 'Configure in env' : 'Future';
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <div><div className="font-semibold">{name}</div><div className="text-[11px] text-muted">{hint}</div></div>
      <span className={`pill ${pill}`}>{label}</span>
    </div>
  );
}

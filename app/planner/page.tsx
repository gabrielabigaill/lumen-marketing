'use client';
// Content Planner — Account-scoped, two views (Month / Week), full CRUD.
//
// For @happilyjuju and @judithbemnet on Instagram, exposes a "Generate daily
// story slots" action that pre-creates editable story entries for every day
// in the current view that doesn't yet have a story scheduled.

import { useEffect, useMemo, useState } from 'react';
import { useActiveAccount } from '@/components/useActiveAccount';

interface Item {
  id: string;
  title: string;
  platform: string;
  content_type: string | null;
  caption: string | null;
  cta: string | null;
  notes: string | null;
  scheduled_for: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published';
  campaign_id: string | null;
  source: string;
}

type ViewMode = 'month' | 'week';

const STATUSES = ['draft', 'pending_approval', 'approved', 'scheduled', 'published'] as const;
const STATUS_COLOR: Record<string, string> = {
  draft: 'pill-gray',
  pending_approval: 'pill-amber',
  approved: 'pill-blue',
  scheduled: 'pill-blue',
  published: 'pill-green',
};

// Accounts that get the "daily story slots" affordance.
const STORY_ELIGIBLE = new Set(['instagram:happilyjuju', 'instagram:judithbemnet']);

export default function PlannerPage() {
  const { id, account } = useActiveAccount();
  const [view, setView] = useState<ViewMode>('month');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [winStart, setWinStart] = useState<Date | null>(null);
  const [winEnd, setWinEnd] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [busy, setBusy] = useState(false);

  const accountKey = account ? `${account.platform}:${account.handle.toLowerCase()}` : '';
  const storyEligible = STORY_ELIGIBLE.has(accountKey);

  // Resolve the time window for the current view + offset.
  useEffect(() => {
    if (!id) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const step = view === 'week' ? 7 : 30;
    const start = new Date(today); start.setDate(today.getDate() + offset * step);
    const end = new Date(start); end.setDate(start.getDate() + step);
    setWinStart(start);
    setWinEnd(end);
  }, [id, view, offset]);

  async function load() {
    if (!id || !winStart || !winEnd) return;
    setLoading(true);
    try {
      // The /api/calendar route accepts ?accountId=…&offset= (30-day units).
      // For week view we fetch the surrounding month window and filter client-side
      // so navigating week-by-week doesn't waste API calls.
      const monthOffset = view === 'week' ? Math.floor(offset / (30 / 7)) : offset;
      const r = await fetch(`/api/calendar?accountId=${id}&offset=${monthOffset}`);
      const d = await r.json();
      const all: Item[] = d.items ?? [];
      const filtered = view === 'week'
        ? all.filter(i => {
            if (!i.scheduled_for) return false;
            const t = new Date(i.scheduled_for).getTime();
            return t >= winStart.getTime() && t < winEnd.getTime();
          })
        : all;
      setItems(filtered);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, winStart?.getTime(), winEnd?.getTime(), view]);

  function openNew() {
    setEditing({
      title: '',
      platform: account?.platform ?? 'instagram',
      content_type: 'image',
      status: 'draft',
      scheduled_for: new Date().toISOString(),
    });
  }

  async function save(it: Partial<Item>) {
    if (!id) return;
    if (it.id) {
      await fetch('/api/calendar', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it) });
    } else {
      await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...it, account_id: id }) });
    }
    setEditing(null);
    load();
  }

  async function del(itemId: string) {
    if (!confirm('Delete this content item?')) return;
    await fetch('/api/calendar', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: itemId }) });
    load();
  }

  async function generateStorySlots() {
    if (!id || !winStart || !winEnd || !storyEligible) return;
    setBusy(true);
    try {
      // Find days already covered by a story so we don't double-create.
      const existing = new Set<string>();
      items.forEach(i => {
        if (i.content_type === 'story' && i.scheduled_for) {
          existing.add(new Date(i.scheduled_for).toISOString().slice(0, 10));
        }
      });

      const rows: Partial<Item>[] = [];
      const cur = new Date(winStart);
      while (cur < winEnd) {
        const key = cur.toISOString().slice(0, 10);
        if (!existing.has(key)) {
          // Default to 09:00 local time so morning stories aren't missed.
          const at = new Date(cur); at.setHours(9, 0, 0, 0);
          rows.push({
            title: `Daily story — ${account?.display_name}`,
            platform: 'instagram',
            content_type: 'story',
            caption: '',
            cta: '',
            scheduled_for: at.toISOString(),
            status: 'draft',
            source: 'manual',
          });
        }
        cur.setDate(cur.getDate() + 1);
      }

      if (rows.length === 0) {
        alert('Every day in the current view already has a story slot.');
        return;
      }

      // The POST endpoint accepts an array of items.
      await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows.map(r => ({ ...r, account_id: id }))),
      });
      await load();
    } finally { setBusy(false); }
  }

  // Build the calendar grid cells for the current view.
  const days = useMemo(() => {
    if (!winStart || !winEnd) return [] as Date[];
    if (view === 'week') {
      const out: Date[] = [];
      const cur = new Date(winStart);
      for (let i = 0; i < 7; i++) {
        out.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return out;
    }
    // Month view — pad to Sunday-start grid.
    const pad = winStart.getDay();
    const out: Date[] = [];
    for (let i = pad; i > 0; i--) {
      const d = new Date(winStart); d.setDate(winStart.getDate() - i); out.push(d);
    }
    const cur = new Date(winStart);
    while (cur < winEnd) { out.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    while (out.length % 7) {
      const d = new Date(out[out.length - 1]); d.setDate(d.getDate() + 1); out.push(d);
    }
    return out;
  }, [winStart?.getTime(), winEnd?.getTime(), view]);

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    items.forEach(i => {
      const key = i.scheduled_for ? new Date(i.scheduled_for).toISOString().slice(0, 10) : '__';
      const list = m.get(key) ?? [];
      list.push(i);
      m.set(key, list);
    });
    return m;
  }, [items]);

  if (!id || !account) {
    return <div className="p-6 text-soft text-sm">Choose an account to view the planner.</div>;
  }

  const rangeLabel = winStart && winEnd
    ? `${winStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(winEnd.getTime() - 86400e3).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : '';

  return (
    <section className="px-4 lg:px-7 py-6 lg:py-8 space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Content Planner · {account.display_name}</h1>
          <p className="text-sm text-soft">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="inline-flex rounded-xl border border-line overflow-hidden">
            <button
              onClick={() => { setView('month'); setOffset(0); }}
              className={`px-3 py-2 text-sm font-semibold ${view === 'month' ? 'bg-brand text-white' : 'bg-elev text-soft hover:bg-bg'}`}
            >Month</button>
            <button
              onClick={() => { setView('week'); setOffset(0); }}
              className={`px-3 py-2 text-sm font-semibold ${view === 'week' ? 'bg-brand text-white' : 'bg-elev text-soft hover:bg-bg'}`}
            >Week</button>
          </div>

          <button className="btn btn-sm" onClick={() => setOffset(o => o - 1)}>← Previous {view === 'week' ? 'week' : '30 days'}</button>
          <button className="btn btn-sm" onClick={() => setOffset(0)}>Today</button>
          <button className="btn btn-sm" onClick={() => setOffset(o => o + 1)}>Next {view === 'week' ? 'week' : '30 days'} →</button>

          {storyEligible && (
            <button onClick={generateStorySlots} disabled={busy} className="btn btn-sm" title="Adds a daily story slot for every day in this view that doesn't already have one.">
              {busy ? 'Generating…' : '+ Daily story slots'}
            </button>
          )}
          <button className="btn btn-primary" onClick={openNew}>+ Add item</button>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex gap-2 text-xs flex-wrap text-soft">
        {STATUSES.map(s => <span key={s} className={`pill ${STATUS_COLOR[s]}`}>{s.replace('_', ' ')}</span>)}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="card text-center text-sm text-muted py-10">Loading planner…</div>
      ) : (
        <div className={`grid gap-2 card ${view === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(h => (
            <div key={h} className="text-[11px] font-semibold text-muted uppercase text-center">{h}</div>
          ))}
          {days.map((d, idx) => {
            const key = d.toISOString().slice(0, 10);
            const dayItems = byDay.get(key) ?? [];
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const isToday = key === today.toISOString().slice(0, 10);
            const inWindow = winStart && winEnd ? d >= winStart && d < winEnd : true;
            const cap = view === 'week' ? Infinity : 3;
            return (
              <div
                key={`${key}-${idx}`}
                className={`bg-bg rounded-lg p-2 flex flex-col gap-1 ${view === 'week' ? 'min-h-[240px]' : 'min-h-[110px]'} ${!inWindow ? 'opacity-40' : ''}`}
              >
                <div className={`text-xs font-semibold ${isToday ? 'text-brand' : 'text-soft'}`}>
                  {d.getDate()}
                  {view === 'week' && <span className="ml-1 text-muted font-normal">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>}
                </div>
                {dayItems.slice(0, cap as number).map(i => {
                  const isStory = i.content_type === 'story';
                  return (
                    <button
                      key={i.id}
                      onClick={() => setEditing(i)}
                      className={`text-left text-[11px] px-1.5 py-1 rounded border-l-2 truncate ${
                        i.platform === 'linkedin'
                          ? 'border-accent bg-accent/10'
                          : isStory
                            ? 'border-pink bg-pink/5'
                            : 'border-pink bg-pink/10'
                      }`}
                      title={i.title}
                    >
                      {isStory ? '🟣 ' : ''}{i.title}
                    </button>
                  );
                })}
                {dayItems.length > (cap as number) && (
                  <div className="text-[10px] text-muted">+{dayItems.length - (cap as number)} more</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Items in this {view} ({items.length})</h3>
        <ul className="divide-y divide-line">
          {items.map(i => (
            <li key={i.id} className="py-2.5 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">{i.title}</div>
                <div className="text-[11px] text-muted flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className="capitalize">{i.platform}</span> ·
                  <span>{i.content_type ?? '—'}</span> ·
                  <span>{i.scheduled_for ? new Date(i.scheduled_for).toLocaleString() : 'unscheduled'}</span>
                  <span className={`pill ${STATUS_COLOR[i.status]}`}>{i.status.replace('_', ' ')}</span>
                  {i.source !== 'manual' && <span className="pill pill-gray">{i.source}</span>}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setEditing(i)}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={() => del(i.id)}>Delete</button>
            </li>
          ))}
          {items.length === 0 && <p className="text-sm text-muted text-center py-6">No items in this window yet.</p>}
        </ul>
      </div>

      {editing && <Modal item={editing} onCancel={() => setEditing(null)} onSave={save} platform={account.platform} />}
    </section>
  );
}

function Modal({ item, onCancel, onSave, platform }: { item: Partial<Item>; onCancel: () => void; onSave: (i: Partial<Item>) => void; platform: string; }) {
  const [draft, setDraft] = useState(item);
  const set = (k: keyof Item, v: any) => setDraft(d => ({ ...d, [k]: v }));
  const isStory = draft.content_type === 'story';

  return (
    <div className="fixed inset-0 bg-ink/60 z-40 grid place-items-center p-4" onClick={onCancel}>
      <div className="bg-elev rounded-2xl w-full max-w-xl border border-line shadow-pop max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <h3 className="font-semibold">{item.id ? (isStory ? 'Edit story slot' : 'Edit item') : 'New content item'}</h3>
          <button onClick={onCancel} className="text-muted">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="field-label">Title</label><input className="input" value={draft.title ?? ''} onChange={e => set('title', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Platform</label>
              <select className="select" value={draft.platform ?? platform} onChange={e => set('platform', e.target.value)}>
                <option value="instagram">Instagram</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
            <div><label className="field-label">Content type</label>
              <select className="select" value={draft.content_type ?? 'image'} onChange={e => set('content_type', e.target.value)}>
                <option value="image">Image</option>
                <option value="carousel">Carousel</option>
                <option value="reel">Reel</option>
                <option value="story">Story</option>
                <option value="article">Article</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Scheduled for</label>
              <input type="datetime-local" className="input"
                value={draft.scheduled_for ? new Date(draft.scheduled_for).toISOString().slice(0, 16) : ''}
                onChange={e => set('scheduled_for', e.target.value ? new Date(e.target.value).toISOString() : null)} />
            </div>
            <div><label className="field-label">Status</label>
              <select className="select" value={draft.status ?? 'draft'} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div><label className="field-label">{isStory ? 'Story copy / talking points' : 'Caption'}</label>
            <textarea className="textarea" value={draft.caption ?? ''} onChange={e => set('caption', e.target.value)} />
          </div>
          <div><label className="field-label">CTA</label>
            <input className="input" value={draft.cta ?? ''} onChange={e => set('cta', e.target.value)} />
          </div>
          <div><label className="field-label">Notes</label>
            <textarea className="textarea" value={draft.notes ?? ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onCancel} className="btn">Cancel</button>
          <button onClick={() => onSave(draft)} className="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  );
}

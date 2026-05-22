'use client';
// Connect / Sync button for an account.
//
// Sync runs in two phases because EdgeOne kills any single function at 30s
// but an Apify Instagram scrape takes 30-90s:
//   1. POST /api/apify/sync    → starts the run(s), returns sync_id (~3s)
//   2. POST /api/apify/finalize → poll every 10s; when run(s) complete, it
//      fetches the dataset and upserts to Supabase. Final response includes
//      the record count.

import { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'starting' | 'polling' | 'done' | 'error';

export default function ConnectAccountState({ accountId, handle, platform, status, lastSyncedAt, onSynced }: {
  accountId: string;
  handle: string;
  platform: string;
  status: string;
  lastSyncedAt: string | null;
  onSynced?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling if the component unmounts.
  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  async function jsonOrThrow(res: Response, fallback = 'Request failed') {
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      const body = await res.text();
      const preview = body.slice(0, 160).replace(/\s+/g, ' ');
      throw new Error(`Server returned non-JSON (${res.status}). Preview: ${preview}`);
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `${fallback} (${res.status})`);
    return data;
  }

  function stopPolling() {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }

  async function pollOnce(plan: any) {
    try {
      const res = await fetch('/api/apify/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, plan }),
      });
      const data = await jsonOrThrow(res, 'Poll failed');
      if (data.status === 'running') {
        setProgress('Apify is still scraping…');
        return;
      }
      stopPolling();
      if (data.status === 'succeeded') {
        setPhase('done');
        setProgress(`Synced ${data.records ?? 0} posts.`);
        onSynced?.();
      } else {
        setPhase('error');
        setError(data.error ?? 'Sync failed');
      }
    } catch (e: any) {
      stopPolling();
      setPhase('error');
      setError(e?.message ?? 'Poll failed');
    }
  }

  async function sync() {
    setPhase('starting');
    setError(null);
    setProgress('Starting Apify run…');
    try {
      const res = await fetch('/api/apify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      });
      const data = await jsonOrThrow(res, 'Sync failed');
      const plan = data.plan;
      if (!plan) throw new Error('Sync started but no plan was returned by the server.');
      setPhase('polling');
      setProgress('Apify is scraping. This usually takes 30–90 seconds…');

      // Kick the first poll after 8s, then every 10s.
      setTimeout(() => pollOnce(plan), 8000);
      pollTimer.current = setInterval(() => pollOnce(plan), 10000);
    } catch (e: any) {
      setPhase('error');
      setError(e?.message ?? 'Sync failed');
    }
  }

  // --- Rendering ---

  const isBusy = phase === 'starting' || phase === 'polling' || status === 'syncing';

  if (isBusy) {
    return (
      <div className="card text-center py-10">
        <div className="text-soft text-sm">
          Pulling live data from Apify for <strong className="text-ink">{platform === 'linkedin' ? handle : '@' + handle}</strong>…
        </div>
        <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          {progress || 'This usually takes 30–90 seconds.'}
        </div>
      </div>
    );
  }

  if (phase === 'error' || status === 'error') {
    return (
      <div className="card text-center py-8 border-danger/30">
        <div className="text-danger font-semibold text-sm">Sync failed</div>
        <p className="text-xs text-muted mt-1 max-w-md mx-auto">{error ?? 'Unknown error.'}</p>
        <button onClick={sync} className="btn btn-primary mt-4">Retry sync</button>
      </div>
    );
  }

  if (phase === 'done' || status === 'connected') {
    return (
      <div className="text-xs text-muted">
        {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleString()}.` : (progress || 'Connected.')}
        <button onClick={sync} className="ml-2 text-brand font-semibold hover:underline">Refresh</button>
      </div>
    );
  }

  // Default: needs connection
  return (
    <div className="card text-center py-10">
      <div className="font-semibold">No data yet for this account</div>
      <p className="text-xs text-muted mt-1">Run an Apify sync to fetch real follower count, posts, and engagement.</p>
      <button onClick={sync} className="btn btn-primary mt-4">Connect & sync now</button>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

'use client';
import { useState } from 'react';

export default function ConnectAccountState({ accountId, handle, platform, status, lastSyncedAt, onSynced }: {
  accountId: string;
  handle: string;
  platform: string;
  status: string;
  lastSyncedAt: string | null;
  onSynced?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/apify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      onSynced?.();
    } catch (e: any) { setError(e?.message ?? 'Sync failed'); }
    finally { setBusy(false); }
  }

  if (status === 'syncing' || busy) {
    return (
      <div className="card text-center py-10">
        <div className="text-soft text-sm">Pulling live data from Apify for <strong className="text-ink">{platform === 'linkedin' ? handle : '@' + handle}</strong>…</div>
        <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse"/>
          This usually takes 30–90 seconds.
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="card text-center py-10 border-danger/30">
        <div className="text-danger font-semibold text-sm">Last sync failed</div>
        <p className="text-xs text-muted mt-1">{error ?? 'Unknown error.'}</p>
        <button onClick={sync} className="btn btn-primary mt-4">Retry sync</button>
      </div>
    );
  }

  if (status === 'needs_connection') {
    return (
      <div className="card text-center py-10">
        <div className="font-semibold">No data yet for this account</div>
        <p className="text-xs text-muted mt-1">Run an Apify sync to fetch real follower count, posts, and engagement.</p>
        <button onClick={sync} className="btn btn-primary mt-4">Connect & sync now</button>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="text-xs text-muted">
      {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleString()}.` : ''}
      <button onClick={sync} className="ml-2 text-brand font-semibold hover:underline">Refresh</button>
    </div>
  );
}

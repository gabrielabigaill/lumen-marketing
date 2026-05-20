'use client';
// Connections — manage Apify sync state per account.
import { useEffect, useState } from 'react';
import ConnectAccountState from '@/components/ConnectAccountState';

interface Acct {
  id: string; platform: string; handle: string; display_name: string;
  profile_type: string; status: string; last_synced_at: string | null;
}

export default function ConnectionsPage() {
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const d = await fetch('/api/accounts').then(r => r.json());
    setAccounts(d.accounts ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <section className="px-4 lg:px-7 py-6 lg:py-8 space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Connections</h1>
        <p className="text-sm text-soft">Connect each account to Apify. Once connected, all dashboards, reports, and AI prompts use real data.</p>
      </div>

      {loading ? <div className="text-sm text-muted">Loading…</div> : (
        <div className="grid md:grid-cols-2 gap-4">
          {accounts.map(a => (
            <div key={a.id} className="card space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{a.display_name}</div>
                  <div className="text-[11px] text-muted capitalize">{a.platform} · {a.profile_type}</div>
                </div>
                <span className={`pill ${a.status === 'connected' ? 'pill-green' : a.status === 'error' ? 'pill-red' : a.status === 'syncing' ? 'pill-amber' : 'pill-gray'}`}>
                  {a.status.replace('_',' ')}
                </span>
              </div>
              <ConnectAccountState
                accountId={a.id}
                handle={a.handle}
                platform={a.platform}
                status={a.status}
                lastSyncedAt={a.last_synced_at}
                onSynced={load}
              />
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold text-sm mb-2">How it works</h3>
        <ol className="list-decimal pl-5 text-sm text-soft space-y-1.5">
          <li>Click "Connect & sync now" → backend calls <code className="text-xs bg-bg px-1.5 py-0.5 rounded">/api/apify/sync</code></li>
          <li>The route runs the configured Apify actor (Instagram or LinkedIn) for that handle.</li>
          <li>Results are normalized → upserted into <code className="text-xs bg-bg px-1.5 py-0.5 rounded">analytics_snapshots</code> + <code className="text-xs bg-bg px-1.5 py-0.5 rounded">posts</code> in Supabase.</li>
          <li>Every page (Dashboard / Analytics / Reports / AI Studio) reads from Supabase — no dummy data.</li>
        </ol>
      </div>
    </section>
  );
}

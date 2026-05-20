'use client';
// Account selection — the entry point.
// Until Supabase auth is wired the API falls back to ACCOUNT_SEEDS, which lets
// this screen render usefully even on a fresh deploy with no DB rows.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveAccountId } from '@/lib/store';

interface Acct {
  id: string;
  platform: 'instagram' | 'linkedin' | string;
  handle: string;
  display_name: string;
  profile_type: string;
  status: string;
  last_synced_at: string | null;
}

const accent: Record<string, string> = {
  'instagram:happilyjuju': 'from-pink-500 to-amber-400',
  'instagram:judithbemnet': 'from-violet-500 to-indigo-500',
  'instagram:mas.osx': 'from-emerald-500 to-cyan-500',
  'linkedin:judithbemnet': 'from-sky-500 to-blue-700',
};

export default function AccountSelectPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(false);

  useEffect(() => {
    fetch('/api/accounts').then(r => r.json()).then(d => {
      setAccounts(d.accounts ?? []);
      setAuth(!!d.authenticated);
    }).finally(() => setLoading(false));
  }, []);

  function pick(id: string) {
    setActiveAccountId(id);
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Which account would you like to check today?</h1>
          <p className="text-soft mt-3 max-w-2xl mx-auto">Pick one to load the dashboard, analytics, planner, and AI Studio for that account. Switch any time from the top bar.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="card h-44 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map(a => {
              const key = `${a.platform}:${a.handle.toLowerCase()}`;
              const grad = accent[key] ?? 'from-slate-500 to-slate-700';
              const connected = a.status === 'connected';
              return (
                <button
                  key={a.id}
                  onClick={() => pick(a.id)}
                  className="card text-left group hover:border-brand transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${grad} grid place-items-center text-white text-xl font-bold shadow-soft shrink-0`}>
                      {a.platform === 'linkedin' ? 'in' : a.handle.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{a.display_name}</h3>
                        <span className={`pill ${connected ? 'pill-green' : 'pill-gray'}`}>
                          {connected ? '● Connected' : '○ Needs connection'}
                        </span>
                      </div>
                      <p className="text-xs text-muted capitalize mt-0.5">{a.platform}</p>
                      <p className="text-xs text-soft mt-2">{a.profile_type}</p>
                      <p className="text-[11px] text-muted mt-3">
                        {a.last_synced_at ? `Last synced ${new Date(a.last_synced_at).toLocaleString()}` : 'No sync yet — run from Connections.'}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-muted group-hover:text-brand transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!auth && !loading && (
          <p className="text-xs text-muted text-center mt-8">
            You're browsing as a guest — sign in to persist your account selections and sync real data.
          </p>
        )}
      </div>
    </main>
  );
}

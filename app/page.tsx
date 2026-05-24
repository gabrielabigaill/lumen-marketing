'use client';
// Account selection — the entry point. No sign-in required.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveAccountId } from '@/lib/store';
import AccountAvatar from '@/components/AccountAvatar';
import { LogoMark } from '@/components/Logo';

interface Acct {
  id: string;
  platform: 'instagram' | 'linkedin' | string;
  handle: string;
  display_name: string;
  profile_type: string;
  status: string;
  profile_pic_url?: string | null;
  followers_cache?: number | null;
  last_synced_at: string | null;
}

const accent: Record<string, string> = {
  'instagram:happilyjuju': 'from-pink-500 to-amber-400',
  'instagram:judithbemnet': 'from-violet-500 to-indigo-500',
  'instagram:mas.osx': 'from-emerald-500 to-cyan-500',
  'linkedin:judithbemnet': 'from-sky-500 to-blue-700',
};

function fmtFollowers(n: number | null | undefined) {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default function AccountSelectPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/accounts').then(r => r.json()).then(d => {
      setAccounts(d.accounts ?? []);
    }).finally(() => setLoading(false));
  }, []);

  function pick(id: string) {
    setActiveAccountId(id);
    router.push('/dashboard');
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Ambient background — slow drifting gradient blobs */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <div className="flex flex-col items-center px-6 py-12 lg:py-16">
        <div className="w-full max-w-5xl">
          <div className="text-center mb-10 fade-up">
            <div className="inline-flex items-center justify-center mb-5">
              <LogoMark size={56} />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              Which account would you like to check today?
            </h1>
            <p className="text-soft mt-3 max-w-2xl mx-auto">
              Pick one to load the dashboard, analytics, planner, and AI Studio for that account. Switch any time from the top bar.
            </p>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="card h-44 animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((a, i) => {
                const key = `${a.platform}:${a.handle.toLowerCase()}`;
                const grad = accent[key] ?? 'from-slate-500 to-slate-700';
                const connected = a.status === 'connected';
                const followers = fmtFollowers(a.followers_cache);
                const fallback = a.platform === 'linkedin' ? 'in' : a.handle.charAt(0).toUpperCase();
                return (
                  <button
                    key={a.id}
                    onClick={() => pick(a.id)}
                    className="card text-left group hover:border-brand transition-all hover:-translate-y-0.5 hover:shadow-pop fade-up"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="flex items-start gap-4">
                      <AccountAvatar
                        src={a.profile_pic_url}
                        alt={a.display_name}
                        fallback={fallback}
                        gradient={grad}
                        size={56}
                      />
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
                          {followers
                            ? `${followers} followers · ${a.last_synced_at ? `synced ${new Date(a.last_synced_at).toLocaleString()}` : 'no sync yet'}`
                            : (a.last_synced_at ? `Last synced ${new Date(a.last_synced_at).toLocaleString()}` : 'No sync yet — run from Connections.')}
                        </p>
                      </div>
                      <svg className="w-5 h-5 text-muted group-hover:text-brand group-hover:translate-x-1 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getActiveAccountId, setActiveAccountId, onAccountChange, clearActiveAccount } from '@/lib/store';

const NAV = [
  { href: '/', label: 'Account Select', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { href: '/dashboard', label: 'Dashboard', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { href: '/analytics', label: 'Analytics', icon: 'M18 20V10M12 20V4M6 20v-6' },
  { href: '/planner', label: 'Content Planner', icon: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18' },
  { href: '/ai-studio', label: 'AI Studio', icon: 'M12 2l2.4 4.84L19.7 8l-3.9 3.77.9 5.32L12 14.77 7.2 17.1l.9-5.32L4.3 8l5.3-1.16L12 2z' },
  { href: '/reports', label: 'Reports', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6' },
  { href: '/connections', label: 'Connections', icon: 'M9 12a3 3 0 1 1 6 0M3 12a9 9 0 0 1 18 0M3 12a9 9 0 1 0 18 0' },
  { href: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
];

interface Acct {
  id: string; platform: string; handle: string; display_name: string; profile_type: string; status: string;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setActive(getActiveAccountId());
    fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d.accounts ?? []));
    return onAccountChange(id => setActive(id));
  }, []);

  useEffect(() => {
    // Guard: if no active account, send back to /
    if (active === null && path !== '/' && typeof window !== 'undefined') {
      const stored = getActiveAccountId();
      if (!stored) router.replace('/');
    }
  }, [active, path, router]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('lumen.theme', next ? 'dark' : 'light'); } catch {}
  }

  const activeAcct = accounts.find(a => a.id === active);

  return (
    <div className="min-h-screen grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar */}
      <aside className={`fixed lg:sticky inset-y-0 left-0 z-30 w-64 lg:w-auto bg-elev border-r border-line p-4 flex flex-col gap-4 transition-transform ${mobileNav ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Link href="/" className="flex items-center gap-2 px-2 py-1 mb-2" onClick={() => setMobileNav(false)}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-brand-2 grid place-items-center text-white font-bold">L</div>
          <div>
            <div className="font-bold text-base leading-tight">Lumen</div>
            <div className="text-[11px] text-muted">Marketing Intelligence</div>
          </div>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => {
            const activeNav = path === item.href || (item.href !== '/' && path.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNav(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeNav ? 'bg-brand/10 text-brand' : 'text-soft hover:bg-bg hover:text-ink'
                }`}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon}/>
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-3 border-t border-line flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-orange-500 grid place-items-center text-white font-bold text-sm">JB</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Judith B.</div>
            <div className="text-[11px] text-muted truncate">Owner</div>
          </div>
        </div>
      </aside>

      {mobileNav && <div onClick={() => setMobileNav(false)} className="fixed inset-0 bg-ink/40 z-20 lg:hidden" />}

      <div className="min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-line px-4 lg:px-7 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={() => setMobileNav(true)} className="lg:hidden btn btn-sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>

          {/* Account switcher */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0">
            {accounts.map(a => (
              <button
                key={a.id}
                onClick={() => setActiveAccountId(a.id)}
                className={`btn btn-sm whitespace-nowrap ${active === a.id ? 'btn-primary' : ''}`}
                title={a.profile_type}
              >
                <span className="text-[10px] uppercase opacity-80 mr-1">{a.platform === 'linkedin' ? 'in' : 'IG'}</span>
                {a.display_name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="btn btn-sm" aria-label="Theme">
              {dark
                ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
                : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>}
            </button>
            <button onClick={() => { clearActiveAccount(); router.push('/'); }} className="btn btn-sm">Switch account</button>
          </div>
        </header>

        {activeAcct && (
          <div className="px-4 lg:px-7 py-2 border-b border-line text-xs text-muted flex items-center gap-2 flex-wrap">
            <span>Active:</span>
            <span className="text-ink font-semibold">{activeAcct.display_name}</span>
            <span>·</span>
            <span>{activeAcct.profile_type}</span>
            <span className={`pill ml-2 ${activeAcct.status === 'connected' ? 'pill-green' : activeAcct.status === 'error' ? 'pill-red' : 'pill-gray'}`}>
              {activeAcct.status.replace('_', ' ')}
            </span>
          </div>
        )}

        <main>{children}</main>
      </div>
    </div>
  );
}

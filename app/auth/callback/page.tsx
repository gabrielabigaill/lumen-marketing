'use client';
// Magic-link callback — runs entirely in the browser so EdgeOne serves it
// as a static page (no SSR worker prefix leaking into the URL).
//
// Reads ?code=… from the magic-link redirect, exchanges it for a session
// via the browser Supabase client (which sets the auth cookies on this
// origin), then routes the user onward.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Splash status="Loading…" />}>
      <CallbackInner />
    </Suspense>
  );
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState('Signing you in…');

  useEffect(() => {
    const code = params.get('code');
    const next = params.get('next') || '/';
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

    if (!code) {
      router.replace('/sign-in?error=missing_code');
      return;
    }

    const sb = createSupabaseBrowser();
    sb.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setStatus(`Sign-in failed: ${error.message}`);
        const msg = encodeURIComponent(error.message);
        setTimeout(() => router.replace(`/sign-in?error=${msg}`), 1500);
        return;
      }
      setStatus('Signed in. Redirecting…');
      router.replace(safeNext);
    }).catch(err => {
      setStatus(`Sign-in failed: ${err?.message ?? 'unknown error'}`);
      setTimeout(() => router.replace('/sign-in?error=exchange_failed'), 1500);
    });
  }, [params, router]);

  return <Splash status={status} />;
}

function Splash({ status }: { status: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-2 items-center justify-center text-white text-xl font-bold shadow-soft mb-4">
          L
        </div>
        <p className="text-sm text-soft">{status}</p>
      </div>
    </main>
  );
}

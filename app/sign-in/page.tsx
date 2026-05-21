'use client';
// Magic-link sign-in. We use Supabase's signInWithOtp with PKCE — the email
// contains a link to /auth/callback?code=… which exchanges the code for a
// session cookie. Design matches the account-select screen on /.

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function SignInPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md card h-40 animate-pulse" />
      </main>
    }>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setMessage(null);

    const sb = createSupabaseBrowser();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
      return;
    }
    setStatus('sent');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-2 items-center justify-center text-white text-xl font-bold shadow-soft mb-4">
            L
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Sign in to Lumen</h1>
          <p className="text-soft mt-2 text-sm">
            Enter your email and we'll send you a one-time sign-in link — no password needed.
          </p>
        </div>

        <div className="card">
          {status === 'sent' ? (
            <div className="text-center py-4">
              <div className="inline-flex w-12 h-12 rounded-full bg-success/10 items-center justify-center mb-4">
                <svg className="w-6 h-6 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="font-semibold text-base">Check your inbox</h2>
              <p className="text-sm text-soft mt-2">
                We sent a magic link to <span className="font-medium text-ink">{email}</span>.
                Click it to finish signing in.
              </p>
              <p className="text-xs text-muted mt-4">
                Didn't get it? Check your spam folder, or{' '}
                <button
                  type="button"
                  onClick={() => { setStatus('idle'); setMessage(null); }}
                  className="text-brand font-semibold hover:underline"
                >
                  try a different email
                </button>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="field-label">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={status === 'sending'}
                  className="input"
                />
              </div>

              {status === 'error' && message && (
                <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">{message}</p>
              )}

              <button
                type="submit"
                disabled={status === 'sending' || !email}
                className="btn btn-primary w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === 'sending' ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Sending link…
                  </>
                ) : (
                  <>
                    Send magic link
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-muted text-center mt-6">
          By continuing, you agree to Lumen's terms of service. Need to{' '}
          <Link href="/" className="text-brand font-semibold hover:underline">browse as a guest</Link>{' '}
          instead?
        </p>
      </div>
    </main>
  );
}

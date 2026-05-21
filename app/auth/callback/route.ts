// GET /auth/callback?code=…&next=/
// The magic-link email lands here. We exchange the PKCE code for a session
// (Supabase sets the auth cookies on the response) and redirect onward.
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';

  // Always redirect through the request origin so cookies land on the right host
  // in preview / prod deploys (don't trust NEXT_PUBLIC_APP_URL here).
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const sb = createSupabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);

  if (error) {
    const msg = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/sign-in?error=${msg}`);
  }

  // Avoid open-redirects: only allow same-origin relative paths.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(`${origin}${safeNext}`);
}

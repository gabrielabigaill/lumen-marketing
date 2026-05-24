// GET /api/proxy-image?url=<absolute-url>
//
// Proxies remote images (Instagram CDN, LinkedIn, etc.) through our own
// domain so they bypass hot-linking / referrer blocks. Used by the account
// selector cards to display real profile photos.
//
// Defensive defaults:
//   - Only fetches absolute http(s) URLs
//   - Returns the upstream bytes as-is with the same Content-Type
//   - Sets a sane cache to avoid hammering the source CDN

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const ALLOWED_HOSTS = [
  'cdninstagram.com',
  'fbcdn.net',
  'fbsbx.com',
  'instagram.com',
  'licdn.com',
  'linkedin.com',
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get('url');
  if (!target) return NextResponse.json({ error: 'url required' }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(target); } catch { return NextResponse.json({ error: 'invalid url' }, { status: 400 }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'unsupported protocol' }, { status: 400 });
  }

  const hostOk = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  if (!hostOk) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        // Pretend to be a normal browser so Instagram's CDN doesn't reject us
        'User-Agent': 'Mozilla/5.0 (compatible; LumenMarketing/1.0)',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
      },
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    }
    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': contentType,
        // Cache aggressively at the edge; the source URL is essentially permanent
        // for the duration of an Instagram CDN signature (~hours).
        'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'proxy failed' }, { status: 502 });
  }
}

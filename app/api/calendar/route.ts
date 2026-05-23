// /api/calendar — rolling 30-day content planner. No auth — shared across devices.
//   GET     ?accountId=…&offset=0   (offset in 30-day windows; 0 = today→+30d)
//   POST    body: { account_id, title, ... }   create (accepts array too)
//   PATCH   body: { id, ... }                  update one item
//   DELETE  body: { id }                       delete one item

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function windowFor(offset: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offset * 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(req: Request) {
  const admin = createSupabaseAdmin();
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const offset = Number(url.searchParams.get('offset') ?? 0);
  const { start, end } = windowFor(offset);

  const { data, error } = await admin
    .from('content_calendar')
    .select('*')
    .eq('account_id', accountId)
    .gte('scheduled_for', start)
    .lt('scheduled_for', end)
    .order('scheduled_for', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ window: { start, end, offset }, items: data });
}

export async function POST(req: Request) {
  const admin = createSupabaseAdmin();
  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];
  const rows = items.map(b => ({
    user_id: null,
    account_id: b.account_id,
    campaign_id: b.campaign_id ?? null,
    title: b.title,
    platform: b.platform,
    content_type: b.content_type ?? null,
    caption: b.caption ?? null,
    cta: b.cta ?? null,
    notes: b.notes ?? null,
    scheduled_for: b.scheduled_for ?? null,
    status: b.status ?? 'draft',
    source: b.source ?? 'manual',
  }));
  const { data, error } = await admin.from('content_calendar').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function PATCH(req: Request) {
  const admin = createSupabaseAdmin();
  const body = await req.json();
  const { id, ...patch } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await admin.from('content_calendar')
    .update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const admin = createSupabaseAdmin();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await admin.from('content_calendar').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

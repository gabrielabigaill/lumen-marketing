-- ────────────────────────────────────────────────────────────────
-- Lumen Marketing Intelligence — initial schema
-- Run in Supabase SQL editor, or via `supabase db push`.
-- ────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- USERS ─────────────────────────────────────────────────────────
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  brand_voice jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CONNECTED ACCOUNTS ────────────────────────────────────────────
create table if not exists public.connected_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null check (platform in ('instagram','linkedin','tiktok','twitter','facebook')),
  handle text not null,
  display_name text,
  profile_type text,
  status text not null default 'needs_connection'
    check (status in ('needs_connection','connecting','connected','error','syncing')),
  apify_dataset_id text,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, handle)
);
create index if not exists idx_connected_accounts_user on public.connected_accounts(user_id);

-- ACCOUNT SYNCS ─────────────────────────────────────────────────
create table if not exists public.account_syncs (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  source text not null check (source in ('apify','instagram_graph','linkedin_api','manual')),
  actor_id text,
  run_id text,
  status text not null check (status in ('queued','running','succeeded','failed')),
  records_in int default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_account_syncs_account on public.account_syncs(account_id, started_at desc);

-- ANALYTICS SNAPSHOTS ───────────────────────────────────────────
create table if not exists public.analytics_snapshots (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  snapshot_date date not null,
  followers int,
  following int,
  posts_count int,
  reach int,
  impressions int,
  engagement_rate numeric(6,3),
  profile_views int,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, snapshot_date)
);
create index if not exists idx_snapshots_account_date on public.analytics_snapshots(account_id, snapshot_date desc);

-- POSTS ─────────────────────────────────────────────────────────
create table if not exists public.posts (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  external_id text,
  url text,
  posted_at timestamptz,
  content_type text,
  caption text,
  likes int default 0,
  comments int default 0,
  shares int default 0,
  saves int default 0,
  reach int default 0,
  impressions int default 0,
  engagement_rate numeric(6,3),
  thumbnail_url text,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, external_id)
);
create index if not exists idx_posts_account_posted on public.posts(account_id, posted_at desc);

-- CAMPAIGNS ─────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete set null,
  name text not null,
  brief text,
  goal text,
  audience text,
  platforms text[] default '{}',
  tone text,
  offer text,
  cta text,
  notes text,
  starts_on date,
  ends_on date,
  posting_frequency text,
  status text not null default 'draft'
    check (status in ('draft','active','paused','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_campaigns_user on public.campaigns(user_id, status);

-- CONTENT CALENDAR ──────────────────────────────────────────────
create table if not exists public.content_calendar (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  title text not null,
  platform text not null,
  content_type text,
  caption text,
  cta text,
  notes text,
  scheduled_for timestamptz,
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','scheduled','published')),
  source text default 'manual'
    check (source in ('manual','workflow','ai_studio','recurring_task')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_calendar_account_date on public.content_calendar(account_id, scheduled_for);
create index if not exists idx_calendar_campaign on public.content_calendar(campaign_id);

-- AI OUTPUTS ────────────────────────────────────────────────────
create table if not exists public.ai_outputs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  kind text not null,
  inputs jsonb not null default '{}'::jsonb,
  output text not null,
  model text,
  tokens_in int,
  tokens_out int,
  saved boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_outputs_user_kind on public.ai_outputs(user_id, kind, created_at desc);

-- WORKFLOW RUNS ─────────────────────────────────────────────────
create table if not exists public.workflow_runs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  account_id uuid references public.connected_accounts(id) on delete set null,
  inputs jsonb not null,
  outputs jsonb,
  steps jsonb default '[]'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','cancelled')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  error text
);
create index if not exists idx_workflow_runs_user on public.workflow_runs(user_id, started_at desc);

-- REPORTS ───────────────────────────────────────────────────────
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  kind text not null check (kind in ('weekly','monthly','campaign','content','recommendation')),
  range_start date not null,
  range_end date not null,
  data jsonb not null default '{}'::jsonb,
  ai_summary text,
  created_at timestamptz not null default now()
);
create index if not exists idx_reports_user on public.reports(user_id, created_at desc);

-- SCHEDULED TASKS ───────────────────────────────────────────────
create table if not exists public.scheduled_tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.connected_accounts(id) on delete cascade,
  kind text not null,
  cadence text not null,
  config jsonb default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  enabled boolean default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_scheduled_tasks_next on public.scheduled_tasks(next_run_at) where enabled = true;

-- RLS ───────────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.connected_accounts enable row level security;
alter table public.account_syncs enable row level security;
alter table public.analytics_snapshots enable row level security;
alter table public.posts enable row level security;
alter table public.campaigns enable row level security;
alter table public.content_calendar enable row level security;
alter table public.ai_outputs enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.reports enable row level security;
alter table public.scheduled_tasks enable row level security;

create policy "users self read" on public.users for select using (auth.uid() = id);
create policy "users self update" on public.users for update using (auth.uid() = id);

create policy "ca self all" on public.connected_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.is_my_account(acc uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from public.connected_accounts where id = acc and user_id = auth.uid());
$$;

create policy "account_syncs my account" on public.account_syncs
  for all using (public.is_my_account(account_id)) with check (public.is_my_account(account_id));
create policy "snapshots my account" on public.analytics_snapshots
  for all using (public.is_my_account(account_id)) with check (public.is_my_account(account_id));
create policy "posts my account" on public.posts
  for all using (public.is_my_account(account_id)) with check (public.is_my_account(account_id));
create policy "campaigns mine" on public.campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "calendar mine" on public.content_calendar
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_outputs mine" on public.ai_outputs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workflow_runs mine" on public.workflow_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reports mine" on public.reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scheduled_tasks mine" on public.scheduled_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-seed Judith's four accounts on first auth.users insert.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;

  insert into public.connected_accounts (user_id, platform, handle, display_name, profile_type, status)
  values
    (new.id, 'instagram', 'happilyjuju',   '@happilyjuju',   'Personal / Creator',            'needs_connection'),
    (new.id, 'instagram', 'judithbemnet',  '@Judithbemnet',  'Professional / Personal Brand', 'needs_connection'),
    (new.id, 'instagram', 'mas.osx',       '@mas.osx',       'Brand / SaaS / Carnival Tech',  'needs_connection'),
    (new.id, 'linkedin',  'judithbemnet',  'judithbemnet',   'Professional LinkedIn Profile', 'needs_connection')
  on conflict (user_id, platform, handle) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

do $$
declare t text;
begin
  for t in select unnest(array['users','connected_accounts','campaigns','content_calendar'])
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function public.touch_updated_at();', t, t);
  end loop;
end$$;

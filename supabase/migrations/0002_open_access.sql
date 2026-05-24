-- 0002_open_access.sql
--
-- Two goals:
--   1. Allow the four canonical accounts to be visible/editable by anyone
--      (so the dashboard is shareable across devices and people).
--   2. Add profile_pic_url + followers_cache columns so the account selector
--      can render real Instagram/LinkedIn profile photos and follower counts.
--
-- RUN THIS ONCE in Supabase SQL Editor.

------------------------------------------------------------
-- 1. Schema additions
------------------------------------------------------------

ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS profile_pic_url text,
  ADD COLUMN IF NOT EXISTS followers_cache integer;

-- user_id was originally NOT NULL on several tables. Now that data is shared
-- across devices/users, drop that constraint where it exists.
DO $$
BEGIN
  -- connected_accounts.user_id may be NOT NULL
  BEGIN
    ALTER TABLE public.connected_accounts ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;

  -- ai_outputs.user_id may be NOT NULL
  BEGIN
    ALTER TABLE public.ai_outputs ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;

  -- reports.user_id may be NOT NULL
  BEGIN
    ALTER TABLE public.reports ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;

  -- content_calendar.user_id may be NOT NULL
  BEGIN
    ALTER TABLE public.content_calendar ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL; END;
END $$;

------------------------------------------------------------
-- 2. RLS — open the dashboard up for shared/anonymous use.
--    Service-role bypasses RLS anyway (and that's what every API route uses
--    now), but if you ever browse Supabase directly you'll want these too.
------------------------------------------------------------

-- A small helper to wipe + recreate "anyone can read/write" policies.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'connected_accounts',
    'analytics_snapshots',
    'posts',
    'account_syncs',
    'ai_outputs',
    'reports',
    'content_calendar'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    -- Drop old per-user policies if they exist
    EXECUTE format('DROP POLICY IF EXISTS "select_own_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "insert_own_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "update_own_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "delete_own_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "open_read_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "open_write_%s" ON public.%I;', t, t);

    -- Anyone (including the anon role) can read + write. The site is shared.
    EXECUTE format(
      'CREATE POLICY "open_read_%s" ON public.%I FOR SELECT USING (true);', t, t
    );
    EXECUTE format(
      'CREATE POLICY "open_write_%s" ON public.%I FOR ALL USING (true) WITH CHECK (true);', t, t
    );
  END LOOP;
END $$;

------------------------------------------------------------
-- 3. Make sure the 4 canonical accounts exist (insert if missing).
--    Using WHERE NOT EXISTS instead of ON CONFLICT so we don't need a unique
--    constraint on (platform, handle). Existing rows are left alone — their
--    real synced data + UUID stay intact.
------------------------------------------------------------

INSERT INTO public.connected_accounts (user_id, platform, handle, display_name, profile_type, status)
SELECT NULL, 'instagram', 'happilyjuju', '@happilyjuju', 'Personal / Creator', 'needs_connection'
WHERE NOT EXISTS (
  SELECT 1 FROM public.connected_accounts WHERE platform = 'instagram' AND lower(handle) = 'happilyjuju'
);

INSERT INTO public.connected_accounts (user_id, platform, handle, display_name, profile_type, status)
SELECT NULL, 'instagram', 'judithbemnet', '@Judithbemnet', 'Professional / Personal Brand', 'needs_connection'
WHERE NOT EXISTS (
  SELECT 1 FROM public.connected_accounts WHERE platform = 'instagram' AND lower(handle) = 'judithbemnet'
);

INSERT INTO public.connected_accounts (user_id, platform, handle, display_name, profile_type, status)
SELECT NULL, 'instagram', 'mas.osx', '@mas.osx', 'Brand / SaaS / Carnival Tech', 'needs_connection'
WHERE NOT EXISTS (
  SELECT 1 FROM public.connected_accounts WHERE platform = 'instagram' AND lower(handle) = 'mas.osx'
);

INSERT INTO public.connected_accounts (user_id, platform, handle, display_name, profile_type, status)
SELECT NULL, 'linkedin', 'judithbemnet', 'judithbemnet', 'Professional LinkedIn Profile', 'needs_connection'
WHERE NOT EXISTS (
  SELECT 1 FROM public.connected_accounts WHERE platform = 'linkedin' AND lower(handle) = 'judithbemnet'
);

------------------------------------------------------------
-- 4. De-duplicate: if you previously had per-user rows, keep only the most
--    recently-synced row per (platform, handle). Safe to re-run.
------------------------------------------------------------

WITH ranked AS (
  SELECT
    id,
    platform,
    lower(handle) AS h,
    ROW_NUMBER() OVER (
      PARTITION BY platform, lower(handle)
      ORDER BY last_synced_at DESC NULLS LAST, created_at DESC NULLS LAST, id ASC
    ) AS rn
  FROM public.connected_accounts
)
DELETE FROM public.connected_accounts
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

------------------------------------------------------------
-- Done. After running this you can hard-refresh the deployed site; the
-- account cards will populate from the DB and the next Apify sync will
-- write profile photos + follower counts back here.
------------------------------------------------------------

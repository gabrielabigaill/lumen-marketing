# Lumen — Marketing Intelligence Platform

A deployable Next.js 14 (App Router) app that runs on Tencent EdgeOne Pages, pulls real social data through Apify, persists everything to Supabase, and uses the Anthropic Claude API for the AI Studio and report summaries.

Manages four accounts (3 Instagram + 1 LinkedIn) with a unified executive dashboard, content planner with month/week views, AI Studio, and reports.

---

## Quick start (local)

```bash
cp .env.example .env.local
# Fill in Supabase, Apify, Anthropic keys

npm install
npm run dev
```

App boots on http://localhost:3000. Root route is the account selection screen.

---

## Deploy to EdgeOne Pages — fixing the failed build

The previous deploy failed with two errors. Here's why and how to fix:

### 1. `npm error code EUSAGE — npm ci requires a package-lock.json`

`npm ci` is strict — it refuses to run without a lockfile. The repo doesn't have one yet. **Two fixes:**

**Option A (recommended).** Generate the lockfile locally and commit it:
```bash
cd lumen-marketing
npm install
git add package-lock.json
git commit -m "Add package-lock.json"
git push
```

**Option B.** This repo's `edgeone.json` no longer references install/build commands (they live in the EdgeOne dashboard now). In the EdgeOne project settings, set:
- **Install command:** `npm install`  (not `npm ci`)

Once a lockfile is committed you can switch back to `npm ci` for faster reproducible installs.

### 2. `[cli] No server-handler detected, generating routes.json for pure project`

This means EdgeOne treated the repo as a static site and never detected Next.js. The cause is almost always: **the Next.js project is in a subfolder** (`lumen-marketing/`) but EdgeOne is looking at the repo root, which has no `package.json` or `next.config.mjs`.

**Two fixes — pick one:**

**Option A (cleanest).** Move the contents of `lumen-marketing/` to the repo root so the layout becomes:
```
Marketing-Dashboard/         ← repo root
├── package.json
├── next.config.mjs
├── app/
├── components/
├── lib/
├── supabase/
└── ...
```
Then push.

**Option B.** Keep the subfolder, but in EdgeOne **Project Settings → Build & Deploy → Root Directory**, set the value to `lumen-marketing`. EdgeOne will then run the build from inside that subfolder.

### EdgeOne Pages — Project Settings cheat sheet

In the EdgeOne console under your project's **Build & Deploy** settings:

| Setting | Value |
| --- | --- |
| Framework Preset | `Next.js` (or "Other" if it doesn't auto-detect, then specify the command/output below) |
| Root Directory | `/` (Option A above) **or** `lumen-marketing` (Option B above) |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Node Version | `18` |

Under **Environment Variables**, add every key from `.env.example` with your real values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APIFY_TOKEN`
- `APIFY_ACTOR_INSTAGRAM_PROFILE` (default: `apify/instagram-profile-scraper`)
- `APIFY_ACTOR_INSTAGRAM_POSTS` (default: `apify/instagram-post-scraper`)
- `APIFY_ACTOR_LINKEDIN_PROFILE` (default: `apify/linkedin-profile-scraper`)
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (default: `claude-sonnet-4-6`)

Then trigger a redeploy. The build log should show Next.js being detected (no more "pure project / no server-handler" warning).

### `edgeone.json`

The file checked into the repo only configures headers (cache rules for `/_next/static/*` and `/api/*`). That matches EdgeOne's actual schema — `edgeone.json` is NOT where you put build commands or env vars.

---

## What's in the app

| Surface | File |
| --- | --- |
| Account selection (entry point) | `app/page.tsx` |
| Sidebar + topbar account switcher | `components/Shell.tsx` |
| Dashboard (compact, above-the-fold) | `app/(app)/dashboard/page.tsx` |
| Analytics | `app/(app)/analytics/page.tsx` |
| Content Planner (Month/Week views, story slots) | `app/(app)/planner/page.tsx` |
| AI Studio (reusable Claude generator) | `app/(app)/ai-studio/page.tsx` |
| Reports | `app/(app)/reports/page.tsx` |
| Connections (Apify sync) | `app/(app)/connections/page.tsx` |
| Settings | `app/(app)/settings/page.tsx` |
| Accounts API | `app/api/accounts/route.ts` |
| Apify sync API | `app/api/apify/sync/route.ts` |
| Analytics API | `app/api/analytics/[accountId]/route.ts` |
| Calendar API (CRUD) | `app/api/calendar/route.ts` |
| AI generate (Claude) | `app/api/ai/generate/route.ts` |
| Reports generate (Claude) | `app/api/reports/generate/route.ts` |
| Apify service | `lib/apify.ts` |
| Claude AI service | `lib/ai.ts` |
| Supabase clients | `lib/supabase/{client,server}.ts` |
| Active-account store | `lib/store.ts` |
| DB schema | `supabase/migrations/0001_initial.sql` |

### Content Planner — Month & Week views

The planner now supports two views:

- **Month** — rolling 30-day window from today. Previous/Next buttons jump 30 days.
- **Week** — 7-day window from today. Previous/Next jump 7 days. Toggle between views with the Month/Week pills.

For `@happilyjuju` and `@Judithbemnet` (Instagram only), the planner shows a **"+ Daily story slots"** button. Clicking it creates an editable story entry (`content_type = 'story'`) for every day in the current view that doesn't already have one. Default time is 09:00 — click any slot to edit time, caption, status, etc.

### Account-aware
Active account ID lives in `localStorage` (`lib/store.ts`) and is broadcast via a `lumen:account-changed` event. Every page subscribes and refetches scoped to the active account.

### Workflow & Campaigns — removed
The earlier "Agentic Workflow" page and "Campaigns" features have been removed per spec. The `campaigns` and `workflow_runs` tables remain in the schema (they hold no data) so existing deployments don't break; ignore or drop them at will.

### Dashboard chart fix
`app/globals.css` defines `.dashboard-chart { height: 220px; max-height: 240px }` and `.chart-grid { grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)) }` — charts stay above the fold on desktop and stack cleanly on mobile.

---

## Supabase setup

1. Create a project at https://supabase.com/dashboard
2. SQL editor → run **`supabase/migrations/0001_initial.sql`**
3. RLS is enabled on every table by the migration.
4. The `on_auth_user_created` trigger auto-seeds Judith's four accounts the first time an auth user exists. Until you wire sign-in, `/api/accounts` returns the seed list from `lib/accounts.ts` so the UI still works.

---

## Apify setup

1. Get an API token from https://console.apify.com/account/integrations
2. The default actors in `.env.example` are public:
   - `apify/instagram-profile-scraper`
   - `apify/instagram-post-scraper`
   - `apify/linkedin-profile-scraper`
3. Set the env vars in EdgeOne. Then in the app: **Connections** → **Connect & sync now** runs the Apify actor for that account → results are upserted into `analytics_snapshots` + `posts` → every screen reads from Supabase.

---

## Data flow

```
            ┌──────────────────────────────────────────────┐
            │            Frontend (Next.js)                │
            │   (Account switcher · Dashboard · Planner)   │
            └────────┬─────────────────────┬───────────────┘
                     │  /api/*             │  Supabase JS
                     ▼                     ▼
       ┌──────────────────────┐   ┌────────────────────┐
       │ Next.js API routes   │   │  Supabase Postgres │
       │  (Node, server-only) │   │  RLS-scoped tables │
       └─────┬─────────┬──────┘   └─────────▲──────────┘
             │         │                    │
             │         │ upsert snapshots / │
             │         │  posts / outputs   │
             │         └────────────────────┘
             │
             │ Apify  ─► Instagram / LinkedIn scrapers
             │
             └─ Anthropic Claude ─► AI Studio + Report summaries
```

---

## Pushing to your GitHub repo

I can't push for you from this session. To get the regenerated files into `Marketing-Dashboard`:

**If you have the repo cloned locally:**
```bash
# From your local Marketing-Dashboard checkout
# Replace its contents with the regenerated project, then:
git add .
git commit -m "Rebuild: remove workflow + campaigns, add week/month planner, fix EdgeOne deploy"
git push origin main
```

**If you don't have it cloned:**
1. `git clone <your-repo-url>`
2. Copy everything from the `lumen-marketing/` folder this session generated into the clone (overwriting the old files; remember to move them to the repo root if you chose **Option A** above)
3. `git add . && git commit -m "..." && git push`

EdgeOne will trigger a new deploy on the push.

---

## File tree

```
lumen-marketing/
├── README.md
├── package.json
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── edgeone.json                    headers config only
├── .env.example
├── .gitignore
├── supabase/migrations/0001_initial.sql
├── lib/
│   ├── accounts.ts                 4 default accounts
│   ├── ai.ts                       Claude service
│   ├── apify.ts                    Apify actors + normalizers
│   ├── store.ts                    active-account store
│   ├── types.ts
│   └── supabase/
│       ├── client.ts
│       └── server.ts
├── components/
│   ├── Shell.tsx                   sidebar + topbar
│   ├── useActiveAccount.ts
│   ├── ConnectAccountState.tsx
│   ├── Charts.tsx
│   └── KpiCard.tsx
└── app/
    ├── layout.tsx
    ├── globals.css
    ├── page.tsx                    account selection
    ├── (app)/
    │   ├── layout.tsx
    │   ├── dashboard/page.tsx
    │   ├── analytics/page.tsx
    │   ├── planner/page.tsx        ← month/week + story slots
    │   ├── ai-studio/page.tsx
    │   ├── reports/page.tsx
    │   ├── connections/page.tsx
    │   ├── settings/page.tsx
    │   └── workflow/page.tsx       (stub — redirects to /dashboard)
    └── api/
        ├── accounts/route.ts
        ├── apify/sync/route.ts
        ├── analytics/[accountId]/route.ts
        ├── calendar/route.ts
        ├── ai/generate/route.ts
        ├── reports/generate/route.ts
        └── workflow/run/route.ts   (stub — returns 410)
```

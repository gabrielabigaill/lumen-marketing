// Apify integration layer.
// Reuses one ApifyClient instance per cold start.
// Each function normalizes Apify dataset items into our DB shape so the rest
// of the app never has to know which actor returned what.

import { ApifyClient } from 'apify-client';
import type { Platform } from './types';

let _client: ApifyClient | null = null;
export function apify(): ApifyClient {
  if (!_client) {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error('APIFY_TOKEN is not configured');
    _client = new ApifyClient({ token });
  }
  return _client;
}

export interface NormalizedProfile {
  followers: number | null;
  following: number | null;
  posts_count: number | null;
  bio: string | null;
  profile_url: string | null;
  raw: Record<string, unknown>;
}

export interface NormalizedPost {
  external_id: string | null;
  url: string | null;
  posted_at: string | null;
  content_type: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  thumbnail_url: string | null;
  raw: Record<string, unknown>;
}

// ----- Synchronous helpers (DEPRECATED for EdgeOne — keep for local/dev) -----

/** Run an actor and return the dataset items. Times out at 4 min — too long for EdgeOne. */
export async function runActor(actorId: string, input: unknown): Promise<{ runId: string; datasetId: string; items: any[] }> {
  const run = await apify().actor(actorId).call(input, { timeout: 240 });
  const { items } = await apify().dataset(run.defaultDatasetId).listItems();
  return { runId: run.id, datasetId: run.defaultDatasetId, items };
}

// ----- Async helpers (preferred — fit inside EdgeOne's 30s function ceiling) -----

/** Start an actor run and return the run ID immediately (no waiting). */
export async function startActor(actorId: string, input: unknown): Promise<string> {
  const run = await apify().actor(actorId).start(input);
  return run.id;
}

/** Fetch the current state of a run. */
export async function getRun(runId: string) {
  return apify().run(runId).get();
}

/** Fetch all items from a dataset. */
export async function getDatasetItems(datasetId: string): Promise<any[]> {
  const { items } = await apify().dataset(datasetId).listItems();
  return items;
}

// ----- Plan + normalize -----

export type SyncPlan =
  | { kind: 'instagram'; username: string; profile_run_id: string; posts_run_id: string }
  | { kind: 'linkedin'; handle: string; profile_run_id: string };

/** Kick off the right actor(s) for an account and return the run IDs we need to poll. */
export async function startSync(platform: Platform, handle: string): Promise<SyncPlan> {
  if (platform === 'instagram') {
    const username = handle.replace(/^@/, '');
    const profileActor = process.env.APIFY_ACTOR_INSTAGRAM_PROFILE || 'apify/instagram-profile-scraper';
    const postsActor = process.env.APIFY_ACTOR_INSTAGRAM_POSTS || 'apify/instagram-post-scraper';
    const [profileRunId, postsRunId] = await Promise.all([
      startActor(profileActor, { usernames: [username] }),
      startActor(postsActor, { username: [username], resultsLimit: 24 }),
    ]);
    return { kind: 'instagram', username, profile_run_id: profileRunId, posts_run_id: postsRunId };
  }
  if (platform === 'linkedin') {
    const actor = process.env.APIFY_ACTOR_LINKEDIN_PROFILE || 'apify/linkedin-profile-scraper';
    const url = `https://www.linkedin.com/in/${handle}`;
    const runId = await startActor(actor, { profileUrls: [url] });
    return { kind: 'linkedin', handle, profile_run_id: runId };
  }
  throw new Error(`Apify sync not implemented for platform: ${platform}`);
}

const DONE_STATES = new Set(['SUCCEEDED']);
const FAIL_STATES = new Set(['FAILED', 'ABORTED', 'TIMED-OUT']);

export type AggregatedState = 'running' | 'succeeded' | 'failed';

/** Given a sync plan, return the combined state across its run(s). */
export async function checkSyncState(plan: SyncPlan): Promise<{ state: AggregatedState; error?: string }> {
  const ids = plan.kind === 'instagram'
    ? [plan.profile_run_id, plan.posts_run_id]
    : [plan.profile_run_id];
  const runs = await Promise.all(ids.map(getRun));
  if (runs.some(r => !r)) return { state: 'failed', error: 'Apify run not found.' };
  if (runs.some(r => FAIL_STATES.has(r!.status))) {
    const bad = runs.find(r => FAIL_STATES.has(r!.status))!;
    return { state: 'failed', error: bad.statusMessage || `Run ${bad.id} ended ${bad.status}.` };
  }
  if (runs.every(r => DONE_STATES.has(r!.status))) {
    return { state: 'succeeded' };
  }
  return { state: 'running' };
}

/** Once all runs have succeeded, pull the data and normalize. */
export async function collectSyncResults(plan: SyncPlan): Promise<{
  runId: string;
  datasetId: string;
  profile: NormalizedProfile;
  posts: NormalizedPost[];
}> {
  if (plan.kind === 'instagram') {
    const [profileRun, postsRun] = await Promise.all([
      getRun(plan.profile_run_id),
      getRun(plan.posts_run_id),
    ]);
    if (!profileRun || !postsRun) throw new Error('One of the Apify runs disappeared.');
    const [profileItems, postsItems] = await Promise.all([
      getDatasetItems(profileRun.defaultDatasetId),
      getDatasetItems(postsRun.defaultDatasetId),
    ]);

    const p = profileItems[0] || {};
    const profile: NormalizedProfile = {
      followers: numOr(p.followersCount, null),
      following: numOr(p.followsCount, null),
      posts_count: numOr(p.postsCount, null),
      bio: str(p.biography),
      profile_url: str(p.url) ?? `https://instagram.com/${plan.username}`,
      raw: p,
    };

    const posts: NormalizedPost[] = (postsItems || []).map((it: any) => ({
      external_id: str(it.id ?? it.shortCode),
      url: str(it.url),
      posted_at: str(it.timestamp),
      content_type: mapIgType(it.type ?? it.productType),
      caption: str(it.caption),
      likes: numOr(it.likesCount, 0),
      comments: numOr(it.commentsCount, 0),
      shares: numOr(it.sharesCount, 0),
      saves: numOr(it.savesCount, 0),
      thumbnail_url: str(it.displayUrl ?? it.thumbnailSrc),
      raw: it,
    }));

    return { runId: postsRun.id, datasetId: postsRun.defaultDatasetId, profile, posts };
  }

  // linkedin
  const run = await getRun(plan.profile_run_id);
  if (!run) throw new Error('Apify LinkedIn run disappeared.');
  const items = await getDatasetItems(run.defaultDatasetId);
  const p = items[0] || {};
  const profile: NormalizedProfile = {
    followers: numOr(p.followers ?? p.connectionsCount, null),
    following: null,
    posts_count: numOr(p.postsCount, null),
    bio: str(p.about ?? p.headline),
    profile_url: `https://www.linkedin.com/in/${plan.handle}`,
    raw: p,
  };
  const posts: NormalizedPost[] = (p.posts || []).map((it: any) => ({
    external_id: str(it.urn ?? it.id),
    url: str(it.url),
    posted_at: str(it.postedAt ?? it.timestamp),
    content_type: 'post',
    caption: str(it.text ?? it.content),
    likes: numOr(it.likes ?? it.numLikes, 0),
    comments: numOr(it.comments ?? it.numComments, 0),
    shares: numOr(it.shares ?? it.numShares, 0),
    saves: 0,
    thumbnail_url: str(it.image),
    raw: it,
  }));
  return { runId: run.id, datasetId: run.defaultDatasetId, profile, posts };
}

// ----- helpers -----

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}
function numOr(v: unknown, fallback: number | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback as number);
}
function mapIgType(t: unknown): string {
  const s = String(t || '').toLowerCase();
  if (s.includes('reel')) return 'reel';
  if (s.includes('carousel') || s.includes('sidecar')) return 'carousel';
  if (s.includes('video')) return 'video';
  if (s.includes('story')) return 'story';
  return 'image';
}

/** Compute engagement rate the same way for every platform. */
export function engagementRate(p: { likes: number; comments: number; shares: number; saves: number }, followers: number | null) {
  if (!followers || followers <= 0) return null;
  const interactions = p.likes + p.comments + p.shares + p.saves;
  return Number(((interactions / followers) * 100).toFixed(3));
}

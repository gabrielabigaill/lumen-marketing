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

/** Run an actor and return the dataset items. Times out at 4 min. */
export async function runActor(actorId: string, input: unknown): Promise<{ runId: string; datasetId: string; items: any[] }> {
  const run = await apify().actor(actorId).call(input, { timeout: 240 });
  const { items } = await apify().dataset(run.defaultDatasetId).listItems();
  return { runId: run.id, datasetId: run.defaultDatasetId, items };
}

/** Scrape a profile + post sample for a given account. */
export async function scrapeAccount(platform: Platform, handle: string) {
  if (platform === 'instagram') return scrapeInstagram(handle);
  if (platform === 'linkedin') return scrapeLinkedIn(handle);
  throw new Error(`Apify sync not implemented for platform: ${platform}`);
}

async function scrapeInstagram(handle: string) {
  const profileActor = process.env.APIFY_ACTOR_INSTAGRAM_PROFILE || 'apify/instagram-profile-scraper';
  const postsActor = process.env.APIFY_ACTOR_INSTAGRAM_POSTS || 'apify/instagram-post-scraper';

  const username = handle.replace(/^@/, '');

  const profileRun = await runActor(profileActor, { usernames: [username] });
  const p = profileRun.items[0] || {};

  const profile: NormalizedProfile = {
    followers: numOr(p.followersCount, null),
    following: numOr(p.followsCount, null),
    posts_count: numOr(p.postsCount, null),
    bio: str(p.biography),
    profile_url: str(p.url) ?? `https://instagram.com/${username}`,
    raw: p,
  };

  const postsRun = await runActor(postsActor, { username: [username], resultsLimit: 24 });
  const posts: NormalizedPost[] = (postsRun.items || []).map((it: any) => ({
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

  return { runId: postsRun.runId, datasetId: postsRun.datasetId, profile, posts };
}

async function scrapeLinkedIn(handle: string) {
  const actor = process.env.APIFY_ACTOR_LINKEDIN_PROFILE || 'apify/linkedin-profile-scraper';
  const profileUrl = `https://www.linkedin.com/in/${handle}`;
  const run = await runActor(actor, { profileUrls: [profileUrl] });
  const p = run.items[0] || {};

  const profile: NormalizedProfile = {
    followers: numOr(p.followers ?? p.connectionsCount, null),
    following: null,
    posts_count: numOr(p.postsCount, null),
    bio: str(p.about ?? p.headline),
    profile_url: profileUrl,
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

  return { runId: run.runId, datasetId: run.datasetId, profile, posts };
}

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

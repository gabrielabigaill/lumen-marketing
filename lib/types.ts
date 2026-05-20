// Shared TypeScript types — mirror Supabase tables.

export type Platform = 'instagram' | 'linkedin' | 'tiktok' | 'twitter' | 'facebook';
export type AccountStatus = 'needs_connection' | 'connecting' | 'connected' | 'error' | 'syncing';
export type CalendarStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published';
export type WorkflowStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ConnectedAccount {
  id: string;
  user_id: string;
  platform: Platform;
  handle: string;
  display_name: string;
  profile_type: string;
  status: AccountStatus;
  apify_dataset_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsSnapshot {
  id: string;
  account_id: string;
  snapshot_date: string;
  followers: number | null;
  following: number | null;
  posts_count: number | null;
  reach: number | null;
  impressions: number | null;
  engagement_rate: number | null;
  profile_views: number | null;
  raw: Record<string, unknown>;
}

export interface Post {
  id: string;
  account_id: string;
  external_id: string | null;
  url: string | null;
  posted_at: string | null;
  content_type: string | null;
  caption: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  engagement_rate: number | null;
  thumbnail_url: string | null;
}

export interface CalendarItem {
  id: string;
  user_id: string;
  account_id: string;
  campaign_id: string | null;
  title: string;
  platform: string;
  content_type: string | null;
  caption: string | null;
  cta: string | null;
  notes: string | null;
  scheduled_for: string | null;
  status: CalendarStatus;
  source: 'manual' | 'workflow' | 'ai_studio' | 'recurring_task';
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  brief: string | null;
  goal: string | null;
  audience: string | null;
  platforms: string[];
  tone: string | null;
  offer: string | null;
  cta: string | null;
  notes: string | null;
  starts_on: string | null;
  ends_on: string | null;
  posting_frequency: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
}

export type AiKind =
  | 'ig_caption'
  | 'li_post'
  | 'li_article'
  | 'carousel'
  | 'graphic_brief'
  | 'hashtags'
  | 'report'
  | 'repurpose'
  | 'campaign_concept'
  | 'workflow';
// 'workflow' kept in the union so historical ai_outputs rows don't break TS — never emitted by new code.

export interface AiOutput {
  id: string;
  user_id: string;
  account_id: string | null;
  campaign_id: string | null;
  kind: AiKind;
  inputs: Record<string, unknown>;
  output: string;
  model: string | null;
  saved: boolean;
  created_at: string;
}

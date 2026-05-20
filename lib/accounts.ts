// Default account seed — mirrored in supabase/migrations/0001_initial.sql
// Used by the account selection screen before Supabase auth is wired.

import type { Platform } from './types';

export interface AccountSeed {
  platform: Platform;
  handle: string;
  display_name: string;
  profile_type: string;
  accent: string;        // gradient for cards/avatars
  bio_hint: string;
}

export const ACCOUNT_SEEDS: AccountSeed[] = [
  {
    platform: 'instagram',
    handle: 'happilyjuju',
    display_name: '@happilyjuju',
    profile_type: 'Personal / Creator',
    accent: 'from-pink-500 to-amber-400',
    bio_hint: 'Lifestyle, travel, daily moments.',
  },
  {
    platform: 'instagram',
    handle: 'judithbemnet',
    display_name: '@Judithbemnet',
    profile_type: 'Professional / Personal Brand',
    accent: 'from-violet-500 to-indigo-500',
    bio_hint: 'Founder voice, thought leadership, behind-the-scenes.',
  },
  {
    platform: 'instagram',
    handle: 'mas.osx',
    display_name: '@mas.osx',
    profile_type: 'Brand / SaaS / Carnival Tech',
    accent: 'from-emerald-500 to-cyan-500',
    bio_hint: 'MasOS — the operating system for Carnival.',
  },
  {
    platform: 'linkedin',
    handle: 'judithbemnet',
    display_name: 'judithbemnet',
    profile_type: 'Professional LinkedIn Profile',
    accent: 'from-sky-500 to-blue-700',
    bio_hint: 'B2B authority, founder updates, case studies.',
  },
];

export function accountKey(a: { platform: string; handle: string }) {
  return `${a.platform}:${a.handle.toLowerCase()}`;
}

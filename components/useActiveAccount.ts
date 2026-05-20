'use client';
import { useEffect, useState } from 'react';
import { getActiveAccountId, onAccountChange } from '@/lib/store';

export interface ActiveAccountSummary {
  id: string;
  platform: string;
  handle: string;
  display_name: string;
  profile_type: string;
  status: string;
  last_synced_at?: string | null;
}

export function useActiveAccount() {
  const [id, setId] = useState<string | null>(null);
  const [account, setAccount] = useState<ActiveAccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setId(getActiveAccountId());
    const off = onAccountChange(setId);
    return off;
  }, []);

  useEffect(() => {
    if (!id) { setAccount(null); setLoading(false); return; }
    setLoading(true);
    fetch('/api/accounts').then(r => r.json()).then(d => {
      setAccount((d.accounts ?? []).find((a: any) => a.id === id) ?? null);
    }).finally(() => setLoading(false));
  }, [id]);

  return { id, account, loading };
}

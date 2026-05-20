'use client';
// Lightweight client-side store for the active account.
// Backed by localStorage so the choice survives reloads.
// Replace with React Context if you need cross-tab broadcast.

const KEY = 'lumen.activeAccountId';

export function getActiveAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(KEY);
}

export function setActiveAccountId(id: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, id);
  window.dispatchEvent(new CustomEvent('lumen:account-changed', { detail: { id } }));
}

export function clearActiveAccount() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('lumen:account-changed', { detail: { id: null } }));
}

export function onAccountChange(cb: (id: string | null) => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => cb((e as CustomEvent).detail?.id ?? null);
  window.addEventListener('lumen:account-changed', handler);
  return () => window.removeEventListener('lumen:account-changed', handler);
}

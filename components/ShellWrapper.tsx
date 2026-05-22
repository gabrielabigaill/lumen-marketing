'use client';
// Decides at runtime whether to wrap children in the app Shell.
// Public routes (account select, sign-in, auth callback) render bare.
// Everything else gets the sidebar + topbar.
import { usePathname } from 'next/navigation';
import Shell from './Shell';

const NO_SHELL = new Set<string>(['/', '/sign-in']);

export default function ShellWrapper({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const isBare = NO_SHELL.has(path) || path.startsWith('/auth/');
  if (isBare) return <>{children}</>;
  return <Shell>{children}</Shell>;
}

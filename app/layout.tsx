import './globals.css';
import type { Metadata, Viewport } from 'next';
import ShellWrapper from '@/components/ShellWrapper';

export const metadata: Metadata = {
  title: 'Lumen — Marketing Intelligence',
  description: 'Account-aware marketing dashboard, content planner, and AI Studio for Judith Bemnet & MasOS.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { const t = localStorage.getItem('lumen.theme'); if (t === 'dark') document.documentElement.classList.add('dark'); } catch (_) {}`,
          }}
        />
      </head>
      <body className="bg-bg text-ink">
        <ShellWrapper>{children}</ShellWrapper>
      </body>
    </html>
  );
}

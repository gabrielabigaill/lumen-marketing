// Lumen wordmark + sigil. A glowing crescent moon (the "lumen" / light theme)
// over a soft gradient orb. Pure SVG — scales perfectly, no asset pipeline.

import Link from 'next/link';

export function LogoMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="lumen-orb" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="1" />
        </radialGradient>
        <radialGradient id="lumen-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lumen-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>

      {/* glow */}
      <circle cx="32" cy="32" r="30" fill="url(#lumen-glow)" />

      {/* main orb */}
      <circle cx="32" cy="32" r="22" fill="url(#lumen-orb)" />

      {/* crescent — a moon shape carved from the orb, evokes "light/lumen" */}
      <path
        d="M 42 18 a 18 18 0 1 0 0 28 a 14 14 0 1 1 0 -28 z"
        fill="#fef3c7"
        opacity="0.92"
      />

      {/* sparkle */}
      <circle cx="48" cy="20" r="2" fill="#fde68a" />
      <circle cx="20" cy="46" r="1.4" fill="#fde68a" opacity="0.7" />

      {/* outer ring */}
      <circle cx="32" cy="32" r="22" fill="none" stroke="url(#lumen-stroke)" strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
}

export function LogoWordmark({ size = 36, href }: { size?: number; href?: string }) {
  const content = (
    <div className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="leading-tight">
        <div className="font-bold text-base tracking-tight">Lumen</div>
        <div className="text-[11px] text-muted">Marketing Intelligence</div>
      </div>
    </div>
  );
  if (href) return <Link href={href} className="hover:opacity-90 transition-opacity">{content}</Link>;
  return content;
}

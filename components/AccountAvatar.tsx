'use client';
// Reusable avatar for an account. Tries the profile photo through our proxy;
// falls back to a gradient letter if the image fails to load (or never had a
// URL). Stateful so the fallback actually renders instead of leaving a blank
// box.

import { useState } from 'react';

interface Props {
  src?: string | null;
  alt: string;
  fallback: string;
  gradient: string;
  size?: number;
  rounded?: string;
}

export default function AccountAvatar({ src, alt, fallback, gradient, size = 56, rounded = 'rounded-2xl' }: Props) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  const proxied = src ? `/api/proxy-image?url=${encodeURIComponent(src)}` : null;

  return (
    <div
      style={{ width: size, height: size }}
      className={`${rounded} bg-gradient-to-br ${gradient} grid place-items-center text-white font-bold shadow-soft shrink-0 overflow-hidden relative`}
    >
      {/* Always render the fallback underneath so it shows the moment the img errors */}
      <span className="select-none" style={{ fontSize: Math.round(size * 0.36) }}>{fallback}</span>
      {showImg && proxied && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxied}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </div>
  );
}

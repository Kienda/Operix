import React, { useId } from 'react';

/*
 * OPERIX identity as code: geometric vector wordmark (no font dependency for the
 * letters), the gold accent on the X, and the ring-and-arrow app mark. The same
 * geometry is exported as static files in /public/brand for favicons and print.
 */
export const BRAND = {
  teal: '#0D9488',
  tealOnDark: '#14B8A6',
  navy: '#0F172A',
  gold: '#F4B942',
  light: '#F8FAFC',
};
export const SUBTITLE = 'A GLOBAL HIGH TECH PRODUCT';

const TONES = {
  light: { letters: BRAND.teal, accent: BRAND.gold, subtitle: BRAND.navy },
  dark: { letters: BRAND.tealOnDark, accent: BRAND.gold, subtitle: '#CBD5E1' },
  mono: { letters: 'currentColor', accent: 'currentColor', subtitle: 'currentColor' },
};

/** Letter shapes on a 546 × 100 grid (cap height 100, stroke 24). */
function Letters({ letters, accent }) {
  return (
    <>
      <g fill={letters}>
        <path fillRule="evenodd" d="M0 50a56 50 0 1 0 112 0a56 50 0 1 0-112 0ZM24 50a32 26 0 1 0 64 0a32 26 0 1 0-64 0Z" />
        <rect x="124" width="24" height="100" />
        <rect x="220" width="24" height="100" />
        <rect x="220" width="68" height="24" />
        <rect x="220" y="38" width="62" height="24" />
        <rect x="220" y="76" width="68" height="24" />
        <rect x="302" width="24" height="100" />
        <path d="M336 64h28l26 36h-28Z" />
        <rect x="404" width="24" height="100" />
        <path d="M442 0h32l72 100h-32Z" />
        <path d="M442 100h32l44.64-62h-32Z" />
      </g>
      <g fill="none" stroke={letters} strokeWidth="24">
        <path d="M136 12h32a26 26 0 0 1 0 52h-32" />
        <path d="M314 12h32a26 26 0 0 1 0 52h-32" />
      </g>
      <path fill={accent} d="M490.24 33h32l23.76-33h-32Z" />
    </>
  );
}

/**
 * The OPERIX wordmark, optionally with the "A GLOBAL HIGH TECH PRODUCT" line.
 * `tone`: light (on light surfaces) | dark (on navy) | mono (currentColor).
 */
export function Logo({ tone = 'light', subtitle = false, className = '', title = 'Operix' }) {
  const colors = TONES[tone] ?? TONES.light;
  return (
    <svg
      className={`px-logo-svg ${subtitle ? 'px-logo-lockup' : ''} ${className}`}
      viewBox={subtitle ? '0 0 546 132' : '0 0 546 100'}
      role="img"
      aria-label={subtitle ? `${title} — ${SUBTITLE.toLowerCase()}` : title}
    >
      <Letters {...colors} />
      {subtitle && (
        <text
          x="0"
          y="130"
          textLength="546"
          lengthAdjust="spacing"
          fill={colors.subtitle}
          fontFamily="Montserrat, 'Segoe UI', Arial, sans-serif"
          fontWeight="600"
          fontSize="21"
          aria-hidden="true"
        >
          {SUBTITLE}
        </text>
      )}
    </svg>
  );
}

/** Ring-and-arrow app mark. `framed` draws the navy rounded tile used for app icons. */
export function LogoMark({ framed = true, mono = false, className = '', title }) {
  const gradient = useId();
  const ring = mono ? 'currentColor' : '#FFFFFF';
  return (
    <svg className={`px-mark ${className}`} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {framed && !mono && (
        <>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#15253F" />
              <stop offset="1" stopColor={BRAND.navy} />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="14" fill={`url(#${gradient})`} />
        </>
      )}
      {mono ? (
        <path fill="currentColor" fillRule="evenodd" d="M11 37a17 17 0 1 0 34 0a17 17 0 1 0-34 0ZM20 37a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z" />
      ) : (
        <>
          <circle cx="28" cy="37" r="17" fill={ring} />
          <circle cx="28" cy="37" r="8.5" fill={BRAND.teal} />
        </>
      )}
      <path d="M38.5 26.5 46.5 18.5" stroke={mono ? 'currentColor' : BRAND.gold} strokeWidth="6" strokeLinecap="square" fill="none" />
      <path d="M54 11 40 13.5 51.5 25Z" fill={mono ? 'currentColor' : BRAND.gold} />
    </svg>
  );
}

/** Product lockup used across the app (sidebar, top bar, auth, landing). */
export function Brand({ light = false, subtitle = false, className = '' }) {
  return (
    <span className={`px-brand ${light ? 'px-brand-light' : ''} ${className}`}>
      <Logo tone={light ? 'dark' : 'light'} subtitle={subtitle} />
    </span>
  );
}

import React from 'react';

interface McqArenaLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  variant?: 'full' | 'icon' | 'badge';
  withGlow?: boolean;
  className?: string;
  theme?: 'dark' | 'light' | 'auto';
  subtitle?: string;
  showSubtitle?: boolean;
}

/**
 * Official MCQ ARENA Brand Identity Component
 * - Circular academic emblem: Open Book, Graduation Cap, Gold Pen/Nib
 * - Gold + Dark Navy palette
 * - Large "MCQ" typography with 3D Gold Checkmark integrated into the Q
 * - "ARENA" written underneath
 */
export const McqArenaLogo: React.FC<McqArenaLogoProps> = ({
  size = 'md',
  variant = 'full',
  withGlow = false,
  className = '',
  theme = 'auto',
  subtitle = 'Practice smarter. Improve every day.',
  showSubtitle = false,
}) => {
  // Dimensional configuration preserving exact geometric aspect ratio
  const dimensions = {
    xs: { emblemSize: 28, height: 28, textMcq: 'text-sm', textArena: 'text-[9px]', subText: 'text-[9px]', gap: 'gap-2' },
    sm: { emblemSize: 36, height: 36, textMcq: 'text-base', textArena: 'text-[10px]', subText: 'text-[10px]', gap: 'gap-2.5' },
    md: { emblemSize: 46, height: 46, textMcq: 'text-xl', textArena: 'text-xs', subText: 'text-[11px]', gap: 'gap-3' },
    lg: { emblemSize: 58, height: 58, textMcq: 'text-2xl', textArena: 'text-sm', subText: 'text-xs', gap: 'gap-3.5' },
    xl: { emblemSize: 76, height: 76, textMcq: 'text-3xl', textArena: 'text-base', subText: 'text-sm', gap: 'gap-4' },
    hero: { emblemSize: 96, height: 96, textMcq: 'text-4xl md:text-5xl', textArena: 'text-lg', subText: 'text-sm md:text-base', gap: 'gap-5' },
  }[size];

  // The Official Academic Emblem SVG
  // Circular Crest + Open Book + Gold Fountain Pen Nib + Graduation Cap
  const officialAcademicEmblem = (
    <div
      className={`relative shrink-0 select-none ${
        withGlow ? 'drop-shadow-[0_0_16px_rgba(245,158,11,0.4)]' : 'drop-shadow-md'
      }`}
      style={{ width: dimensions.emblemSize, height: dimensions.emblemSize }}
    >
      <svg
        viewBox="0 0 140 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="emblemGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="35%" stopColor="#fbbf24" />
            <stop offset="70%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#92400e" />
          </linearGradient>
          <linearGradient id="emblemGoldBright" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="50%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <linearGradient id="emblemNavy" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="45%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <linearGradient id="bookPageL" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="85%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <linearGradient id="bookPageR" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="85%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <radialGradient id="emblemCoreLight" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.8" />
            <stop offset="80%" stopColor="#090d16" stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* 1. Circular Academic Frame */}
        <circle cx="70" cy="70" r="66" fill="url(#emblemNavy)" stroke="url(#emblemGold)" strokeWidth="3" />
        <circle cx="70" cy="70" r="61" fill="none" stroke="url(#emblemGold)" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.8" />
        <circle cx="70" cy="70" r="56" fill="url(#emblemCoreLight)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* 2. Open Academic Book */}
        {/* Book cover gilded base */}
        <path
          d="M 32 94 C 48 97 64 96 70 99 C 76 96 92 97 108 94 C 110 97 108 103 106 104 C 92 107 76 106 70 108 C 64 106 48 107 34 104 C 32 103 30 97 32 94 Z"
          fill="url(#emblemGold)"
        />
        {/* Left Curved Pages */}
        <path d="M 33 91 C 48 94 63 93 70 97 L 70 78 C 63 74 48 75 33 72 Z" fill="url(#bookPageL)" stroke="url(#emblemGold)" strokeWidth="0.8" />
        <path d="M 35 88 C 49 91 63 90 70 94 L 70 75 C 63 71 49 72 35 69 Z" fill="#ffffff" opacity="0.95" />
        <path d="M 37 85 C 50 88 63 87 70 91 L 70 72 C 63 68 50 69 37 66 Z" fill="url(#bookPageL)" stroke="#cbd5e1" strokeWidth="0.5" />

        {/* Right Curved Pages */}
        <path d="M 107 91 C 92 94 77 93 70 97 L 70 78 C 77 74 92 75 107 72 Z" fill="url(#bookPageR)" stroke="url(#emblemGold)" strokeWidth="0.8" />
        <path d="M 105 88 C 91 91 77 90 70 94 L 70 75 C 77 71 91 72 105 69 Z" fill="#ffffff" opacity="0.95" />
        <path d="M 103 85 C 90 88 77 87 70 91 L 70 72 C 77 68 90 69 103 66 Z" fill="url(#bookPageR)" stroke="#cbd5e1" strokeWidth="0.5" />

        {/* Gilded Book Center Spine */}
        <line x1="70" y1="71" x2="70" y2="98" stroke="url(#emblemGoldBright)" strokeWidth="1.8" strokeLinecap="round" />

        {/* 3. Gold Fountain Pen Nib (Towering from center of book) */}
        <g transform="translate(0, -6)">
          <path d="M 70 42 L 77 67 C 77 69 75 73 70 74 C 65 73 63 69 63 67 Z" fill="url(#emblemGold)" stroke="url(#emblemGoldBright)" strokeWidth="1" />
          <circle cx="70" cy="58" r="2.2" fill="#090d16" stroke="url(#emblemGoldBright)" strokeWidth="0.6" />
          <path d="M 70 42 L 70 56" stroke="#090d16" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M 66 64 C 67 60 68 53 70 45" stroke="url(#emblemGoldBright)" strokeWidth="0.8" fill="none" opacity="0.8" />
          <path d="M 74 64 C 73 60 72 53 70 45" stroke="url(#emblemGoldBright)" strokeWidth="0.8" fill="none" opacity="0.8" />
        </g>

        {/* 4. Graduation Mortarboard Cap */}
        <path d="M 58 40 C 58 46 82 46 82 40 Z" fill="#1e293b" stroke="url(#emblemGold)" strokeWidth="0.8" />
        <polygon points="70,22 101,33 70,44 39,33" fill="#090d16" stroke="url(#emblemGold)" strokeWidth="1.8" />
        <circle cx="70" cy="33" r="2.8" fill="url(#emblemGoldBright)" stroke="url(#emblemGold)" strokeWidth="0.8" />
        <path d="M 70 33 C 78 33 87 37 92 46 C 93 48 94 54 94 58" fill="none" stroke="url(#emblemGoldBright)" strokeWidth="1.5" strokeLinecap="round" />
        <polygon points="92,58 96,58 97,67 91,67" fill="url(#emblemGold)" stroke="url(#emblemGoldBright)" strokeWidth="0.7" />
        <line x1="94" y1="67" x2="94" y2="70" stroke="url(#emblemGoldBright)" strokeWidth="1" />
      </svg>
    </div>
  );

  // If icon-only variant is requested
  if (variant === 'icon') {
    return <div className={`inline-flex items-center ${className}`}>{officialAcademicEmblem}</div>;
  }

  // Full Brand Lockup: Emblem + "MCQ" (with Gold Checkmark in Q) + "ARENA" + Subtitle
  return (
    <div className={`inline-flex items-center ${dimensions.gap} ${className}`}>
      {officialAcademicEmblem}

      <div className="flex flex-col justify-center select-none leading-none">
        {/* MCQ ARENA Primary Typography */}
        <div className="flex items-baseline gap-1.5">
          {/* MCQ SVG with integrated gold checkmark in Q */}
          <div className="relative flex items-center">
            <svg
              height={dimensions.height}
              viewBox="0 0 230 75"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-full w-auto"
            >
              <defs>
                <linearGradient id="txtGoldSheen" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fef08a" />
                  <stop offset="35%" stopColor="#fbbf24" />
                  <stop offset="70%" stopColor="#d97706" />
                  <stop offset="100%" stopColor="#92400e" />
                </linearGradient>
                <linearGradient id="txtGoldLight" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#d97706" />
                  <stop offset="50%" stopColor="#fde047" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>
                <linearGradient id="txtLetterGloss" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="65%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#cbd5e1" />
                </linearGradient>
                <filter id="txtShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.4" />
                </filter>
              </defs>

              {/* M */}
              <g filter="url(#txtShadow)">
                <path
                  d="M 5 70 L 5 8 L 24 8 L 41 45 L 58 8 L 77 8 L 77 70 L 62 70 L 62 26 L 46 60 L 36 60 L 20 26 L 20 70 Z"
                  fill="url(#txtGoldSheen)"
                  stroke="url(#txtGoldLight)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M 7 68 L 7 10 L 23 10 L 41 47 L 59 10 L 75 10 L 75 68 L 63 68 L 63 28 L 45 62 L 37 62 L 19 28 L 19 68 Z"
                  fill="url(#txtLetterGloss)"
                />
              </g>

              {/* C */}
              <g transform="translate(85, 0)" filter="url(#txtShadow)">
                <path
                  d="M 68 21 C 63 12 55 8 42 8 C 23 8 9 22 9 40 C 9 57 23 71 42 71 C 55 71 64 66 69 57 L 56 49 C 53 54 48 57 41 57 C 31 57 23 49 23 40 C 23 30 31 22 41 22 C 48 22 53 25 56 30 Z"
                  fill="url(#txtGoldSheen)"
                  stroke="url(#txtGoldLight)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M 67 22 C 62 13 54 9 42 9 C 24 9 10 23 10 40 C 10 56 24 70 42 70 C 54 70 63 65 68 56 L 56 49 C 53 53 48 56 41 56 C 32 56 25 48 25 40 C 25 31 32 23 41 23 C 48 23 53 26 56 30 Z"
                  fill="url(#txtLetterGloss)"
                />
              </g>

              {/* Q with integrated dark core and 3D gold checkmark */}
              <g transform="translate(160, 0)" filter="url(#txtShadow)">
                {/* Q Outer Body */}
                <path
                  d="M 38 8 C 19 8 5 22 5 40 C 5 54 17 66 33 69 L 30 73 L 42 73 L 46 69 C 59 65 70 54 70 40 C 70 22 55 8 38 8 Z"
                  fill="url(#txtGoldSheen)"
                  stroke="url(#txtGoldLight)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M 38 9 C 20 9 6 23 6 40 C 6 53 18 65 34 68 L 31 72 L 41 72 L 45 68 C 58 64 69 53 69 40 C 69 23 54 9 38 9 Z"
                  fill="url(#txtLetterGloss)"
                />

                {/* Dark Inner Core */}
                <circle cx="38" cy="40" r="19" fill="#090d16" stroke="#1e3a8a" strokeWidth="1.2" />

                {/* Q Tail */}
                <polygon points="46,58 66,74 56,74 42,62" fill="url(#txtGoldSheen)" />

                {/* Dynamic 3D Gold Checkmark across the Q */}
                <g filter="url(#txtShadow)">
                  <path d="M 24 41 L 35 52 L 64 22 L 68 25 L 35 58 L 21 44 Z" fill="#b45309" />
                  <path
                    d="M 24 39 L 35 50 L 64 20 L 69 24 L 35 56 L 21 42 Z"
                    fill="url(#txtGoldLight)"
                    stroke="url(#txtGoldSheen)"
                    strokeWidth="1"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <line x1="24" y1="39" x2="35" y2="50" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
                  <line x1="35" y1="50" x2="64" y2="20" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" />
                </g>
              </g>
            </svg>
          </div>

          {/* ARENA text directly underneath or beside */}
          <span
            className={`font-black tracking-[0.25em] uppercase text-amber-500 dark:text-amber-400 ${dimensions.textArena}`}
            style={{
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            ARENA
          </span>
        </div>

        {/* Subtitle / Tagline: "Practice smarter. Improve every day." */}
        {(showSubtitle || subtitle) && (
          <span
            className={`mt-1 font-medium tracking-tight ${dimensions.subText} ${
              theme === 'light'
                ? 'text-slate-600'
                : theme === 'dark'
                ? 'text-slate-400'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
export default McqArenaLogo;

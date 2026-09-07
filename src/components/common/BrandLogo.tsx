import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'full' | 'horizontal' | 'mark';
  showBadge?: boolean;
  showSubtitle?: boolean;
  className?: string;
  onClick?: () => void;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  variant = 'horizontal',
  showBadge = true,
  showSubtitle = false,
  className = '',
  onClick,
}) => {
  // If variant is "full", we render the complete official brand badge
  if (variant === 'full') {
    const fullDimensions = {
      sm: 'w-48 max-w-full',
      md: 'w-60 max-w-full',
      lg: 'w-72 max-w-full',
      xl: 'w-84 max-w-full',
      '2xl': 'w-96 max-w-full',
    }[size];

    return (
      <div
        id="ca-brand-logo-full"
        onClick={onClick}
        className={`inline-block select-none ${onClick ? 'cursor-pointer transition hover:opacity-95' : ''} ${className}`}
      >
        <img
          src="/logo.svg"
          alt="CA EXAM CHECKER AI - Checked Like An Examiner"
          className={`${fullDimensions} h-auto object-contain mx-auto drop-shadow-xs`}
          loading="eager"
        />
      </div>
    );
  }

  // Dimension presets for horizontal / mark layouts
  const iconDimensions = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
    '2xl': 'w-18 h-18',
  }[size];

  const titleSizes = {
    sm: 'text-sm',
    md: 'text-base sm:text-lg',
    lg: 'text-xl sm:text-2xl',
    xl: 'text-2xl sm:text-3xl',
    '2xl': 'text-3xl sm:text-4xl',
  }[size];

  const aiBadgeSizes = {
    sm: 'text-[9px] px-1 py-0.2',
    md: 'text-[10px] px-1.5 py-0.5',
    lg: 'text-xs px-2 py-0.5',
    xl: 'text-xs px-2.5 py-1',
    '2xl': 'text-sm px-3 py-1',
  }[size];

  if (variant === 'mark') {
    return (
      <div
        id="ca-brand-logo-mark"
        onClick={onClick}
        className={`inline-flex items-center justify-center select-none ${onClick ? 'cursor-pointer group' : ''} ${className}`}
      >
        <div className={`${iconDimensions} shrink-0 transition duration-200 group-hover:scale-105`}>
          <img
            src="/favicon.svg"
            alt="CA Exam Checker AI"
            className="w-full h-full object-contain rounded-lg shadow-sm"
          />
        </div>
      </div>
    );
  }

  // Default: horizontal navbar layout (Emblem + CA EXAM CHECKER + AI pill + optional tagline)
  return (
    <div
      id="ca-brand-logo"
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 select-none ${onClick ? 'cursor-pointer group' : ''} ${className}`}
    >
      {/* Official Emblem Mark */}
      <div className={`${iconDimensions} shrink-0 transition duration-200 group-hover:scale-105`}>
        <img
          src="/favicon.svg"
          alt="CA Exam Checker AI Logo"
          className="w-full h-full object-contain rounded-lg shadow-sm"
        />
      </div>

      {/* Typography Hierarchy */}
      <div className="flex flex-col">
        <div className={`font-black tracking-tight text-slate-900 leading-none flex items-center gap-1.5 ${titleSizes}`}>
          <span className="text-slate-950 font-black tracking-tight">CA EXAM CHECKER</span>
          {showBadge && (
            <span
              className={`font-black tracking-wider uppercase bg-blue-600 text-white rounded font-mono shadow-2xs ${aiBadgeSizes}`}
            >
              AI
            </span>
          )}
        </div>
        {showSubtitle ? (
          <span className="text-[10px] tracking-wider uppercase font-extrabold text-blue-700 mt-1">
            Checked Like An Examiner
          </span>
        ) : (
          <span className="text-[9px] tracking-widest uppercase font-semibold text-slate-400 mt-0.5 hidden sm:inline-block">
            Examiner-Style AI Evaluation
          </span>
        )}
      </div>
    </div>
  );
};

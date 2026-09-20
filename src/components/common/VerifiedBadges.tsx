import React from 'react';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';

interface BadgeProps {
  className?: string;
  showText?: boolean;
}

/**
 * Verified Evaluation User Badge
 * Blue checkmark indicating genuine evaluated student.
 */
export const VerifiedStudentBadge: React.FC<BadgeProps> = ({ className = '', showText = false }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium text-xs ${className}`}
      title="Verified Evaluation User"
      aria-label="Verified Evaluation User"
    >
      <span className="relative flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300">
        <CheckCircle2 className="w-3 h-3 fill-blue-600 text-white dark:fill-blue-400 dark:text-slate-900" />
      </span>
      {showText && <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Verified User</span>}
    </span>
  );
};

/**
 * Official CA Exam Checker AI Account Badge
 * Gold checkmark indicating authoritative platform response.
 */
export const OfficialAdminBadge: React.FC<BadgeProps> = ({ className = '', showText = false }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium text-xs ${className}`}
      title="Official CA Exam Checker AI Account"
      aria-label="Official CA Exam Checker AI Account"
    >
      <span className="relative flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400">
        <ShieldCheck className="w-3 h-3 fill-amber-500 text-white dark:fill-amber-400 dark:text-slate-900" />
      </span>
      {showText && <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Official Team</span>}
    </span>
  );
};

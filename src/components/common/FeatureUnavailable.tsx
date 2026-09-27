import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ArrowLeft, Sparkles, Wrench, Clock, Rocket, ShieldCheck } from 'lucide-react';
import { McqArenaLogo } from './McqArenaLogo.js';

export interface FeatureUnavailableProps {
  application?: 'CHECKER' | 'MCQ_ARENA';
  featureKey?: string;
  featureName?: string;
  status?: 'TESTING' | 'DISABLED' | 'COMING_SOON' | 'ENABLED';
  studentMessage?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onBack?: () => void;
}

export const FeatureUnavailable: React.FC<FeatureUnavailableProps> = ({
  application = 'MCQ_ARENA',
  featureKey,
  featureName = 'Feature',
  status = 'DISABLED',
  studentMessage,
  icon: IconComponent,
  onBack,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/student/dashboard');
    }
  };

  const isComingSoon = status === 'COMING_SOON';
  const isTesting = status === 'TESTING';
  const isDisabled = status === 'DISABLED';

  // Default messages per prompt specifications
  const defaultMessage = isComingSoon
    ? "We're working on this feature and it will be available soon."
    : isTesting
    ? 'This feature is currently being tested with a limited group of users.'
    : 'This feature is currently unavailable while we work on improvements. Please check back soon.';

  const displayMessage =
    studentMessage && studentMessage.trim().length > 0 ? studentMessage : defaultMessage;

  // Selected icon based on status if not custom passed
  const DisplayIcon =
    IconComponent ||
    (isComingSoon ? Rocket : isTesting ? Clock : application === 'MCQ_ARENA' ? Target : Wrench);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {application === 'MCQ_ARENA' ? (
            <McqArenaLogo size="md" withGlow showSubtitle subtitle="Chartered Accountancy Practice System" />
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white tracking-wide">CA Exam Checker AI</h2>
                <p className="text-[11px] text-slate-400">ICAI Verified Examination Intelligence</p>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </button>
      </header>

      {/* Main Feature Unavailable Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="max-w-xl w-full bg-slate-800/60 border border-slate-700/80 rounded-2xl p-6 sm:p-10 shadow-2xl backdrop-blur-sm text-center relative overflow-hidden">
          {/* Background Ambient Glow */}
          <div
            className={`absolute -top-24 -left-24 w-60 h-60 rounded-full blur-3xl opacity-20 pointer-events-none ${
              isComingSoon ? 'bg-indigo-400' : isTesting ? 'bg-amber-400' : 'bg-rose-500'
            }`}
          />
          <div
            className={`absolute -bottom-24 -right-24 w-60 h-60 rounded-full blur-3xl opacity-15 pointer-events-none ${
              isComingSoon ? 'bg-sky-400' : isTesting ? 'bg-indigo-400' : 'bg-slate-500'
            }`}
          />

          {/* Feature Icon Container */}
          <div className="relative mx-auto mb-6 w-20 h-20 rounded-2xl bg-gradient-to-b from-slate-700/80 to-slate-800 border border-slate-600/60 flex items-center justify-center shadow-inner">
            <DisplayIcon
              className={`w-10 h-10 ${
                isComingSoon ? 'text-sky-400' : isTesting ? 'text-amber-400' : 'text-rose-400'
              }`}
            />
            <div
              className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-800 text-slate-950 font-bold ${
                isComingSoon
                  ? 'bg-sky-400 text-slate-950'
                  : isTesting
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-rose-600 text-white'
              }`}
            >
              {isComingSoon ? (
                <Rocket className="w-3.5 h-3.5" />
              ) : isTesting ? (
                <Clock className="w-3.5 h-3.5" />
              ) : (
                <Wrench className="w-3.5 h-3.5" />
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4 border shadow-xs">
            {isComingSoon ? (
              <span className="inline-flex items-center gap-1.5 text-sky-300 bg-sky-950/60 border border-sky-500/40 px-3 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3 text-sky-400" />
                Coming Soon
              </span>
            ) : isTesting ? (
              <span className="inline-flex items-center gap-1.5 text-amber-300 bg-amber-950/60 border border-amber-500/40 px-3 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Limited Testing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-rose-300 bg-rose-950/60 border border-rose-500/40 px-3 py-0.5 rounded-full">
                <Wrench className="w-3 h-3 text-rose-400" />
                Temporarily Unavailable
              </span>
            )}
          </div>

          {/* Feature Title */}
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">
            {featureName}
          </h1>

          {/* Explanation Message (Super Admin custom or default) */}
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal mb-8 max-w-lg mx-auto">
            {displayMessage}
          </p>

          {/* Helpful Information Box */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-700/60 text-left text-xs text-slate-400 space-y-2 mb-8">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Account Status & Safety</span>
            </div>
            <p className="text-slate-300">
              Your student profile, purchased credits, and verified examination copies remain fully safe, intact, and active.
            </p>
            {isTesting && (
              <p className="text-slate-400">
                If your account was designated as a tester, please ensure you are signed in with your registered tester email address.
              </p>
            )}
            {isComingSoon && (
              <p className="text-slate-400">
                This feature is actively being developed and tested by our engineering and CA faculty team.
              </p>
            )}
          </div>

          {/* Action Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleBack}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4 px-6 text-center text-xs text-slate-500">
        CA Exam Checker AI • ICAI Examination Practice & Evaluation Architecture
      </footer>
    </div>
  );
};
export default FeatureUnavailable;

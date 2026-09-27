import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ArrowLeft, ShieldAlert, Sparkles, Wrench, Clock } from 'lucide-react';
import { McqArenaLogo } from './McqArenaLogo.js';

export interface FeatureUnavailableProps {
  featureKey?: string;
  featureName?: string;
  status?: 'TESTING' | 'DISABLED' | 'ENABLED';
  studentMessage?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onBack?: () => void;
}

export const FeatureUnavailable: React.FC<FeatureUnavailableProps> = ({
  featureKey = 'mcq_arena',
  featureName = 'MCQ Arena',
  status = 'TESTING',
  studentMessage,
  icon: IconComponent = Target,
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

  const isTesting = status === 'TESTING';

  const defaultMessage = isTesting
    ? "MCQ Arena is currently under development and limited testing. We're working on improving the question bank, practice experience and overall system. Public access will be available soon."
    : "MCQ Arena is temporarily unavailable while we work on improvements. Please check back soon.";

  const displayMessage = (studentMessage && studentMessage.trim().length > 0)
    ? studentMessage
    : defaultMessage;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 md:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <McqArenaLogo size="md" withGlow showSubtitle subtitle="Chartered Accountancy Practice System" />
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
          {/* Subtle background glow */}
          <div
            className={`absolute -top-24 -left-24 w-60 h-60 rounded-full blur-3xl opacity-20 pointer-events-none ${
              isTesting ? 'bg-amber-400' : 'bg-blue-500'
            }`}
          />
          <div
            className={`absolute -bottom-24 -right-24 w-60 h-60 rounded-full blur-3xl opacity-15 pointer-events-none ${
              isTesting ? 'bg-indigo-400' : 'bg-cyan-400'
            }`}
          />

          {/* Feature Icon Container */}
          <div className="relative mx-auto mb-6 w-20 h-20 rounded-2xl bg-gradient-to-b from-slate-700/80 to-slate-800 border border-slate-600/60 flex items-center justify-center shadow-inner">
            <IconComponent className={`w-10 h-10 ${isTesting ? 'text-amber-400' : 'text-blue-400'}`} />
            <div
              className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-800 ${
                isTesting ? 'bg-amber-500 text-slate-950' : 'bg-blue-600 text-white'
              }`}
            >
              {isTesting ? <Clock className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
            </div>
          </div>

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4 border shadow-xs">
            {isTesting ? (
              <span className="inline-flex items-center gap-1.5 text-amber-300 bg-amber-950/60 border border-amber-500/40 px-3 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Limited Testing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sky-300 bg-sky-950/60 border border-sky-500/40 px-3 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Under Development
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
              <span>What this means for your account</span>
            </div>
            <p className="text-slate-300">
              Your existing student profile, credits, evaluation history, and exam checker submissions remain fully intact and active.
            </p>
            {isTesting && (
              <p className="text-slate-400">
                If your account was designated as a pilot tester, please verify you are signed in with your registered tester address.
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
        CA Exam Checker AI • Authoritative ICAI Syllabus Practice & Evaluation
      </footer>
    </div>
  );
};
export default FeatureUnavailable;

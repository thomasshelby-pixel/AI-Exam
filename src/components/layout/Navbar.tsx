import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { BrandLogo } from '../common/BrandLogo';
import {
  FileCheck2,
  Sparkles,
  LogOut,
  CreditCard,
  User as UserIcon,
  Building2,
  ShieldCheck,
  Menu,
  X,
  Bell,
  CheckCircle2,
  Sun,
  Moon,
  Dna,
  Target,
} from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string, extra?: Record<string, unknown>) => void;
  onOpenCreditsModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, onOpenCreditsModal }) => {
  const { user, profile, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isStudent = user?.role === 'STUDENT';
  const isInstitute = user?.role === 'INSTITUTE_ADMIN' || (user?.role as string) === 'INSTITUTE';
  const isAdmin = user?.role === 'SUPER_ADMIN' || (user?.role as string) === 'ADMIN';

  const studentProfile = profile as {
    free_evaluations_used?: number;
    purchased_credits?: number;
    institute_name?: string;
  } | null;

  const freeRemaining = Math.max(0, 2 - (studentProfile?.free_evaluations_used || 0));
  const purchasedCredits = studentProfile?.purchased_credits || 0;

  return (
    <header className="sticky top-0 z-40 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors duration-150">
      <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Logo / Brand Block */}
          <div
            id="brand-logo"
            onClick={() => {
              if (user) {
                if (isStudent) onNavigate('student-dashboard');
                else if (isInstitute) onNavigate('institute-dashboard');
                else if (isAdmin) onNavigate('admin-dashboard');
              } else {
                onNavigate('landing');
              }
            }}
            className={
              user && isStudent
                ? 'flex items-center gap-2.5 cursor-pointer select-none group shrink-0'
                : 'flex items-center gap-2.5 cursor-pointer select-none group shrink-0'
            }
          >
            {user && isStudent ? (
              <div id="student-portal-brand-block" className="inline-flex items-center gap-2.5 select-none shrink-0 whitespace-nowrap">
                {/* Official Emblem Mark */}
                <div className="w-7 h-7 shrink-0 transition duration-200 group-hover:scale-105">
                  <img
                    src="/favicon.svg"
                    alt="CA Exam Checker AI Logo"
                    className="w-full h-full object-contain rounded-lg shadow-sm"
                  />
                </div>

                {/* Typography Hierarchy */}
                <div className="flex flex-col justify-center shrink-0 whitespace-nowrap leading-none">
                  <div className="font-black tracking-tight text-slate-900 dark:text-white leading-none flex items-center gap-1.5 text-sm whitespace-nowrap">
                    <span className="text-slate-950 dark:text-white font-black tracking-tight whitespace-nowrap">
                      CA EXAM CHECKER
                    </span>
                    <span className="font-black tracking-wider uppercase bg-blue-600 text-white rounded font-mono shadow-2xs text-[9px] px-1 py-0.2 shrink-0 whitespace-nowrap">
                      AI
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 mt-0.5 whitespace-nowrap">
                    Checked Like an Examiner
                  </span>
                </div>
              </div>
            ) : (
              <BrandLogo size="sm" showSubtitle={true} />
            )}
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2.5 2xl:gap-3.5 shrink min-w-0">
            <div className="hidden 2xl:flex items-center gap-2 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shrink-0">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">System Online</span>
            </div>

            {!user ? (
              <>
                <button
                  id="nav-how-it-works"
                  onClick={() => onNavigate('how-it-works')}
                  className={`text-xs xl:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                    currentView === 'how-it-works'
                      ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  How It Works
                </button>
                <button
                  id="nav-pricing"
                  onClick={() => onNavigate('pricing')}
                  className={`text-xs xl:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                    currentView === 'pricing'
                      ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Pricing
                </button>
                <button
                  id="nav-reviews"
                  onClick={() => onNavigate('reviews')}
                  className={`text-xs xl:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                    currentView === 'reviews'
                      ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Reviews
                </button>
                <button
                  id="nav-support"
                  onClick={() => onNavigate('contact')}
                  className={`text-xs xl:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                    currentView === 'contact'
                      ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Support
                </button>

                {/* Right-Side Authentication & Theme Controls with Comfortable Spacing */}
                <div className="flex items-center gap-2.5 xl:gap-3.5 ml-1.5 shrink-0">
                  {/* Dark Mode Toggle for Unauthenticated Users */}
                  <button
                    id="nav-theme-toggle-btn"
                    type="button"
                    onClick={toggleTheme}
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                    title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode for Evaluators"}
                    className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer shrink-0"
                  >
                    {isDark ? (
                      <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
                    ) : (
                      <Moon className="w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform duration-200 hover:-rotate-12" />
                    )}
                  </button>

                  <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

                  <button
                    id="nav-login-btn"
                    onClick={() => onNavigate('login')}
                    className="text-xs xl:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Sign In
                  </button>

                  <button
                    id="nav-register-btn"
                    onClick={() => onNavigate('login', { mode: 'register' })}
                    className="text-xs xl:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Get 2 Free Checks
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Role Specific Nav Items */}
                {isStudent && (
                  <>
                    <button
                      id="nav-student-dashboard"
                      onClick={() => onNavigate('student-dashboard')}
                      className={`text-xs 2xl:text-sm font-semibold px-2 2xl:px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                        currentView === 'student-dashboard'
                          ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Dashboard
                    </button>
                    <button
                      id="nav-student-upload"
                      onClick={() => onNavigate('student-upload')}
                      className={`text-xs 2xl:text-sm font-semibold px-2 2xl:px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                        currentView === 'student-upload'
                          ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Check Answer Sheet
                    </button>
                    <button
                      id="nav-student-evaluations"
                      onClick={() => onNavigate('student-evaluations')}
                      className={`text-xs 2xl:text-sm font-semibold px-2 2xl:px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                        currentView === 'student-evaluations'
                          ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      My Reports
                    </button>
                    <button
                      id="nav-student-mcq-arena"
                      onClick={() => onNavigate('arena')}
                      className={`text-xs 2xl:text-sm font-bold px-2 2xl:px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        currentView === 'arena'
                          ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold'
                          : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>MCQ Arena</span>
                    </button>
                    <button
                      id="nav-student-examiner-profile"
                      onClick={() => onNavigate('student-examiner-profile')}
                      className={`text-xs 2xl:text-sm font-semibold px-2 2xl:px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        currentView === 'student-examiner-profile'
                          ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Dna className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>Examiner Profile</span>
                    </button>
                    <button
                      id="nav-student-profile"
                      onClick={() => onNavigate('student-profile')}
                      className={`text-xs 2xl:text-sm font-semibold px-2 2xl:px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                        currentView === 'student-profile'
                          ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Profile & Settings
                    </button>
                  </>
                )}

                {isInstitute && (
                  <>
                    <button
                      id="nav-institute-dashboard"
                      onClick={() => onNavigate('institute-dashboard')}
                      className={`text-xs xl:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                        currentView === 'institute-dashboard'
                          ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Institute Portal
                    </button>
                  </>
                )}

                {isAdmin && (
                  <>
                    <button
                      id="nav-admin-dashboard"
                      onClick={() => onNavigate('admin-dashboard')}
                      className={`text-xs xl:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                        currentView === 'admin-dashboard'
                          ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Super Admin Portal
                    </button>
                    <button
                      id="nav-mcq-admin-portal"
                      onClick={() => onNavigate('mcq-admin')}
                      className={`text-xs xl:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                        currentView === 'mcq-admin'
                          ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Target className="w-3.5 h-3.5 text-amber-500" />
                      <span>MCQ Admin Portal</span>
                    </button>
                  </>
                )}

                {/* Student Entitlement Pill */}
                {isStudent && (
                  <div className="flex items-center gap-1 xl:gap-1.5 pl-1 xl:pl-1.5 shrink-0">
                    {user.hasPermanentFreeAccess ? (
                      <span className="inline-flex items-center gap-1.5 px-2 2xl:px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        Evaluation Active
                      </span>
                    ) : studentProfile?.institute_name ? (
                      <span className="inline-flex items-center gap-1.5 px-2 2xl:px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                        <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="max-w-[110px] truncate">{studentProfile.institute_name}</span>
                      </span>
                    ) : freeRemaining > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 2xl:px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                        {freeRemaining} Free Left
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 2xl:px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                        {purchasedCredits} Credits
                      </span>
                    )}

                    {!user.hasPermanentFreeAccess && !studentProfile?.institute_name && (
                      <button
                        id="nav-buy-credits-btn"
                        onClick={onOpenCreditsModal}
                        className="inline-flex items-center gap-1 px-2 2xl:px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm whitespace-nowrap shrink-0"
                      >
                        <CreditCard className="w-3 h-3 shrink-0" />
                        Add Credits
                      </button>
                    )}
                  </div>
                )}

                {/* Dark Mode Toggle for Authenticated Users */}
                <button
                  id="nav-theme-toggle-btn"
                  type="button"
                  onClick={toggleTheme}
                  aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode for Evaluators"}
                  className="p-1.5 xl:p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer shrink-0"
                >
                  {isDark ? (
                    <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
                  ) : (
                    <Moon className="w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform duration-200 hover:-rotate-12" />
                  )}
                </button>

                {/* User Profile Badge & Logout */}
                <div className="flex items-center gap-1.5 xl:gap-2 pl-1.5 xl:pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">
                      {user.fullName ? user.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'CA'}
                    </div>
                    <div className="text-left hidden xl:block">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight truncate max-w-[90px] 2xl:max-w-[130px]">
                        {user.fullName}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-medium">{user.role}</p>
                    </div>
                  </div>

                  <button
                    id="nav-logout-btn"
                    onClick={() => {
                      logout();
                      onNavigate('landing');
                    }}
                    title="Sign Out"
                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition shrink-0"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </nav>

          {/* Mobile Right Controls: Dark Mode Toggle + Hamburger */}
          <div className="flex lg:hidden items-center gap-2">
            {user && isStudent && (
              <button
                onClick={onOpenCreditsModal}
                className="px-2 py-1 text-xs font-bold rounded bg-blue-600 text-white"
              >
                Buy
              </button>
            )}

            {/* Mobile Dark Mode Quick Toggle */}
            <button
              id="mobile-theme-toggle-btn"
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition focus:outline-none"
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              )}
            </button>

            <button
              id="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 pt-2 pb-6 space-y-3 shadow-lg transition-colors">
          {/* Mobile Theme Preference Selector Banner */}
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              {isDark ? (
                <Moon className="w-4 h-4 text-blue-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Theme: {isDark ? 'Dark Mode' : 'Light Mode'}
              </span>
            </div>
            <button
              id="mobile-drawer-theme-toggle"
              type="button"
              onClick={toggleTheme}
              className="px-2.5 py-1 text-xs font-bold rounded-md bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-600"
            >
              Switch to {isDark ? 'Light' : 'Dark'}
            </button>
          </div>

          {!user ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  onNavigate('how-it-works');
                  setMobileMenuOpen(false);
                }}
                className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
              >
                How It Works
              </button>
              <button
                onClick={() => {
                  onNavigate('pricing');
                  setMobileMenuOpen(false);
                }}
                className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
              >
                Pricing
              </button>
              <button
                onClick={() => {
                  onNavigate('reviews');
                  setMobileMenuOpen(false);
                }}
                className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
              >
                Reviews
              </button>
              <button
                onClick={() => {
                  onNavigate('contact');
                  setMobileMenuOpen(false);
                }}
                className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
              >
                Support
              </button>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    onNavigate('login');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-2 text-sm font-semibold text-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    onNavigate('login', { mode: 'register' });
                    setMobileMenuOpen(false);
                  }}
                  className="w-full py-2 text-sm font-bold text-center rounded-lg bg-blue-600 text-white shadow-sm"
                >
                  Register (2 Free Checks)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{user.fullName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-semibold">
                  {user.role}
                </span>
              </div>

              {isStudent && (
                <>
                  <button
                    onClick={() => {
                      onNavigate('student-dashboard');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('student-upload');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm font-bold text-blue-600 dark:text-blue-400"
                  >
                    Check Answer Sheet
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('student-evaluations');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
                  >
                    My Past Reports
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('arena');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>MCQ Arena</span>
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('student-examiner-profile');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1.5"
                  >
                    <Dna className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Personal Examiner Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('student-profile');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
                  >
                    Profile & Settings
                  </button>
                </>
              )}

              {isInstitute && (
                <button
                  onClick={() => {
                    onNavigate('institute-dashboard');
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
                >
                  Institute Portal
                </button>
              )}

              {isAdmin && (
                <>
                  <button
                    onClick={() => {
                      onNavigate('admin-dashboard');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm text-slate-700 dark:text-slate-200 font-medium"
                  >
                    Super Admin Portal
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('mcq-admin');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm text-amber-600 dark:text-amber-400 font-bold flex items-center gap-2"
                  >
                    <Target className="w-4 h-4 text-amber-500" />
                    <span>MCQ Admin Portal</span>
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  logout();
                  onNavigate('landing');
                  setMobileMenuOpen(false);
                }}
                className="w-full mt-3 py-2 text-sm font-semibold text-center rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

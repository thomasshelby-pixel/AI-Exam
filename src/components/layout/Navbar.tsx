import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
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
} from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string, extra?: Record<string, unknown>) => void;
  onOpenCreditsModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate, onOpenCreditsModal }) => {
  const { user, profile, logout } = useAuth();
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
    <header className="sticky top-0 z-40 h-14 bg-white border-b border-slate-200 text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Logo */}
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
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            <BrandLogo size="sm" showSubtitle={true} />
          </div>

          {/* Desktop Nav Items */}
          <nav className="hidden md:flex items-center gap-4 lg:gap-6">
            <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-slate-100 rounded-full border border-slate-200">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-tight">System Online</span>
            </div>

            {!user ? (
              <>
                <button
                  id="nav-how-it-works"
                  onClick={() => onNavigate('how-it-works')}
                  className={`text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                    currentView === 'how-it-works'
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  How It Works
                </button>
                <button
                  id="nav-pricing"
                  onClick={() => onNavigate('pricing')}
                  className={`text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                    currentView === 'pricing'
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Pricing
                </button>
                <button
                  id="nav-support"
                  onClick={() => onNavigate('contact')}
                  className={`text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                    currentView === 'contact'
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Support
                </button>
                <div className="h-4 w-px bg-slate-200" />
                <button
                  id="nav-login-btn"
                  onClick={() => onNavigate('login')}
                  className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 px-3 py-1.5 transition-colors"
                >
                  Sign In
                </button>
                <button
                  id="nav-register-btn"
                  onClick={() => onNavigate('login', { mode: 'register' })}
                  className="text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg transition shadow-sm"
                >
                  Get 2 Free Checks
                </button>
              </>
            ) : (
              <>
                {/* Role Specific Nav Items */}
                {isStudent && (
                  <>
                    <button
                      id="nav-student-dashboard"
                      onClick={() => onNavigate('student-dashboard')}
                      className={`text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                        currentView === 'student-dashboard'
                          ? 'text-blue-700 bg-blue-50 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Dashboard
                    </button>
                    <button
                      id="nav-student-upload"
                      onClick={() => onNavigate('student-upload')}
                      className={`text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                        currentView === 'student-upload'
                          ? 'text-blue-700 bg-blue-50 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Check Answer Sheet
                    </button>
                    <button
                      id="nav-student-evaluations"
                      onClick={() => onNavigate('student-evaluations')}
                      className={`text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                        currentView === 'student-evaluations'
                          ? 'text-blue-700 bg-blue-50 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      My Reports
                    </button>
                  </>
                )}

                {isInstitute && (
                  <>
                    <button
                      id="nav-institute-dashboard"
                      onClick={() => onNavigate('institute-dashboard')}
                      className={`text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                        currentView === 'institute-dashboard'
                          ? 'text-blue-700 bg-blue-50 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
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
                      className={`text-xs sm:text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                        currentView === 'admin-dashboard'
                          ? 'text-blue-700 bg-blue-50 font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Super Admin Portal
                    </button>
                  </>
                )}

                {/* Student Entitlement Pill */}
                {isStudent && (
                  <div className="flex items-center gap-2 pl-2">
                    {user.hasPermanentFreeAccess ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        Evaluation Active
                      </span>
                    ) : studentProfile?.institute_name ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        <Building2 className="w-3.5 h-3.5 text-blue-600" />
                        {studentProfile.institute_name}
                      </span>
                    ) : freeRemaining > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {freeRemaining} Free Left
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {purchasedCredits} Credits
                      </span>
                    )}

                    {!user.hasPermanentFreeAccess && !studentProfile?.institute_name && (
                      <button
                        id="nav-buy-credits-btn"
                        onClick={onOpenCreditsModal}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
                      >
                        <CreditCard className="w-3 h-3" />
                        Add Credits
                      </button>
                    )}
                  </div>
                )}

                {/* User Profile Badge & Logout */}
                <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                      {user.fullName ? user.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'CA'}
                    </div>
                    <div className="text-left hidden lg:block">
                      <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[140px]">
                        {user.fullName}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono font-medium">{user.role}</p>
                    </div>
                  </div>

                  <button
                    id="nav-logout-btn"
                    onClick={() => {
                      logout();
                      onNavigate('landing');
                    }}
                    title="Sign Out"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </nav>

          {/* Mobile Hamburger */}
          <div className="flex md:hidden items-center gap-2">
            {user && isStudent && (
              <button
                onClick={onOpenCreditsModal}
                className="px-2 py-1 text-xs font-bold rounded bg-blue-600 text-white"
              >
                Buy
              </button>
            )}
            <button
              id="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-6 space-y-3 shadow-lg">
          {!user ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  onNavigate('how-it-works');
                  setMobileMenuOpen(false);
                }}
                className="text-left py-2 text-sm text-slate-700 font-medium"
              >
                How It Works
              </button>
              <button
                onClick={() => {
                  onNavigate('pricing');
                  setMobileMenuOpen(false);
                }}
                className="text-left py-2 text-sm text-slate-700 font-medium"
              >
                Pricing
              </button>
              <button
                onClick={() => {
                  onNavigate('contact');
                  setMobileMenuOpen(false);
                }}
                className="text-left py-2 text-sm text-slate-700 font-medium"
              >
                Support
              </button>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                  onNavigate('login');
                  setMobileMenuOpen(false);
                }}
                  className="w-full py-2 text-sm font-semibold text-center rounded-lg bg-slate-100 text-slate-800 border border-slate-200"
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
              <div className="pb-2 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{user.fullName}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-semibold">
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
                    className="text-left py-2 text-sm text-slate-700 font-medium"
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('student-upload');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm font-bold text-blue-600"
                  >
                    Check Answer Sheet
                  </button>
                  <button
                    onClick={() => {
                      onNavigate('student-evaluations');
                      setMobileMenuOpen(false);
                    }}
                    className="text-left py-2 text-sm text-slate-700 font-medium"
                  >
                    My Past Reports
                  </button>
                </>
              )}

              {isInstitute && (
                <button
                  onClick={() => {
                    onNavigate('institute-dashboard');
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-2 text-sm text-slate-700 font-medium"
                >
                  Institute Portal
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => {
                    onNavigate('admin-dashboard');
                    setMobileMenuOpen(false);
                  }}
                  className="text-left py-2 text-sm text-slate-700 font-medium"
                >
                  Super Admin Portal
                </button>
              )}

              <button
                onClick={() => {
                  logout();
                  onNavigate('landing');
                  setMobileMenuOpen(false);
                }}
                className="w-full mt-3 py-2 text-sm font-semibold text-center rounded-lg bg-rose-50 text-rose-700 border border-rose-200"
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

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { apiRequest } from '../../api/client.js';
import { MfaSecuritySettingsCard } from '../../components/auth/MfaSecuritySettingsCard.js';
import {
  User,
  Mail,
  Phone,
  MapPin,
  GraduationCap,
  BookOpen,
  Lock,
  KeyRound,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowLeft,
  Save,
  RotateCcw,
  ShieldCheck,
  Eye,
  EyeOff,
  Building2,
  Calendar,
  Gift,
  CreditCard,
  Layers,
  ChevronRight,
  Check,
  Smartphone,
  Trash2,
  AlertTriangle,
  X,
  ShieldAlert,
} from 'lucide-react';

interface StudentProfilePageProps {
  onNavigateDashboard: () => void;
  onOpenCreditsModal: () => void;
  initialSection?: 'profile' | 'security';
}

interface ProfileApiResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string;
    role: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  profile: {
    caLevel: 'FOUNDATION' | 'INTERMEDIATE' | 'FINAL';
    icaiRegistrationNumber: string;
    city: string;
    preferredSubjects: string[];
    avatarUrl: string;
    freeEvaluationsUsed: number;
    purchasedCredits: number;
    instituteId: string | null;
    instituteName: string | null;
    instituteCode: string | null;
    batchName: string | null;
    subscriptionStartDate: string | null;
    subscriptionExpiryDate: string | null;
  };
  enrolledInstitutes?: Array<{
    membership_id: string;
    institute_id: string;
    institute_name: string;
    institute_code: string;
    batch_id: string | null;
    batch_name: string | null;
    batch_level: string | null;
    status: string;
    joined_at: string;
  }>;
  entitlement: {
    canEvaluate: boolean;
    tier: string;
    freeEvaluationsRemaining: number;
    purchasedCredits: number;
    instituteSponsored: boolean;
    hasPermanentFreeAccess: boolean;
    referralCode?: string;
    referralExpiry?: string;
    reason?: string;
  };
  activePromo: {
    id: string;
    referralCode: string;
    campaignName: string;
    maxEvaluations: number;
    evaluationsUsed: number;
    evaluationsRemaining: number;
    expiryDate: string;
    status: string;
  } | null;
  stats: {
    totalEvaluations: number;
    completedEvaluations: number;
    averageScore: number;
  };
}

interface ReferralStatusResponse {
  hasActivePromo: boolean;
  activePromo: {
    id: string;
    referralCode: string;
    campaignName: string;
    maxEvaluations: number;
    evaluationsUsed: number;
    evaluationsRemaining: number;
    expiryDate: string;
    status: string;
  } | null;
  ai30Campaign: {
    code: string;
    campaignName: string;
    maxRedemptions: number;
    usedRedemptions: number;
    remainingSlots: number;
    isActive: boolean;
    maxEvaluations: number;
    validityDays: number;
  } | null;
}

const CA_SUBJECTS: Record<'FOUNDATION' | 'INTERMEDIATE' | 'FINAL', string[]> = {
  FOUNDATION: [
    'Paper 1: Accounting',
    'Paper 2: Business Laws',
    'Paper 3: Quantitative Aptitude',
    'Paper 4: Business Economics',
  ],
  INTERMEDIATE: [
    'Paper 1: Advanced Accounting',
    'Paper 2: Corporate and Other Laws',
    'Paper 3: Taxation (Income Tax & GST)',
    'Paper 4: Cost and Management Accounting',
    'Paper 5: Auditing and Ethics',
    'Paper 6: Financial Management and Strategic Management',
  ],
  FINAL: [
    'Paper 1: Financial Reporting (FR)',
    'Paper 2: Advanced Financial Management (AFM)',
    'Paper 3: Advanced Auditing, Assurance & Professional Ethics',
    'Paper 4: Direct Tax Laws & International Taxation',
    'Paper 5: Indirect Tax Laws (GST & Customs)',
    'Paper 6: Integrated Business Solutions (Multi-disciplinary Case Study)',
  ],
};

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
];

export const StudentProfilePage: React.FC<StudentProfilePageProps> = ({
  onNavigateDashboard,
  onOpenCreditsModal,
  initialSection = 'profile',
}) => {
  const navigate = useNavigate();
  const { user: authUser, setUser, logout, refreshUser, triggerMfaEnrollment, disableMfa } = useAuth();

  // Navigation Sub-tab
  const [activeSection, setActiveSection] = useState<'profile' | 'security'>(initialSection);

  // Account Deletion States
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [deleteShowPassword, setDeleteShowPassword] = useState<boolean>(false);
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState<string>('');
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmationInput.trim() !== 'DELETE') {
      setDeleteAccountError('Explicit confirmation required. Please type DELETE in all caps to confirm.');
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      const payload: {
        confirmationText: string;
        currentPassword?: string;
        emailConfirmation?: string;
      } = {
        confirmationText: 'DELETE',
      };

      if (deletePassword.trim()) {
        payload.currentPassword = deletePassword.trim();
      }
      if (deleteEmailConfirm.trim()) {
        payload.emailConfirmation = deleteEmailConfirm.trim();
      }

      const response = await apiRequest<{
        success: boolean;
        message: string;
        status: string;
        error?: string;
        supportEmail?: string;
      }>('/api/student/delete-account', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response.success || response.status === 'DELETED') {
        // 1. Invalidate session & clear local state
        try {
          await logout();
        } catch {
          // Ignore logout error if user is already deleted
        }

        localStorage.removeItem('ca_exam_checker_token');
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('ca_') || key.startsWith('student_') || key.includes('evaluation'))) {
            localStorage.removeItem(key);
          }
        }

        // 2. Redirect to login page and display authoritative success notice
        setShowDeleteModal(false);
        navigate('/login', {
          state: {
            accountDeletedMessage: 'Your account has been deleted successfully.',
          },
          replace: true,
        });
      } else {
        setDeleteAccountError(
          response.error || 'Account deletion could not be completed. Please try again or contact support.'
        );
      }
    } catch (err: any) {
      console.error('[StudentProfile] Account deletion failed:', err?.message || 'Unknown failure');
      setDeleteAccountError(
        err?.message || 'Account deletion could not be completed. Please try again or contact support.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Profile Form States
  const [profileData, setProfileData] = useState<ProfileApiResponse | null>(null);
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [caLevel, setCaLevel] = useState<'FOUNDATION' | 'INTERMEDIATE' | 'FINAL'>('INTERMEDIATE');
  const [preferredSubjects, setPreferredSubjects] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // UI States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password States
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrentPassword, setShowCurrentPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isSavingPassword, setIsSavingPassword] = useState<boolean>(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // MFA States
  const [isDisablingMfa, setIsDisablingMfa] = useState<boolean>(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState<boolean>(false);
  const [mfaActionMessage, setMfaActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDisableMfa = async () => {
    setIsDisablingMfa(true);
    setMfaActionMessage(null);
    try {
      await disableMfa();
      setMfaActionMessage({ type: 'success', text: 'Two-Factor Authentication disabled successfully.' });
      setShowDisableConfirm(false);
    } catch (err: any) {
      setMfaActionMessage({ type: 'error', text: err?.message || 'Failed to disable MFA. Please try again.' });
    } finally {
      setIsDisablingMfa(false);
    }
  };

  // Referral / Promo Code States
  const [promoCodeInput, setPromoCodeInput] = useState<string>('AI30');
  const [isRedeemingPromo, setIsRedeemingPromo] = useState<boolean>(false);
  const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [campaignInfo, setCampaignInfo] = useState<ReferralStatusResponse['ai30Campaign'] | null>(null);
  const [activePromoState, setActivePromoState] = useState<ProfileApiResponse['activePromo'] | null>(null);

  const fetchProfileAndReferrals = async () => {
    try {
      setIsLoading(true);
      const [profRes, refRes] = await Promise.all([
        apiRequest<ProfileApiResponse>('/api/student/profile'),
        apiRequest<ReferralStatusResponse>('/api/student/referral/status'),
      ]);

      setProfileData(profRes);
      setFullName(profRes.user.fullName || '');
      setPhone(profRes.user.phone || '');
      setCity(profRes.profile.city || '');
      setCaLevel(profRes.profile.caLevel || 'INTERMEDIATE');
      setPreferredSubjects(profRes.profile.preferredSubjects || []);
      setAvatarUrl(profRes.profile.avatarUrl || '');

      setCampaignInfo(refRes.ai30Campaign);
      setActivePromoState(profRes.activePromo || refRes.activePromo);
    } catch (err: any) {
      console.error('Failed to load profile data:', err);
      setProfileMessage({
        type: 'error',
        text: err?.message || 'Failed to load profile details. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileAndReferrals();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setProfileMessage({ type: 'error', text: 'Full name must be at least 2 characters long.' });
      return;
    }

    if (phone && phone.trim()) {
      const clean = phone.replace(/[\s\-\+]/g, '');
      if (clean.length < 8 || clean.length > 15) {
        setProfileMessage({ type: 'error', text: 'Please enter a valid phone number (8-15 digits).' });
        return;
      }
    }

    try {
      setIsSavingProfile(true);
      const res = await apiRequest<{ success: boolean; message: string }>('/api/student/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          city: city.trim(),
          caLevel,
          preferredSubjects,
          avatarUrl: avatarUrl.trim(),
        }),
      });

      setProfileMessage({ type: 'success', text: res.message || 'Profile updated successfully.' });

      // Update auth context if user object changed
      if (authUser && typeof setUser === 'function') {
        setUser({
          ...authUser,
          fullName: fullName.trim(),
          phone: phone.trim(),
        });
      }

      // Sync backend user state with AuthContext
      if (typeof refreshUser === 'function') {
        refreshUser().catch(() => {});
      }

      // Refresh data
      fetchProfileAndReferrals();
    } catch (err: any) {
      console.error('Update profile failed:', err);
      setProfileMessage({
        type: 'error',
        text: err?.message || 'Failed to update profile. Please try again.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleToggleSubject = (subject: string) => {
    if (preferredSubjects.includes(subject)) {
      setPreferredSubjects(preferredSubjects.filter((s) => s !== subject));
    } else {
      setPreferredSubjects([...preferredSubjects, subject]);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Please enter your current password.' });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirm password do not match.' });
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordMessage({ type: 'error', text: 'New password must be different from your current password.' });
      return;
    }

    try {
      setIsSavingPassword(true);
      const res = await apiRequest<{ success: boolean; message: string }>('/api/student/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      setPasswordMessage({ type: 'success', text: res.message || 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Password change failed:', err);
      setPasswordMessage({
        type: 'error',
        text: err?.message || 'Failed to update password. Please check your current password.',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleRedeemPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoMessage(null);

    const clean = promoCodeInput.trim().toUpperCase();
    if (!clean) {
      setPromoMessage({ type: 'error', text: 'Please enter a valid promotional code.' });
      return;
    }

    try {
      setIsRedeemingPromo(true);
      const res = await apiRequest<{
        success: boolean;
        message: string;
        maxEvaluations: number;
        evaluationsRemaining: number;
        expiryDate: string;
        redemptionNumber: number;
        maxRedemptions: number;
      }>('/api/student/referral/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: clean }),
      });

      setPromoMessage({
        type: 'success',
        text: `${res.message} (${res.maxEvaluations} evaluations unlocked, valid until ${new Date(
          res.expiryDate
        ).toLocaleDateString('en-IN')})`,
      });

      // Refetch profile to update entitlement and badges
      fetchProfileAndReferrals();
    } catch (err: any) {
      console.error('Promo redemption error:', err);
      setPromoMessage({
        type: 'error',
        text: err?.message || 'Failed to redeem promo code. Please try again.',
      });
    } finally {
      setIsRedeemingPromo(false);
    }
  };

  if (isLoading && !profileData) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-500">Loading student profile...</span>
        </div>
      </div>
    );
  }

  const user = profileData?.user;
  const profile = profileData?.profile;
  const entitlement = profileData?.entitlement;
  const stats = profileData?.stats;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-800 dark:text-slate-100">
      {/* Top Breadcrumb & Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <button
            onClick={onNavigateDashboard}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Student Dashboard
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <span>Student Profile & Account</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              CA {caLevel}
            </span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your personal details, exam preparation preferences, password security, and active promo benefits.
          </p>
        </div>

        {/* Quick Stats Banner */}
        <div className="flex items-center gap-2.5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 shadow-sm text-right">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Evaluations Taken</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{stats?.totalEvaluations || 0} Sheets</p>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 shadow-sm text-right">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Average Score</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {stats?.averageScore ? `${stats.averageScore}%` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs: Profile & Settings → Account & Security */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 sm:gap-2">
        <button
          id="tab-profile-details"
          type="button"
          onClick={() => setActiveSection('profile')}
          className={`pb-3.5 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeSection === 'profile'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Profile & Academic Details</span>
        </button>
        <button
          id="tab-account-security"
          type="button"
          onClick={() => {
            setActiveSection('security');
            const el = document.getElementById('student-delete-account-card');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className={`pb-3.5 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeSection === 'security'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Account & Security</span>
        </button>
      </div>

      {activeSection === 'security' && (
        <div
          id="account-security-breadcrumb-banner"
          className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-900 dark:text-blue-200 animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="font-semibold">
              Location: Profile &amp; Settings &rarr; Account &amp; Security &rarr; Delete Account
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('student-delete-account-card');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Jump to Delete Account</span>
          </button>
        </div>
      )}

      {/* Grid: Left column (Profile Edit & Subjects), Right column (Promo AI30 & Password) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ============================================================ */}
        {/* LEFT COLUMN: EDITABLE PROFILE DETAILS (7 cols) */}
        {/* ============================================================ */}
        <div className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleSaveProfile}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Personal & Academic Details</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Update your student information and target CA stage</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Student
              </span>
            </div>

            {profileMessage && (
              <div
                className={`p-4 rounded-xl text-sm flex items-start gap-3 ${
                  profileMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                {profileMessage.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{profileMessage.text}</span>
              </div>
            )}

            {/* Avatar Selection & Preview */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Profile Photo / Avatar
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-inner">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Student Avatar"
                      className="w-full h-full object-cover"
                      onError={() => setAvatarUrl('')}
                    />
                  ) : (
                    <div className="text-xl font-bold text-slate-500 dark:text-slate-400">
                      {fullName
                        ? fullName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        : 'CA'}
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Choose a default avatar or paste a custom image URL:</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_AVATARS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAvatarUrl(preset)}
                        className={`w-7 h-7 rounded-full overflow-hidden border-2 transition ${
                          avatarUrl === preset ? 'border-blue-600 scale-110 shadow-sm' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={preset} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 ml-1 font-medium cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name (Editable) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Phone Number (Editable) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Email Address (Immutable / Read-only) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>Registered Email</span>
                  <span className="text-xs text-slate-400 flex items-center gap-1 font-normal">
                    <Lock className="w-3 h-3" /> Immutable
                  </span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-xl cursor-not-allowed font-mono text-xs"
                  />
                </div>
              </div>

              {/* City / Location (Editable) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  City / Location
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Mumbai, Maharashtra"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* ICAI Registration (System / Read-only note) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span>ICAI Registration No.</span>
                  <span className="text-xs text-slate-400 font-normal">Exam Audit Record</span>
                </label>
                <div className="relative">
                  <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    disabled
                    value={profile?.icaiRegistrationNumber || 'REG-PENDING'}
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl cursor-not-allowed font-mono text-xs"
                  />
                </div>
              </div>

              {/* Institute Affiliation & Multi-Institute Enrollment (Spanning 2 columns for clean layout) */}
              <div className="space-y-2 sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Enrolled Institutes &amp; Batches
                </label>
                {profile?.enrolledInstitutes && profile.enrolledInstitutes.length > 0 ? (
                  <div className="space-y-2">
                    {profile.enrolledInstitutes.map((inst) => (
                      <div
                        key={inst.membership_id}
                        className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100">{inst.institute_name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Batch: <span className="font-semibold text-slate-700 dark:text-slate-300">{inst.batch_name || 'General / Unassigned'}</span>
                              {inst.batch_level ? ` • CA ${inst.batch_level}` : ''}
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800">
                          Active Membership
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      disabled
                      value="Independent CA Aspirant (Not enrolled in any coaching institute)"
                      className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl cursor-not-allowed font-medium"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* CA Exam Level Selector */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Target CA Level <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['FOUNDATION', 'INTERMEDIATE', 'FINAL'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      setCaLevel(level);
                      // Clear subjects that don't match new level
                      const levelSubjects = CA_SUBJECTS[level];
                      setPreferredSubjects((prev) => prev.filter((s) => levelSubjects.includes(s)));
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                      caLevel === level
                        ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-600 dark:border-blue-500 text-blue-700 dark:text-blue-300 shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <span>CA {level}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Preferred Subjects / Papers Selector */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Focus Subjects & Papers (CA {caLevel})
                </label>
                <span className="text-xs text-slate-400">
                  {preferredSubjects.length} selected
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select the papers you are currently preparing for step-marking evaluations:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {CA_SUBJECTS[caLevel].map((subject) => {
                  const isSelected = preferredSubjects.includes(subject);
                  return (
                    <button
                      key={subject}
                      type="button"
                      onClick={() => handleToggleSubject(subject)}
                      className={`text-left text-xs p-3 rounded-xl border transition flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-blue-50/70 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 font-semibold'
                          : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{subject}</span>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? 'bg-blue-600 text-white' : 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Save Profile Button */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  if (profileData) {
                    setFullName(profileData.user.fullName);
                    setPhone(profileData.user.phone || '');
                    setCity(profileData.profile.city || '');
                    setCaLevel(profileData.profile.caLevel || 'INTERMEDIATE');
                    setPreferredSubjects(profileData.profile.preferredSubjects || []);
                    setAvatarUrl(profileData.profile.avatarUrl || '');
                    setProfileMessage(null);
                  }
                }}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Discard
              </button>
              <button
                type="submit"
                disabled={isSavingProfile}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-sm flex items-center gap-2 transition disabled:opacity-50"
              >
                {isSavingProfile ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN: PROMO (AI30) & SECURITY (5 cols) */}
        {/* ============================================================ */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. AI30 PROMO CODE CARD */}
          <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-blue-800/50 relative overflow-hidden">
            {/* Background ambient lighting */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-400 text-slate-950 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 fill-current" />
                  Special Promotion
                </span>

                {campaignInfo && (
                  <span className="text-xs font-mono text-blue-200 bg-blue-950/60 px-2.5 py-1 rounded-md border border-blue-800">
                    {campaignInfo.remainingSlots} of {campaignInfo.maxRedemptions} spots remaining
                  </span>
                )}
              </div>

              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  <span>AI30 Promo Code</span>
                </h2>
                <p className="text-xs text-blue-200 mt-1 leading-relaxed">
                  1-Month Free Access including <strong>15 comprehensive evaluations</strong> with line-by-line ICAI step marking. Limited strictly to the <strong>first 20 students</strong>.
                </p>
              </div>

              {/* Promo Status Display if already active */}
              {activePromoState ? (
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Promo Benefit Active
                    </span>
                    <span className="text-xs font-mono font-bold text-white bg-blue-600/60 px-2 py-0.5 rounded">
                      {activePromoState.referralCode}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-blue-100">
                      <span>Evaluations Remaining:</span>
                      <span className="font-bold text-white">
                        {activePromoState.evaluationsRemaining} of {activePromoState.maxEvaluations}
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-blue-950/80 rounded-full h-2 overflow-hidden border border-blue-800/60">
                      <div
                        className="bg-emerald-400 h-full transition-all duration-500 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (activePromoState.evaluationsRemaining / (activePromoState.maxEvaluations || 15)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-blue-200/80 pt-1 border-t border-white/10">
                    <span>Valid Until:</span>
                    <span className="font-medium text-white">
                      {new Date(activePromoState.expiryDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              ) : (
                /* Redemption Form */
                <form onSubmit={handleRedeemPromo} className="space-y-3 pt-1">
                  {promoMessage && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-start gap-2.5 ${
                        promoMessage.type === 'success'
                          ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200'
                          : 'bg-rose-500/20 border border-rose-400/40 text-rose-200'
                      }`}
                    >
                      {promoMessage.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <span>{promoMessage.text}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Gift className="w-4 h-4 text-blue-300 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                        placeholder="ENTER PROMO CODE"
                        className="w-full pl-9 pr-3 py-2 text-sm uppercase font-mono font-bold bg-white/10 border border-white/20 text-white placeholder-blue-300/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isRedeemingPromo || !promoCodeInput.trim()}
                      className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      {isRedeemingPromo ? (
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>Apply Offer</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-blue-300/70">
                    * Limited to one redemption per student account. Valid for 30 days once redeemed.
                  </p>
                </form>
              )}
            </div>
          </div>

          {/* 2. CHANGE PASSWORD CARD */}
          <form
            onSubmit={handleChangePassword}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
          >
            <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Security & Password</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Update your student account login credentials</p>
              </div>
            </div>

            {passwordMessage && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                  passwordMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                {passwordMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{passwordMessage.text}</span>
              </div>
            )}

            {/* Current Password */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full pl-3 pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full pl-3 pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full pl-3 pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="w-full bg-slate-800 dark:bg-blue-600 hover:bg-slate-900 dark:hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {isSavingPassword ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>Update Password</span>
            </button>
          </form>

          {/* MULTI-FACTOR AUTHENTICATION & RECOVERY ARCHITECTURE CARD */}
          <MfaSecuritySettingsCard />

          {/* 3. EVALUATION CREDITS OVERVIEW CARD */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <CreditCard className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Credits & Plan Tier</h3>
              </div>
              <button
                type="button"
                onClick={onOpenCreditsModal}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition"
              >
                + Add Credits
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 space-y-2.5 border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Current Entitlement Tier:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {entitlement?.tier === 'PROMOTIONAL_AI30'
                    ? 'AI30 Special Promotion'
                    : entitlement?.tier === 'PERMANENT_FREE'
                    ? 'Permanent Access'
                    : entitlement?.tier === 'INSTITUTE_SPONSORED'
                    ? 'Institute Sponsored'
                    : entitlement?.tier === 'PURCHASED_CREDITS'
                    ? 'Purchased Credits'
                    : 'Free Starter Tier'}
                </span>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Monthly Free Evaluations:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {entitlement?.freeEvaluationsRemaining ?? 0}/2 remaining this month
                </span>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Paid Credits (Never Resets):</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {profile?.purchasedCredits || 0} credits
                </span>
              </div>

              <div className="flex justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700 font-semibold">
                <span className="text-slate-700 dark:text-slate-300">Total Evaluations Available:</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {(entitlement?.freeEvaluationsRemaining || 0) + (profile?.purchasedCredits || 0)} total
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <p>
                <strong>Evaluation Priority:</strong> Every month you get 2 free evaluations. The system automatically consumes free evaluations first, and only consumes paid credits after your monthly free evaluations are exhausted.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                * Monthly free evaluations reset on the 1st of each calendar month and do not carry forward. Paid credits remain safely stored in your account until used.
              </p>
            </div>
          </div>

          {/* 4. DANGER ZONE: DELETE ACCOUNT (Profile & Settings → Account & Security → Delete Account) */}
          <div
            id="student-delete-account-card"
            className="rounded-2xl border-2 border-dashed border-rose-200 dark:border-rose-900/70 bg-rose-50/30 dark:bg-rose-950/20 p-6 shadow-2xs space-y-4 relative overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-rose-200/70 dark:border-rose-900/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Danger Zone: Delete Account</span>
                    <span className="text-xs uppercase tracking-wider font-extrabold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                      Permanent
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Irreversible action • All student data will be purged
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Your account and associated personal data will be permanently deleted. This action cannot be undone.
            </p>

            <div className="p-3 bg-white/80 dark:bg-slate-900/80 border border-rose-200 dark:border-rose-900/50 rounded-xl space-y-1 text-xs text-rose-900 dark:text-rose-200">
              <div className="font-semibold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Permanent Data Purge</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-normal text-xs">
                Permanently removes all uploaded answer sheets, evaluation scorecards, personalized examiner DNA insights, and unconsumed credits.
              </p>
            </div>

            <button
              id="student-open-delete-modal-button"
              type="button"
              onClick={() => {
                setDeleteAccountError(null);
                setDeletePassword('');
                setDeleteEmailConfirm('');
                setDeleteConfirmationInput('');
                setShowDeleteModal(true);
              }}
              className="w-full py-2.5 px-4 bg-white dark:bg-slate-900 border-2 border-rose-300 dark:border-rose-800 hover:bg-rose-600 hover:text-white hover:border-rose-600 text-rose-700 dark:text-rose-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer focus:ring-2 focus:ring-rose-500 focus:outline-none"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Account &amp; Purge Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* DELETE ACCOUNT CONFIRMATION DIALOG */}
      {/* ============================================================ */}
      {showDeleteModal && (
        <div
          id="student-delete-account-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-delete-dialog-title"
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden text-slate-900 dark:text-white">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/30 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="student-delete-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">
                    Delete Student Account
                  </h3>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mt-0.5">
                    Clear Warning: This action cannot be undone
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDeletingAccount && setShowDeleteModal(false)}
                disabled={isDeletingAccount}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="p-5 sm:p-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 space-y-2">
                <p className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm">
                  Your account and associated personal data will be permanently deleted. This action cannot be undone.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Upon confirmation, the server will purge all your uploaded answer sheets, evaluation scorecards, step-marking breakdowns, personalized Examiner Profile &amp; Mark-Loss DNA insights, active sessions, and device tokens.
                </p>
              </div>

              {/* Statutory Notice */}
              <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-xl p-3 leading-relaxed">
                <span className="font-semibold text-amber-800 dark:text-amber-300">Statutory &amp; Tax Compliance: </span>
                Where legally required for financial accounting or statutory audit, minimum necessary payment transaction IDs are archived in an anonymized audit ledger without retaining personal profile access.
              </div>

              {/* Failure Error Display */}
              {deleteAccountError && (
                <div
                  id="delete-account-error-alert"
                  className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs space-y-1.5"
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>{deleteAccountError}</span>
                  </div>
                  <p className="text-[11px] pl-6 text-rose-700 dark:text-rose-300">
                    Account deletion could not be completed. Please try again or contact support:
                    <a
                      href="mailto:support@caexamcheckerai.com"
                      className="ml-1 underline font-bold hover:text-rose-900 dark:hover:text-rose-100"
                    >
                      support@caexamcheckerai.com
                    </a>
                  </p>
                </div>
              )}

              {/* Re-Authentication / Recent Authentication Input */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Verify Identity (Current Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="student-delete-account-password-field"
                    type={deleteShowPassword ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your current account password"
                    disabled={isDeletingAccount}
                    className="w-full pl-9 pr-10 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setDeleteShowPassword(!deleteShowPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {deleteShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Or confirm your registered account email address below:
                </p>
                <input
                  id="student-delete-account-email-confirm-field"
                  type="email"
                  value={deleteEmailConfirm}
                  onChange={(e) => setDeleteEmailConfirm(e.target.value)}
                  placeholder={profileData?.user?.email || authUser?.email || 'student@example.com'}
                  disabled={isDeletingAccount}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder-slate-400"
                />
              </div>

              {/* Explicit Confirmation Text Input: DELETE */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Explicit Confirmation: Type <span className="text-rose-600 dark:text-rose-400 font-mono font-black">DELETE</span> below:
                </label>
                <input
                  id="student-delete-account-confirmation-text-field"
                  type="text"
                  value={deleteConfirmationInput}
                  onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                  placeholder="DELETE"
                  disabled={isDeletingAccount}
                  autoComplete="off"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold tracking-wider text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder-slate-400"
                />
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingAccount}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="student-confirm-permanent-delete-btn"
                type="button"
                onClick={handleConfirmDeleteAccount}
                disabled={
                  isDeletingAccount ||
                  deleteConfirmationInput.trim() !== 'DELETE' ||
                  (!deletePassword.trim() && !deleteEmailConfirm.trim())
                }
                className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isDeletingAccount ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Purging Account Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete My Account Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { BrandLogo } from '../../components/common/BrandLogo';
import { Building2, Mail, Lock, User, Phone, MapPin, Globe, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../api/client.js';

interface PricingPlan {
  id: string;
  name: string;
  billingPeriod: 'MONTHLY' | 'ANNUAL';
  priceInr: number;
  originalPriceInr: number | null;
  evaluationAllowance: number;
  studentCapacity: number;
  isUnlimited: boolean;
  badge: string | null;
  benefits: string[];
}

export const InstituteAuthPage: React.FC<{ initialMode?: 'login' | 'register' }> = ({ initialMode = 'login' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { instituteLogin, instituteRegister, user, isAuthenticated } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'choose_plan'>(initialMode);
  const [billingPeriod, setBillingPeriod] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState<boolean>(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form
  const [instName, setInstName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdInstitute, setCreatedInstitute] = useState<any>(null);

  // Load database-driven plans for onboarding step
  const fetchPlans = async () => {
    try {
      setLoadingPlans(true);
      const res = await apiRequest<{ plans: PricingPlan[] }>('/api/pricing/plans');
      if (res && res.plans) {
        setPlans(res.plans);
        if (res.plans.length > 0) {
          setSelectedPlanId(res.plans[0].id);
        }
      }
    } catch (err) {
      console.warn('Could not load plans from database:', err);
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      const loggedIn = await instituteLogin(loginEmail, loginPassword);
      if (loggedIn.role === 'INSTITUTE_ADMIN' || loggedIn.role === 'SUPER_ADMIN') {
        navigate('/institute/dashboard', { replace: true });
      } else {
        navigate('/student/dashboard', { replace: true });
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Invalid institute email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (regPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await instituteRegister({
        instituteName: instName,
        contactPerson,
        email: regEmail,
        password: regPassword,
        phone,
        address: address || undefined,
        website: website || undefined,
      });

      setCreatedInstitute(res.institute);
      setMode('choose_plan');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Institute registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlanSelection = async (plan: PricingPlan) => {
    try {
      setIsLoading(true);
      setErrorMessage('');

      // Create order via /api/pricing/order
      const orderRes = await apiRequest<{
        orderId: string;
        razorpayOrderId: string;
        amountPaise: number;
        currency: string;
        keyId: string;
      }>('/api/pricing/order', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id }),
      });

      // If Razorpay SDK is available, trigger checkout; otherwise fulfill
      if (typeof window !== 'undefined' && (window as any).Razorpay && orderRes.keyId) {
        const rzp = new (window as any).Razorpay({
          key: orderRes.keyId,
          amount: orderRes.amountPaise,
          currency: orderRes.currency,
          name: 'CA Exam Checker AI',
          description: `Institute Plan: ${plan.name}`,
          order_id: orderRes.razorpayOrderId,
          handler: async (response: any) => {
            await apiRequest('/api/pricing/verify', {
              method: 'POST',
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                planId: plan.id,
              }),
            });
            navigate('/institute/dashboard', { replace: true });
          },
          prefill: {
            name: contactPerson || 'Institute Admin',
            email: regEmail,
            contact: phone,
          },
          theme: { color: '#2563eb' },
        });
        rzp.open();
      } else {
        // Fallback for preview/testing: auto-verify order
        await apiRequest('/api/pricing/verify', {
          method: 'POST',
          body: JSON.stringify({
            razorpayOrderId: orderRes.razorpayOrderId,
            razorpayPaymentId: `pay_preview_${Date.now()}`,
            razorpaySignature: 'preview_verified',
            planId: plan.id,
          }),
        });
        navigate('/institute/dashboard', { replace: true });
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to initialize plan checkout.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPlans = plans.filter((p) => p.billingPeriod === billingPeriod);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center px-4 py-12">
      {/* Brand Header */}
      <div className="mb-6 text-center">
        <BrandLogo variant="full" size="md" onClick={() => navigate('/')} />
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 text-xs font-semibold mt-3">
          <Building2 className="w-3.5 h-3.5" />
          <span>Coaching Institute & Academy Portal</span>
        </div>
      </div>

      {mode === 'choose_plan' ? (
        <div className="w-full max-w-4xl bg-slate-800 border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center max-w-xl mx-auto mb-8">
            <span className="px-3 py-1 rounded-full bg-blue-600/20 text-blue-400 font-bold text-xs border border-blue-500/30">
              Registration Complete • Step 2 of 2
            </span>
            <h2 className="text-2xl font-black tracking-tight text-white mt-3">
              Choose Your Institute Plan
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Select a flexible plan tailored for your student batch capacity and evaluation volume.
            </p>

            {/* Billing Period Toggle */}
            <div className="mt-5 inline-flex p-1 rounded-xl bg-slate-900/80 border border-slate-700">
              <button
                type="button"
                onClick={() => setBillingPeriod('MONTHLY')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                  billingPeriod === 'MONTHLY' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod('ANNUAL')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  billingPeriod === 'ANNUAL' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Annual Billing</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="mb-6 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 3 Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-xl border p-5 flex flex-col justify-between transition relative ${
                  plan.badge
                    ? 'bg-slate-800/90 border-blue-500/80 shadow-lg shadow-blue-500/10'
                    : 'bg-slate-900/60 border-slate-700 hover:border-slate-600'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold uppercase tracking-wide">
                    {plan.badge}
                  </span>
                )}

                <div>
                  <h3 className="text-base font-bold text-white">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-white">₹{plan.priceInr.toLocaleString('en-IN')}</span>
                    <span className="text-xs text-slate-400">/{billingPeriod === 'ANNUAL' ? 'year' : 'month'}</span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-700/60 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Evaluation Allowance:</span>
                      <strong className="text-blue-400">{plan.isUnlimited ? 'Unlimited' : `${plan.evaluationAllowance} papers`}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Student Capacity:</span>
                      <strong className="text-white">{plan.studentCapacity} active students</strong>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Features Included:</span>
                    {plan.benefits.map((b, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => handlePlanSelection(plan)}
                  className={`mt-6 w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    plan.badge
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  <span>Select {plan.name}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {/* Mode Tabs */}
          <div className="flex p-1 rounded-xl bg-slate-900/80 border border-slate-700 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage('');
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                mode === 'login' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Institute Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMessage('');
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                mode === 'register' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Register Institute
            </button>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Institute Administrator Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    placeholder="admin@academy.edu"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? 'Signing In...' : 'Sign In to Institute Portal'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Institute / Academy Name *</label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex CA Academy"
                    value={instName}
                    onChange={(e) => setInstName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Contact Person *</label>
                  <input
                    type="text"
                    required
                    placeholder="Prof. Sharma"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Official Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="contact@apexca.edu"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password * (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">City / State</label>
                  <input
                    type="text"
                    placeholder="New Delhi"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Website (Optional)</label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? 'Creating Institute Profile...' : 'Continue to Plan Selection →'}
              </button>
            </form>
          )}

          {/* Switch to Student Portal */}
          <div className="mt-6 pt-4 border-t border-slate-700/60 text-center text-xs text-slate-400">
            <span>Are you a CA Student? </span>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-blue-400 hover:text-blue-300 font-bold ml-1 underline cursor-pointer"
            >
              Go to Student Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

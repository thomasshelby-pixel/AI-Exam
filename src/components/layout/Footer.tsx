import React from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../common/BrandLogo';
import { FileCheck2, ShieldCheck, Mail, Instagram, ExternalLink, Award } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs sm:text-sm transition-colors duration-150">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 mb-8">
          {/* Brand & Mission */}
          <div className="md:col-span-2 space-y-3">
            <BrandLogo size="md" showSubtitle={true} onClick={() => onNavigate('landing')} />
            <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed max-w-md">
              India&apos;s dedicated AI evaluation and step-marking platform built for Chartered Accountancy candidates.
              Evaluates handwritten answer sheets against ICAI-aligned suggested answers, accounting standards, and statutory provisions.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <a
                href="mailto:caexamchecker.support@gmail.com"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
              >
                <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                caexamchecker.support@gmail.com
              </a>
              <a
                href="https://insta.openinapp.co/utw2r"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
              >
                <Instagram className="w-3.5 h-3.5 text-pink-500" />
                Instagram Support
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">Platform</h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button onClick={() => onNavigate('how-it-works')} className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer">
                  How AI Evaluation Works
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('pricing')} className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer">
                  Credit Pricing (₹10/Paper)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('reviews')} className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer">
                  Student Reviews & Feedback
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('how-it-works')} className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer">
                  ICAI MCQ Scoring Rules
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('contact')} className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer">
                  Academic Helpdesk
                </button>
              </li>
            </ul>
          </div>

          {/* Student Access */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">Account & Access</h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button onClick={() => onNavigate('login')} className="hover:text-blue-600 dark:hover:text-blue-400 transition font-medium cursor-pointer">
                  Student Sign In
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('login', { mode: 'register' } as unknown as string)} className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer">
                  Create Account (2 Free Checks)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('pricing')} className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer">
                  Buy Evaluation Credits
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('contact')} className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer">
                  Student Support Desk
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">Legal & Policies</h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link to="/terms" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/refund-policy" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                  Refund & Cancellation
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                  ICAI Non-Affiliation Notice
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Regulatory Disclaimer */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-3">
          <div className="flex items-start gap-2.5 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700/80 text-xs">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-slate-600 dark:text-slate-300">
              <strong className="text-slate-800 dark:text-white font-bold">ICAI Disclaimer:</strong> CA Exam Checker AI is an independent academic software technology
              and preparation aid. &ldquo;CA&rdquo; and &ldquo;ICAI&rdquo; are trademarks of The Institute of Chartered Accountants of India.
              This platform is not directly affiliated with, authorized, or endorsed by ICAI. All mock papers, suggested answers,
              and evaluation models are processed strictly for self-assessment and educational preparation.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-slate-500 dark:text-slate-400 text-xs">
            <p>&copy; {new Date().getFullYear()} CA Exam Checker AI. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
                <Award className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Trusted by CA Aspirants Across India
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

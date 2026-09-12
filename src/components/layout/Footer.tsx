import React from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../common/BrandLogo';
import { FileCheck2, ShieldCheck, Mail, Instagram, ExternalLink, Award } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-white border-t border-slate-200 text-slate-500 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 mb-8">
          {/* Brand & Mission */}
          <div className="md:col-span-2 space-y-3">
            <BrandLogo size="md" showSubtitle={true} onClick={() => onNavigate('landing')} />
            <p className="text-slate-600 text-xs leading-relaxed max-w-md">
              India&apos;s dedicated AI evaluation and step-marking platform built for Chartered Accountancy candidates.
              Evaluates handwritten answer sheets against ICAI-aligned suggested answers, accounting standards, and statutory provisions.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <a
                href="mailto:caexamchecker.support@gmail.com"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 transition"
              >
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                caexamchecker.support@gmail.com
              </a>
              <a
                href="https://insta.openinapp.co/utw2r"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 transition"
              >
                <Instagram className="w-3.5 h-3.5 text-pink-500" />
                Instagram Support
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Platform</h4>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button onClick={() => onNavigate('how-it-works')} className="hover:text-blue-600 transition">
                  How AI Evaluation Works
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('pricing')} className="hover:text-blue-600 transition">
                  Credit Pricing (₹10/Paper)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('how-it-works')} className="hover:text-blue-600 transition">
                  ICAI MCQ Scoring Rules
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('contact')} className="hover:text-blue-600 transition">
                  Academic Helpdesk
                </button>
              </li>
            </ul>
          </div>

          {/* Student Access */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Account & Access</h4>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button onClick={() => onNavigate('login')} className="hover:text-blue-600 transition font-medium">
                  Student Sign In
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('login', { mode: 'register' } as unknown as string)} className="hover:text-blue-600 transition">
                  Create Account (2 Free Checks)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('pricing')} className="hover:text-blue-600 transition">
                  Buy Evaluation Credits
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('contact')} className="hover:text-blue-600 transition">
                  Student Support Desk
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">Legal & Policies</h4>
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link to="/terms" className="hover:text-blue-600 transition">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="hover:text-blue-600 transition">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/refund-policy" className="hover:text-blue-600 transition">
                  Refund & Cancellation
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-blue-600 transition">
                  ICAI Non-Affiliation Notice
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Regulatory Disclaimer */}
        <div className="pt-6 border-t border-slate-200 text-xs text-slate-500 space-y-3">
          <div className="flex items-start gap-2 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-slate-800">ICAI Disclaimer:</strong> CA Exam Checker AI is an independent academic software technology
              and preparation aid. &ldquo;CA&rdquo; and &ldquo;ICAI&rdquo; are trademarks of The Institute of Chartered Accountants of India.
              This platform is not directly affiliated with, authorized, or endorsed by ICAI. All mock papers, suggested answers,
              and evaluation models are processed strictly for self-assessment and educational preparation.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-slate-500 text-xs">
            <p>&copy; {new Date().getFullYear()} CA Exam Checker AI. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                <Award className="w-3.5 h-3.5 text-blue-600" />
                Trusted by CA Aspirants Across India
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

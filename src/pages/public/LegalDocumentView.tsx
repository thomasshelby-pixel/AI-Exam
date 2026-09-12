import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Scale,
  FileText,
  RefreshCw,
  Printer,
  AlertTriangle,
  Mail,
  CheckCircle2,
  Instagram,
} from 'lucide-react';
import { LegalDocument, LegalSettings, LegalDocType } from '../../types/index.js';

interface LegalDocumentViewProps {
  activeDocType: LegalDocType;
}

export const LegalDocumentView: React.FC<LegalDocumentViewProps> = ({ activeDocType }) => {
  const navigate = useNavigate();
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [settings, setSettings] = useState<LegalSettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadLegalDoc() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/legal/published/${activeDocType}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch legal document`);
        const data = await res.json();
        if (isMounted) {
          if (data.success && data.document) {
            setDocument(data.document);
            setSettings(data.settings);
          } else {
            setError('Legal document is currently being updated. Please check back shortly.');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load document');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadLegalDoc();
    return () => {
      isMounted = false;
    };
  }, [activeDocType]);

  const handlePrint = () => {
    window.print();
  };

  const navTabs: Array<{ type: LegalDocType; label: string; path: string }> = [
    { type: 'TERMS', label: 'Terms of Service', path: '/terms' },
    { type: 'PRIVACY', label: 'Privacy Policy', path: '/privacy-policy' },
    { type: 'REFUND', label: 'Refund & Cancellation', path: '/refund-policy' },
  ];

  return (
    <div id="legal-document-view" className="min-h-screen bg-slate-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Navigation Breadcrumb & Header Action */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-blue-100 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-blue-700 mb-1">
              <span className="hover:text-blue-900 cursor-pointer font-medium" onClick={() => navigate('/')}>
                Home
              </span>
              <span className="text-blue-400">/</span>
              <span className="font-bold text-blue-950">Legal & Policies</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-red-700 tracking-tight">
              CA Exam Checker AI — Official Legal Documents
            </h1>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              aria-label="Print legal document"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-blue-200 bg-white text-xs font-semibold text-blue-800 hover:bg-blue-50 transition shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-700" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Document Selector Tabs */}
        <div className="flex flex-wrap gap-2 print:hidden">
          {navTabs.map((tab) => {
            const isActive = tab.type === activeDocType;
            return (
              <button
                key={tab.type}
                onClick={() => navigate(tab.path)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm border border-blue-600'
                    : 'bg-white border border-blue-200 text-blue-800 hover:text-blue-950 hover:bg-blue-50'
                }`}
              >
                {tab.type === 'TERMS' && <FileText className="w-4 h-4" />}
                {tab.type === 'PRIVACY' && <ShieldCheck className="w-4 h-4" />}
                {tab.type === 'REFUND' && <Scale className="w-4 h-4" />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ICAI Regulatory Non-Affiliation Notice */}
        <div className="p-4 sm:p-5 rounded-xl bg-blue-50/50 border border-blue-200 text-blue-900 space-y-2">
          <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>ICAI Trademark & Regulatory Non-Affiliation Notice</span>
          </div>
          <p className="text-xs text-blue-900 leading-relaxed">
            &ldquo;Chartered Accountant&rdquo;, &ldquo;CA&rdquo;, and &ldquo;ICAI&rdquo; are registered trademarks of The Institute of Chartered Accountants of India (ICAI).
            CA Exam Checker AI is an independent academic software technology built exclusively for formative educational preparation and candidate self-assessment.
            This platform is not affiliated with, authorized, certified, or endorsed by the Institute of Chartered Accountants of India.
            AI-assisted evaluation reports are indicative study aids and do not constitute official examination scores.
          </p>
        </div>

        {/* Content Box */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-blue-100 p-12 text-center shadow-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-xs font-semibold text-blue-800">Retrieving official published document...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 p-6 rounded-xl text-red-800 text-xs">
            {error}
          </div>
        ) : document ? (
          <div className="bg-white rounded-2xl border border-blue-100/90 shadow-xs overflow-hidden">
            {/* Document Header Metadata */}
            <div className="p-6 sm:p-8 border-b border-blue-100 bg-blue-50/30">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />
                  Official Version {document.version} (Active)
                </span>
                <span className="text-xs text-blue-700 font-medium">
                  Effective: <strong className="font-bold text-blue-950">{document.effective_date}</strong>
                  <span className="mx-2 text-blue-300">|</span>
                  Last Updated: <strong className="font-bold text-blue-950">{document.last_updated_date}</strong>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-red-700 tracking-tight">
                {document.title}
              </h2>
            </div>

            {/* Document Body Content */}
            <div className="p-6 sm:p-8 space-y-4 font-sans">
              {renderDocumentContent(document.content)}
            </div>

            {/* Contact & Support Section */}
            <div className="p-6 sm:p-8 border-t border-blue-100 bg-blue-50/40 space-y-4">
              <div className="flex items-center gap-2 text-red-700">
                <Mail className="w-5 h-5 text-red-600 shrink-0" />
                <h3 className="font-bold text-base sm:text-lg tracking-tight">Contact & Support</h3>
              </div>
              <p className="text-xs sm:text-sm text-blue-900 leading-relaxed">
                If you have any questions, inquiries, or require support regarding these legal policies or your account, please reach out to us directly through our official communication channels:
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Email Support */}
                <div className="p-4 bg-white rounded-xl border border-blue-200 shadow-xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-700">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-blue-950 uppercase tracking-wider">Email</p>
                    <a
                      href={`mailto:${settings?.support_email || 'caexamchecker.support@gmail.com'}`}
                      className="text-xs sm:text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline truncate block"
                    >
                      {settings?.support_email || 'caexamchecker.support@gmail.com'}
                    </a>
                  </div>
                </div>

                {/* Instagram Channel */}
                <div className="p-4 bg-white rounded-xl border border-blue-200 shadow-xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 text-blue-700">
                    <Instagram className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-blue-950 uppercase tracking-wider">Instagram</p>
                    <a
                      href={settings?.instagram_url || 'https://insta.openinapp.co/utw2r'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      <span>Instagram</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Bottom Quick Links to Other Policies */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-blue-700 border-t border-blue-100 print:hidden">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link to="/terms" className="hover:text-blue-950 font-medium transition">Terms of Service</Link>
            <span className="text-blue-300">&bull;</span>
            <Link to="/privacy-policy" className="hover:text-blue-950 font-medium transition">Privacy Policy</Link>
            <span className="text-blue-300">&bull;</span>
            <Link to="/refund-policy" className="hover:text-blue-950 font-medium transition">Refund & Cancellation</Link>
          </div>
          <p className="text-blue-600">&copy; 2026 CA Exam Checker AI. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Parses and formats legal document content to enforce strict visual color hierarchy:
 * - ALL section headings in RED
 * - ALL body / list content in BLUE
 * - Important terms / values in BOLD BLUE
 * - Clean clickable Email and Instagram links without exposing raw URLs
 */
function renderDocumentContent(content: string) {
  const blocks = content.split(/\n\n+/);

  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Skip document main title line if repeated at top (already rendered as H2)
        if (trimmed.startsWith('CA EXAM CHECKER AI —') && !trimmed.includes('\n')) {
          return null;
        }

        // Skip standalone Effective/Last updated lines (already rendered in metadata bar)
        if (
          (trimmed.startsWith('Effective Date:') || trimmed.startsWith('Last Updated:')) &&
          !trimmed.includes('\n\n')
        ) {
          return null;
        }

        // Check for numbered section headers (e.g., "1. ABOUT THE SERVICE", "14. GOVERNING LAW")
        const headingMatch = trimmed.match(/^(\d+\.\s+[A-Z\s&,/-]+)(?:\n([\s\S]*))?$/);
        if (headingMatch) {
          const headingText = headingMatch[1].trim();
          const restText = headingMatch[2] ? headingMatch[2].trim() : '';

          return (
            <div key={idx} className="pt-3 first:pt-0">
              <h3 className="text-red-700 font-bold text-base sm:text-lg tracking-tight mb-2 pb-1 border-b border-red-100/60">
                {headingText}
              </h3>
              {restText && renderParagraphOrList(restText)}
            </div>
          );
        }

        // Check for uppercase section headings without numbers
        if (
          trimmed.length < 80 &&
          !trimmed.includes('\n') &&
          /^[0-9A-Z\s&,.'"-]+$/.test(trimmed) &&
          !trimmed.startsWith('-')
        ) {
          return (
            <h3 key={idx} className="text-red-700 font-bold text-base tracking-tight pt-3 mb-1">
              {trimmed}
            </h3>
          );
        }

        return <div key={idx}>{renderParagraphOrList(trimmed)}</div>;
      })}
    </div>
  );
}

function renderParagraphOrList(text: string) {
  const lines = text.split('\n');

  return (
    <div className="space-y-2">
      {lines.map((line, lIdx) => {
        const lTrimmed = line.trim();
        if (!lTrimmed) return null;

        // Bullet point lines
        if (lTrimmed.startsWith('- ') || lTrimmed.startsWith('* ')) {
          return (
            <li key={lIdx} className="text-blue-900 text-xs sm:text-sm leading-relaxed list-disc list-inside ml-2">
              {formatInlineEmphasis(lTrimmed.replace(/^[-*]\s+/, ''))}
            </li>
          );
        }

        // Email line
        if (lTrimmed.toLowerCase().includes('caexamchecker.support@gmail.com')) {
          return (
            <p key={lIdx} className="text-blue-900 text-xs sm:text-sm leading-relaxed flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-blue-950">Email:</span>
              <a
                href="mailto:caexamchecker.support@gmail.com"
                className="text-blue-700 hover:text-blue-900 font-semibold underline"
              >
                caexamchecker.support@gmail.com
              </a>
            </p>
          );
        }

        // Instagram line
        if (lTrimmed.toLowerCase().includes('instagram')) {
          return (
            <p key={lIdx} className="text-blue-900 text-xs sm:text-sm leading-relaxed flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-blue-950">Instagram:</span>
              <a
                href="https://insta.openinapp.co/utw2r"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:text-blue-900 font-semibold underline"
              >
                Instagram
              </a>
            </p>
          );
        }

        return (
          <p key={lIdx} className="text-blue-900 text-xs sm:text-sm leading-relaxed">
            {formatInlineEmphasis(lTrimmed)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Highlights critical regulatory, contractual, and technical terms in BOLD BLUE.
 */
function formatInlineEmphasis(text: string) {
  const regex = /(CA Exam Checker AI|Terms of Service|Privacy Policy|Refund & Cancellation Policy|Institute of Chartered Accountants of India|ICAI|3 months|non-refundable|Razorpay|Laws of India|"Chartered Accountant"|"CA"|"ICAI"|"CA Exam Checker AI"|"Platform"|"we"|"us"|"our")/g;

  const parts = text.split(regex);
  if (parts.length === 1) {
    return text;
  }

  return parts.map((part, i) => {
    if (
      part === 'CA Exam Checker AI' ||
      part === 'Terms of Service' ||
      part === 'Privacy Policy' ||
      part === 'Refund & Cancellation Policy' ||
      part === 'Institute of Chartered Accountants of India' ||
      part === 'ICAI' ||
      part === '3 months' ||
      part === 'non-refundable' ||
      part === 'Razorpay' ||
      part === 'Laws of India' ||
      part.startsWith('"')
    ) {
      return (
        <strong key={i} className="font-bold text-blue-950">
          {part}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

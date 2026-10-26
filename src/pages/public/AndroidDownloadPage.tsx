import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileDown,
  Smartphone,
  PackageCheck,
  ShieldCheck,
  Settings2,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface AndroidAppMetadata {
  available: boolean;
  websiteName?: string;
  appName?: string;
  version?: string;
  fileName?: string;
  sizeBytes?: number;
  sizeLabel?: string;
  updatedAt?: string | null;
  downloadPath?: string;
  error?: string;
}

const INSTALL_STEPS = [
  {
    number: '01',
    title: 'Download the APK',
    description: 'Tap Download Now. Your browser will download the Exam Checker AI installation file.',
    icon: Download,
  },
  {
    number: '02',
    title: 'Open the downloaded file',
    description: 'When the download finishes, tap the notification or open the file from your Downloads folder.',
    icon: FileDown,
  },
  {
    number: '03',
    title: 'Allow installation if asked',
    description: 'If Android asks, allow your browser or file manager to install this app, then return to the installer.',
    icon: Settings2,
  },
  {
    number: '04',
    title: 'Install and open',
    description: 'Tap Install, wait for setup to finish, then tap Open to start using Exam Checker AI.',
    icon: PackageCheck,
  },
];

function formatUpdatedAt(value?: string | null): string {
  if (!value) return 'Latest available build';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Latest available build';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

export const AndroidDownloadPage: React.FC = () => {
  const [metadata, setMetadata] = useState<AndroidAppMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [metadataError, setMetadataError] = useState('');

  const loadMetadata = async () => {
    setLoading(true);
    setMetadataError('');
    try {
      const response = await fetch('/api/public/android-app', {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
      });
      const result = await response.json() as AndroidAppMetadata;
      if (!response.ok || !result.available) {
        throw new Error(result.error || 'The download is temporarily unavailable. Please try again shortly.');
      }
      setMetadata(result);
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : 'Could not load the latest app details.');
      setMetadata(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMetadata();
  }, []);

  const size = metadata?.sizeLabel || 'Official APK';
  const updatedAt = formatUpdatedAt(metadata?.updatedAt);

  return (
    <div className="relative isolate overflow-hidden bg-slate-950 text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-56 left-1/2 h-[34rem] w-[56rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute top-[32rem] -right-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.08)_1px,transparent_0)] [background-size:28px_28px]" />
      </div>

      <section className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-12 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CA Exam Checker AI
        </Link>

        <div className="mx-auto mt-8 grid max-w-5xl items-center gap-10 lg:mt-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200">
              <Smartphone className="h-3.5 w-3.5" />
              Official Android app
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Exam Checker AI
              <span className="mt-2 block bg-gradient-to-r from-blue-300 via-cyan-300 to-blue-500 bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl lg:text-4xl">
                for Android
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
              Take your answer-sheet evaluation companion with you. Download the official app directly from
              the CA Exam Checker AI website and install it on your Android device.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                <ShieldCheck className="h-4 w-4" />
                Official website download
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
                <FileDown className="h-4 w-4" />
                APK installation file
              </span>
            </div>

            {metadataError && (
              <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">App details could not be loaded</p>
                  <p className="mt-1 text-xs leading-5 text-amber-100/80">{metadataError}</p>
                  <button onClick={() => void loadMetadata()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-white underline underline-offset-4">
                    <RefreshCw className="h-3.5 w-3.5" /> Try again
                  </button>
                </div>
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={metadata?.available ? (metadata.downloadPath || '/api/public/download/android') : undefined}
                aria-disabled={!metadata?.available || loading}
                onClick={(event) => {
                  if (!metadata?.available || loading) event.preventDefault();
                }}
                className={`inline-flex min-h-14 items-center justify-center gap-3 rounded-xl px-6 py-4 text-sm font-extrabold shadow-lg transition focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 focus:ring-offset-slate-950 ${
                  metadata?.available && !loading
                    ? 'bg-blue-600 text-white shadow-blue-950/40 hover:-translate-y-0.5 hover:bg-blue-500'
                    : 'cursor-not-allowed bg-slate-700 text-slate-400'
                }`}
              >
                {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                <span>{loading ? 'Checking latest version…' : 'Download Now'}</span>
                {!loading && <ArrowRight className="h-4 w-4" />}
              </a>
              <a href="#installation" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-bold text-slate-200 transition hover:bg-white/10">
                Installation guide
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              The APK is delivered from this website. The downloaded filename is <span className="font-semibold text-slate-300">Exam Checker AI.apk</span>.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-blue-500/20 via-cyan-400/10 to-indigo-500/20 blur-2xl" />
            <div className="relative rounded-[2rem] border border-white/15 bg-slate-900/90 p-5 shadow-2xl shadow-blue-950/50 sm:p-7">
              <div className="flex items-center gap-4 border-b border-white/10 pb-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-300/30 bg-gradient-to-br from-blue-500 to-blue-800 shadow-lg shadow-blue-950/50">
                  <BookIcon />
                </div>
                <div>
                  <p className="text-lg font-extrabold text-white">Exam Checker AI</p>
                  <p className="mt-1 text-xs text-slate-400">Android application package</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Version</p>
                  <p className="mt-1 text-sm font-bold text-white">{metadata?.version || '0.1.0'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">File size</p>
                  <p className="mt-1 text-sm font-bold text-white">{loading ? 'Checking…' : size}</p>
                </div>
                <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Latest package</p>
                  <p className="mt-1 text-sm font-bold text-white">{loading ? 'Checking availability…' : updatedAt}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  'Student sign-in and profile',
                  'Answer-sheet submissions and status',
                  'Checked copies and detailed reports',
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    {feature}
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-blue-300/15 bg-blue-400/[0.06] p-3 text-xs leading-5 text-slate-400">
                Only install app packages downloaded from the official CA Exam Checker AI website.
              </div>
            </div>
          </div>
        </div>

        <section id="installation" className="mx-auto mt-16 max-w-5xl scroll-mt-24 sm:mt-20">
          <div className="mb-7 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Simple installation</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">From download to first launch</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Follow these steps on your Android phone after the APK download begins.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {INSTALL_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.number} className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:border-blue-400/40 hover:bg-blue-400/[0.05] sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-500/15 text-blue-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.16em] text-cyan-300">STEP {step.number}</p>
                      <h3 className="mt-1 text-base font-extrabold text-white">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{step.description}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/70 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <p className="font-bold text-white">Need help installing?</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Contact support if the download fails or the installer cannot open the APK.</p>
            </div>
            <a href="mailto:support@caexamcheckerai.com" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-300 hover:text-blue-200 sm:mt-0">
              Contact support <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </section>

        <div className="mx-auto mt-12 max-w-5xl border-t border-white/10 pt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Return to CA Exam Checker AI
          </Link>
        </div>
      </section>
    </div>
  );
};

const BookIcon: React.FC = () => (
  <svg viewBox="0 0 48 48" className="h-10 w-10" role="img" aria-label="Exam Checker AI app icon">
    <path d="M24 8 19 11 7 17v20c6-1 12 0 17 4 5-4 11-5 17-4V17L24 8Z" fill="#fff" />
    <path d="M7 17c6-2 12 0 17 4v20c-5-4-11-5-17-4V17Z" fill="#dbeafe" />
    <path d="M41 17c-6-2-12 0-17 4v20c5-4 11-5 17-4V17Z" fill="#eff6ff" />
    <path d="m16 22 5 5 12-13" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

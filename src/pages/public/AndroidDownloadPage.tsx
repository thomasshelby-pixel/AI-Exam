import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import {
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
  LayoutDashboard,
  Camera,
  ClipboardCheck,
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
    title: 'Visit the website',
    description: 'Open CA Exam Checker AI in your Android phone browser.',
    icon: Smartphone,
  },
  {
    number: '02',
    title: 'Choose Android App',
    description: 'Open the dedicated app download page from the website navigation.',
    icon: ArrowRight,
  },
  {
    number: '03',
    title: 'Tap Download Now',
    description: 'The official Exam Checker AI APK downloads to your device.',
    icon: Download,
  },
  {
    number: '04',
    title: 'Open the downloaded APK',
    description: 'Tap the download notification or open the APK from your Downloads folder.',
    icon: FileDown,
  },
  {
    number: '05',
    title: 'Allow installation if prompted',
    description: 'If Android asks, allow your browser or file manager to install this app, then return to the installer.',
    icon: Settings2,
  },
  {
    number: '06',
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
  const [downloadQrDataUrl, setDownloadQrDataUrl] = useState('');

  const loadMetadata = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    let active = true;
    setDownloadQrDataUrl('');

    const latestApkPath = metadata?.available && metadata.downloadPath
      ? metadata.downloadPath
      : '/api/public/download/android';
    const downloadTarget = new URL(latestApkPath, window.location.origin).toString();

    QRCode.toDataURL(downloadTarget, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setDownloadQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setDownloadQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [metadata?.available, metadata?.downloadPath]);

  const size = metadata?.sizeLabel || 'Official APK';
  const updatedAt = formatUpdatedAt(metadata?.updatedAt);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-56 left-1/2 h-[34rem] w-[56rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute top-[32rem] -right-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.08)_1px,transparent_0)] [background-size:28px_28px]" />
      </div>

      <section className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-12 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CA Exam Checker AI
        </Link>

        <div className="mx-auto mt-8 grid max-w-5xl items-center gap-10 lg:mt-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200">
              <Smartphone className="h-3.5 w-3.5" />
              Official Android app
            </div>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
              Exam Checker AI
              <span className="mt-2 block bg-gradient-to-r from-blue-300 via-cyan-300 to-blue-500 bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl lg:text-4xl">
                for Android
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-700 dark:text-slate-300 sm:text-base">
              Take your answer-sheet evaluation companion with you. Download the official app directly from
              the CA Exam Checker AI website and install it on your Android device.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                <ShieldCheck className="h-4 w-4" />
                Official website download
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                <FileDown className="h-4 w-4" />
                APK installation file
              </span>
            </div>

            {metadataError && (
              <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">App details could not be loaded</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-100/80">{metadataError}</p>
                  <button onClick={() => void loadMetadata()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 underline underline-offset-4 dark:text-white">
                    <RefreshCw className="h-3.5 w-3.5" /> Try again
                  </button>
                </div>
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {/* Keep the download action independent of the metadata lookup. If metadata is
                  temporarily unavailable, students can still try the real APK endpoint. */}
              <a
                href={metadata?.available ? (metadata.downloadPath || '/api/public/download/android') : '/api/public/download/android'}
                download="Exam Checker AI.apk"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-blue-600 px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 focus:ring-offset-slate-50 dark:shadow-blue-950/40 dark:focus:ring-offset-slate-950"
              >
                {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                <span>Download Now</span>
                <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#installation" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-800 transition hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">
                Installation guide
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-400">
              The APK is delivered from this website. The downloaded filename is <span className="font-semibold text-slate-800 dark:text-slate-300">Exam Checker AI.apk</span>.
            </p>

          </div>

          <div className="relative mx-auto w-full max-w-md space-y-4">
            <div className="pointer-events-none absolute -inset-4 z-0 rounded-[2rem] bg-gradient-to-br from-blue-500/20 via-cyan-400/10 to-indigo-500/20 blur-2xl" />
            <div className="relative z-10 hidden items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white p-2 shadow-inner">
                {downloadQrDataUrl ? (
                  <img
                    src={downloadQrDataUrl}
                    alt="QR code that downloads the latest official Exam Checker AI Android APK"
                    className="h-full w-full"
                    width={220}
                    height={220}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-500">
                    <Smartphone className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">Scan to Download on Phone</p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">
                  Open your phone camera and scan to download the current official APK directly.
                </p>
                <p className="mt-2 text-[10px] font-semibold text-blue-700 dark:text-cyan-300">
                  Latest published Android version
                </p>
              </div>
            </div>

            <div className="relative z-10 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 dark:border-white/15 dark:bg-slate-900 dark:shadow-blue-950/50 sm:p-7">
              <div className="flex items-center gap-4 border-b border-slate-200 pb-5 dark:border-white/10">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-300/30 bg-gradient-to-br from-blue-500 to-blue-800 shadow-lg shadow-blue-950/50">
                  <BookIcon />
                </div>
                <div>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">Exam Checker AI</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Android application package</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Version</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{metadata?.version || '0.1.0'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">File size</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{loading ? 'Checking…' : size}</p>
                </div>
                <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Latest package</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{loading ? 'Checking availability…' : updatedAt}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  'Student sign-in and profile',
                  'Answer-sheet submissions and status',
                  'Checked copies and detailed reports',
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    {feature}
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800 dark:border-blue-300/15 dark:bg-blue-400/[0.06] dark:text-slate-400">
                Only install app packages downloaded from the official CA Exam Checker AI website.
              </div>
            </div>
          </div>
        </div>

        <section aria-labelledby="app-workflow-preview-title" className="mx-auto mt-16 max-w-5xl sm:mt-20">
          <div className="mb-7 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-800 dark:text-cyan-300">App experience</p>
            <h2 id="app-workflow-preview-title" className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Your exam workflow, on your phone
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Illustrative previews of the core student workflows available through CA Exam Checker AI.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                title: 'Student dashboard',
                caption: 'Account, evaluations and credits',
                icon: LayoutDashboard,
                accent: 'from-blue-500/25 to-indigo-500/10',
                rows: ['Evaluation history', 'Free checks remaining', 'Recent results'],
              },
              {
                title: 'Answer-sheet upload',
                caption: 'Submit your handwritten paper',
                icon: Camera,
                accent: 'from-cyan-500/25 to-blue-500/10',
                rows: ['Choose your CA paper', 'Add answer-sheet PDF', 'Review before submit'],
              },
              {
                title: 'Checked copy',
                caption: 'Review marks and feedback',
                icon: ClipboardCheck,
                accent: 'from-emerald-500/25 to-teal-500/10',
                rows: ['Question-wise marks', 'Examiner remarks', 'Checked PDF'],
              },
            ].map((screen) => {
              const Icon = screen.icon;
              return (
                <article key={screen.title} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-slate-900">
                  <div className={`mx-auto w-full max-w-[220px] rounded-[2rem] border border-white/15 bg-gradient-to-br ${screen.accent} p-2 shadow-xl`}>
                    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950 px-3 pb-4 pt-3">
                      <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-700" />
                      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-200">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[10px] font-extrabold text-white">Exam Checker AI</p>
                          <p className="text-[8px] text-slate-400">Student portal</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                        <p className="text-[9px] font-bold text-slate-200">{screen.title}</p>
                        <p className="mt-1 text-[8px] leading-4 text-slate-400">{screen.caption}</p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {screen.rows.map((row, index) => (
                          <div key={row} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500/15 text-[8px] font-bold text-blue-200">{index + 1}</span>
                            <span className="text-[8px] font-medium text-slate-300">{row}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 h-1 rounded-full bg-slate-800">
                        <div className="h-1 w-2/3 rounded-full bg-blue-500" />
                      </div>
                    </div>
                  </div>
                  <h3 className="mt-4 text-center text-sm font-extrabold text-slate-900 dark:text-white">{screen.title}</h3>
                  <p className="mt-1 text-center text-xs text-slate-600 dark:text-slate-400">{screen.caption}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="installation" className="mx-auto mt-16 max-w-5xl scroll-mt-24 sm:mt-20">
          <div className="mb-7 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-800 dark:text-cyan-300">Simple installation</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">From download to first launch</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Follow these steps on your Android phone after the APK download begins.
            </p>
          </div>
          <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3 dark:border-white/10 dark:bg-slate-900 dark:shadow-blue-950/30">
            <img
              src={`${import.meta.env.BASE_URL}android-installation-guide.svg`}
              alt="CA Exam Checker AI website and Exam Checker AI Android app: six steps from opening the download page to installing and launching the app."
              width={1200}
              height={840}
              loading="lazy"
              className="h-auto w-full rounded-xl"
            />
            <figcaption className="px-2 pb-2 pt-3 text-center text-xs leading-5 text-slate-600 dark:text-slate-400">
              Website: CA Exam Checker AI · Android app: Exam Checker AI
            </figcaption>
          </figure>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INSTALL_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.number} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:bg-blue-50 sm:p-6 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-blue-400/40 dark:hover:bg-blue-400/[0.05]">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-300/20 dark:bg-blue-500/15 dark:text-blue-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.16em] text-cyan-800 dark:text-cyan-300">STEP {step.number}</p>
                      <h3 className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{step.description}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 dark:border-white/10 dark:bg-slate-900">
            <div>
              <p className="font-bold text-slate-900 dark:text-white">Need help installing?</p>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">Contact support if the download fails or the installer cannot open the APK.</p>
            </div>
            <a href="mailto:support@caexamcheckerai.com" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 sm:mt-0">
              Contact support <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </section>

        <div className="mx-auto mt-12 max-w-5xl border-t border-slate-200 pt-6 text-center dark:border-white/10">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
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

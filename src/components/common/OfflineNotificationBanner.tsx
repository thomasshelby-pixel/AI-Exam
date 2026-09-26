import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, ShieldAlert, Sparkles, HardDriveDownload } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus.js';

interface OfflineNotificationBannerProps {
  className?: string;
  onRetrySuccess?: () => void;
}

export const OfflineNotificationBanner: React.FC<OfflineNotificationBannerProps> = ({
  className = '',
  onRetrySuccess,
}) => {
  const { isOnline, isOffline, wasOffline, isChecking, checkConnection, resetWasOffline } = useNetworkStatus();
  const [reconnectedMessageVisible, setReconnectedMessageVisible] = useState(false);

  useEffect(() => {
    if (isOnline && wasOffline) {
      setReconnectedMessageVisible(true);
      if (onRetrySuccess) {
        onRetrySuccess();
      }
      const timer = setTimeout(() => {
        setReconnectedMessageVisible(false);
        resetWasOffline();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, onRetrySuccess, resetWasOffline]);

  const handleRetry = async () => {
    const success = await checkConnection();
    if (success && onRetrySuccess) {
      onRetrySuccess();
    }
  };

  if (!isOffline && !reconnectedMessageVisible) {
    return null;
  }

  // Show temporary "Back Online" affirmation when connection restored
  if (reconnectedMessageVisible) {
    return (
      <aside
        role="status"
        aria-live="polite"
        className={`w-full bg-emerald-600 dark:bg-emerald-700 text-white rounded-xl shadow-md border border-emerald-500 p-4 transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/40 rounded-lg flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-bold text-white flex items-center gap-1.5">
                Internet Connection Restored
              </p>
              <p className="text-xs text-emerald-100">
                You are back online. Synchronizing evaluation trends, credits, and answer sheets.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setReconnectedMessageVisible(false);
              resetWasOffline();
            }}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-lg transition"
          >
            Dismiss
          </button>
        </div>
      </aside>
    );
  }

  // Active Offline Notification
  return (
    <aside
      role="alert"
      aria-live="assertive"
      className={`w-full bg-amber-500/10 dark:bg-amber-950/40 border border-amber-400/40 dark:border-amber-600/40 text-amber-900 dark:text-amber-200 rounded-xl p-4 shadow-sm transition-all duration-300 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-2.5 bg-amber-500/20 dark:bg-amber-500/30 rounded-xl text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5 sm:mt-0">
            <WifiOff className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                You are currently offline
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                Offline Mode
              </span>
            </div>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-1 leading-relaxed">
              Essential static assets and cached resources remain available via the Service Worker.
              New answer sheet uploads, live AI evaluations, and credit purchases will resume when your connection is restored.
            </p>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
              <HardDriveDownload className="w-3.5 h-3.5" />
              <span>CA curriculum, examiner criteria, and dashboard assets are saved locally for offline review.</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
          <button
            onClick={handleRetry}
            disabled={isChecking}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Checking...' : 'Check Connection'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

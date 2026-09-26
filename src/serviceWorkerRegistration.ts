import { registerSW } from 'virtual:pwa-register';

export function registerAppServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          console.info('[PWA Service Worker] New static assets available. Ready to refresh.');
        },
        onOfflineReady() {
          console.info('[PWA Service Worker] Essential static assets cached for offline operation.');
        },
        onRegisteredSW(swUrl, registration) {
          console.info('[PWA Service Worker] Successfully registered at:', swUrl, registration?.scope);
        },
        onRegisterError(error) {
          console.warn('[PWA Service Worker] Registration encountered error:', error);
        },
      });

      return updateSW;
    } catch (err) {
      console.warn('[PWA Service Worker] Failed to invoke registerSW:', err);
    }
  }
  return () => {};
}

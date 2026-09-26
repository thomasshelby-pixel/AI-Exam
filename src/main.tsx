import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { registerAppServiceWorker } from './serviceWorkerRegistration.js';
import './index.css';

// Initialize Service Worker for caching essential static assets and offline support
registerAppServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

const root = createRoot(rootElement, {
  onRecoverableError(error, errorInfo) {
    // Gracefully capture and log recoverable errors without triggering window.reportError
    console.warn('[React Recoverable Error]', error, errorInfo);
  },
});

root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);


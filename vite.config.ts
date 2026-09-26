import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function suppressViteHmrNoisePlugin(): Plugin {
  return {
    name: 'suppress-vite-hmr-noise',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            children: `
(function() {
  try {
    var OrigWS = window.WebSocket;
    if (OrigWS) {
      window.WebSocket = function(url, protocols) {
        if (typeof url === 'string' && (url.indexOf('token=') !== -1 || url.indexOf('vite') !== -1 || url.indexOf('3000') !== -1)) {
          return {
            send: function() {},
            close: function() {},
            addEventListener: function() {},
            removeEventListener: function() {},
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            readyState: 3,
            CLOSED: 3,
            CLOSING: 2,
            CONNECTING: 0,
            OPEN: 1
          };
        }
        return new OrigWS(url, protocols);
      };
      window.WebSocket.prototype = OrigWS.prototype;
      window.WebSocket.CONNECTING = 0;
      window.WebSocket.OPEN = 1;
      window.WebSocket.CLOSING = 2;
      window.WebSocket.CLOSED = 3;
    }

    var isViteWs = function(a) {
      if (!a) return false;
      try {
        var s = '';
        for (var i = 0; i < a.length; i++) {
          var v = a[i];
          if (typeof v === 'string') s += v + ' ';
          else if (v && typeof v.message === 'string') s += v.message + ' ';
          else if (v && typeof v.stack === 'string') s += v.stack + ' ';
        }
        return s.indexOf('[vite]') !== -1 || s.indexOf('WebSocket') !== -1 || s.indexOf('ws:') !== -1 || s.indexOf('wss:') !== -1;
      } catch(e) { return false; }
    };

    ['log', 'warn', 'error', 'info', 'debug'].forEach(function(m) {
      var orig = console[m];
      if (orig) {
        console[m] = function() {
          if (isViteWs(arguments)) return;
          orig.apply(console, arguments);
        };
      }
    });

    window.addEventListener('error', function(e) {
      var msg = (e && (e.message || (e.error && e.error.message))) || '';
      var fn = (e && e.filename) || '';
      if (
        (typeof msg === 'string' && (msg.indexOf('[vite]') !== -1 || msg.indexOf('WebSocket') !== -1)) ||
        (typeof fn === 'string' && fn.indexOf('@vite/client') !== -1)
      ) {
        e.stopImmediatePropagation && e.stopImmediatePropagation();
        e.preventDefault && e.preventDefault();
        return true;
      }
    }, true);

    window.addEventListener('unhandledrejection', function(e) {
      var r = e && e.reason;
      var msg = (r && (r.message || r.stack || r)) || '';
      if (typeof msg === 'string' && (msg.indexOf('[vite]') !== -1 || msg.indexOf('WebSocket') !== -1)) {
        e.stopImmediatePropagation && e.stopImmediatePropagation();
        e.preventDefault && e.preventDefault();
      }
    }, true);
  } catch(e) {}
})();
`,
          },
        ];
      },
    },
  };
}

export default defineConfig(() => {
  // GitHub Pages serves this project from /AI-Exam/ in CI/GitHub Actions, while local dev & AI Studio preview run at /
  const isGitHubPages = process.env.GITHUB_ACTIONS === 'true' || process.env.GITHUB_PAGES === 'true';

  return {
    base: isGitHubPages ? '/AI-Exam/' : '/',
    plugins: [
      suppressViteHmrNoisePlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'logo.svg',
          'logo-dark.svg',
          'mcq-arena-official-logo.svg',
        ],
        manifest: {
          id: '/',
          name: 'CA Exam Checker AI',
          short_name: 'CAExamAI',
          description:
            'Professional AI-powered examination evaluation platform for CA Foundation, Intermediate, and Final answer sheets with step marking, standards audit compliance, and institute management.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/logo.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB to support full application bundle precaching
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'static-image-assets-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio preview environment
      hmr: false,
      watch: null,
    },
  };
});

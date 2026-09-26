import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('========================================================================');
console.log('--- TEST SUITE: PWA SERVICE WORKER & OFFLINE NOTIFICATION BANNER ---');
console.log('========================================================================');

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      passed++;
      console.log(`[PASS] Test ${total}: ${name}`);
    } catch (err: any) {
      console.error(`[FAIL] Test ${total}: ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  // 1. Static Assets Verification
  console.log('\n>>> SECTION 1: ESSENTIAL STATIC ASSETS VERIFICATION');

  test('Public essential static assets exist for service worker precaching', () => {
    const publicDir = path.resolve('public');
    assert(fs.existsSync(path.join(publicDir, 'favicon.svg')), 'favicon.svg must exist');
    assert(fs.existsSync(path.join(publicDir, 'logo.svg')), 'logo.svg must exist');
    assert(fs.existsSync(path.join(publicDir, 'logo-dark.svg')), 'logo-dark.svg must exist');
    assert(fs.existsSync(path.join(publicDir, 'mcq-arena-official-logo.svg')), 'mcq-arena-official-logo.svg must exist');
  });

  // 2. Vite PWA & Workbox Configuration Verification
  console.log('\n>>> SECTION 2: VITE PWA & WORKBOX CONFIGURATION');

  test('vite.config.ts configures VitePWA with autoUpdate and essential static precaching', () => {
    const configPath = path.resolve('vite.config.ts');
    const content = fs.readFileSync(configPath, 'utf8');

    assert(content.includes('VitePWA('), 'VitePWA plugin must be registered');
    assert(content.includes("registerType: 'autoUpdate'"), 'registerType must be autoUpdate');
    assert(content.includes('favicon.svg'), 'includeAssets must include favicon.svg');
    assert(content.includes('logo.svg'), 'includeAssets must include logo.svg');
    assert(content.includes('maximumFileSizeToCacheInBytes'), 'maximumFileSizeToCacheInBytes must be configured');
    assert(content.includes('globPatterns: [\'**/*.{js,css,html,ico,png,svg,woff,woff2}\']'), 'globPatterns must match static bundle extensions');
    assert(content.includes('devOptions:'), 'devOptions must be present for AI Studio preview');
  });

  test('index.html contains compliant PWA meta tags and theme color', () => {
    const indexPath = path.resolve('index.html');
    const content = fs.readFileSync(indexPath, 'utf8');

    assert(content.includes('<meta name="theme-color"'), 'theme-color meta tag must exist');
    assert(content.includes('<meta name="mobile-web-app-capable" content="yes" />'), 'mobile-web-app-capable must be yes');
    assert(content.includes('<meta name="apple-mobile-web-app-capable" content="yes" />'), 'apple-mobile-web-app-capable must be yes');
    assert(content.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'), 'favicon link must exist');
  });

  // 3. Service Worker Registration & Client Hook
  console.log('\n>>> SECTION 3: SERVICE WORKER REGISTRATION & CLIENT HOOK');

  test('src/serviceWorkerRegistration.ts provides clean registerAppServiceWorker utility', () => {
    const swRegPath = path.resolve('src/serviceWorkerRegistration.ts');
    assert(fs.existsSync(swRegPath), 'serviceWorkerRegistration.ts must exist');
    const content = fs.readFileSync(swRegPath, 'utf8');

    assert(content.includes('virtual:pwa-register'), 'must import from virtual:pwa-register');
    assert(content.includes('registerAppServiceWorker'), 'must export registerAppServiceWorker');
    assert(content.includes('onOfflineReady'), 'must handle onOfflineReady event');
  });

  test('src/main.tsx invokes registerAppServiceWorker on startup', () => {
    const mainPath = path.resolve('src/main.tsx');
    const content = fs.readFileSync(mainPath, 'utf8');

    assert(content.includes('registerAppServiceWorker'), 'main.tsx must call registerAppServiceWorker()');
  });

  // 4. Offline Notification Banner in Student Dashboard
  console.log('\n>>> SECTION 4: STUDENT DASHBOARD OFFLINE NOTIFICATION');

  test('OfflineNotificationBanner component provides explicit "You are currently offline" alert', () => {
    const bannerPath = path.resolve('src/components/common/OfflineNotificationBanner.tsx');
    assert(fs.existsSync(bannerPath), 'OfflineNotificationBanner.tsx must exist');
    const content = fs.readFileSync(bannerPath, 'utf8');

    assert(content.includes('You are currently offline'), 'Must contain the required text "You are currently offline"');
    assert(content.includes('Check Connection'), 'Must provide a connection check / retry button');
    assert(content.includes('useNetworkStatus'), 'Must use reactive network status hook');
    assert(content.includes('Internet Connection Restored'), 'Must provide affirmative reconnection notification');
  });

  test('StudentDashboard.tsx integrates and renders OfflineNotificationBanner', () => {
    const dashPath = path.resolve('src/pages/student/StudentDashboard.tsx');
    const content = fs.readFileSync(dashPath, 'utf8');

    assert(content.includes('OfflineNotificationBanner'), 'StudentDashboard must import OfflineNotificationBanner');
    assert(content.includes('<OfflineNotificationBanner'), 'StudentDashboard must render OfflineNotificationBanner');
  });

  console.log('========================================================================');
  console.log(`✅ ALL ${passed} / ${total} PWA SERVICE WORKER & OFFLINE TESTS PASSED!`);
  console.log('========================================================================\n');
}

runTests().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});

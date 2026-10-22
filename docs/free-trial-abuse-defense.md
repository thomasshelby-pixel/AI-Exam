# Free-Trial Abuse Protection

This change adds an anti-bot gate to student registration, hardens the request IP used by the existing rate limiters, and protects local suspension records from a stale reactivation row.

## What this does

- **Cloudflare Turnstile** is shown during student account creation. The API verifies each single-use token against Cloudflare Siteverify before it sends the email OTP or creates a pending account. The server secret is never returned to the browser.
- **Signup fails closed in production** while Turnstile is enabled but not configured. Existing login and email OTP verification flows are unchanged.
- **Registration IP limits use Express's resolved `req.ip`**, not a client-supplied `X-Forwarded-For` value. The Express proxy-hop setting must match the real hosting proxy chain.
- **Existing gates remain in place:** the same ICAI SRN cannot be registered twice; exact reuse of a prior answer-sheet PDF across NORMAL free/promo accounts is rejected before an evaluation credit is consumed; existing signup and OTP rate limits continue to apply.
- **Suspension recovery:** a Firestore `REINSTATED` row with an older/missing timestamp will not overwrite a newer locally stored `SUSPENDED` row during hydration. Explicitly newer admin reactivation is allowed.

Turnstile stops automated/bot-driven signups. It is **not** SMS verification or proof of identity; a determined human may still create accounts with different email/SRN details. There is no honest way to guarantee that every bypass is impossible. Stronger identity proof (for example, verified phone ownership or ICAI identity checks) remains a separate product and cost decision.

## Configure Turnstile before production deploy

1. In Cloudflare Dashboard, open **Turnstile** and create a **Managed** widget for your production hostnames. Include the hostname students actually use, for example `caexamcheckerai.com` and, if needed, the Firebase App Hosting hostname `caexamcheckerai-prod--gen-lang-client-0211426234.asia-southeast1.hosted.app`.
2. Copy the **Site key** to the Firebase App Hosting runtime variable `TURNSTILE_SITE_KEY`.
3. Add the **Secret key** as a server-side Firebase App Hosting secret named `TURNSTILE_SECRET_KEY`. Never put it in Vite variables, browser JavaScript, GitHub, or `apphosting.yaml` as a plain value.
4. Set `TURNSTILE_REQUIRED=true`. Optionally set `TURNSTILE_ALLOWED_HOSTNAMES=caexamcheckerai.com,caexamcheckerai-prod--gen-lang-client-0211426234.asia-southeast1.hosted.app` to pin the Siteverify response hostname. Use the exact hostnames configured in the widget.
5. Confirm `TRUST_PROXY_HOPS` matches the real ingress chain. The app defaults to one trusted proxy hop in production and zero locally. If the site is additionally proxied through Cloudflare, verify the exact chain rather than blindly increasing this number; incorrect trust can either hide the visitor IP or allow spoofing.
6. Deploy, then test registration with a real browser challenge. Confirm that a missing/invalid Turnstile token is rejected by `POST /api/auth/register` and that ordinary email/password login still works.

If the production keys have not been added, the signup form deliberately displays that security setup is incomplete and keeps registration disabled. **Do not merge/deploy until the keys are configured**, or signup will remain paused.

## Add Cloudflare edge rate limits (recommended)

The in-memory Express limiter is per process and is not a distributed quota across all App Hosting instances. If the public hostname is proxied through Cloudflare, add WAF **Rate limiting rules** at the edge for:

- `POST /api/auth/register`: start conservatively (for example, 5 requests per IP over 10 minutes); allow for students sharing a campus, library, hostel, or coaching-centre network.
- `POST /api/auth/resend-otp`: limit repeated resend requests more tightly.
- `POST /api/auth/verify-otp`: cap bursts of OTP guessing.

Tune based on real signup patterns and use managed challenge/block responses appropriately. Edge rules only protect traffic that actually passes through the Cloudflare proxy; DNS-only traffic won't hit those rules. Turnstile's Siteverify step works independently of DNS proxy status.

## Regression tests

`npm run test:protected:ci` now includes tests for:
- Turnstile missing/invalid/unavailable token paths and allowed host/action checks,
- stale suspension reactivation protection, and
- spoofed `X-Forwarded-For` not bypassing IP rate limits.

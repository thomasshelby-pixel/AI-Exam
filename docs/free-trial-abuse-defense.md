# Free-Trial Abuse Protection

This change adds an anti-bot gate to student registration, hardens the request IP used by the existing rate limiters, and protects local suspension records from a stale reactivation row.

## What this does

- **Cloudflare Turnstile** is shown during student account creation. The API verifies each single-use token against Cloudflare Siteverify before it sends the email OTP or creates a pending account. The server secret is never returned to the browser.
- **Signup fails closed in production** while Turnstile is enabled but not configured. Existing login and email OTP verification flows are unchanged.
- **Registration IP limits use Express's resolved `req.ip`**, not a client-supplied `X-Forwarded-For` value. The Express proxy-hop setting must match the real hosting proxy chain.
- **Existing gates remain in place:** the same ICAI SRN cannot be registered twice; exact reuse of a prior answer-sheet PDF across NORMAL free/promo accounts is rejected before an evaluation credit is consumed; existing signup and OTP rate limits continue to apply.
- **Global ICAI identity claim:** after email OTP verification, a transactionally unique Firestore claim is keyed by a hash of the seven numeric SRN digits, so exact duplicates and regional-prefix variants collide across separate App Hosting instances. It also checks for exact matches in legacy student profile documents before allowing a claim. Production registration fails closed if the global claim store cannot be reached.
- **One free-trial claim per browser/device:** a signed `HttpOnly` cookie and (when available) the app's persistent client device ID are hashed with a stable server secret and claimed transactionally in Firestore. A repeat signup from a claimed browser/device may create an account, but it does not receive the monthly free-evaluation allowance or registration promo benefits. The eligibility flag is persisted and monthly resets do not restore a denied trial.
- **Shared networks are not hard-blocked:** IP is used by the existing rate limiter/edge protection only; the free-trial claim does not treat one IP address as one person. This avoids blocking unrelated students at a hostel, coaching centre, library, office, or household.
- **Suspension recovery:** a Firestore `REINSTATED` row with an older/missing timestamp will not overwrite a newer locally stored `SUSPENDED` row during hydration. Explicitly newer admin reactivation is allowed.
- **Suspension source of truth:** admin status changes now append a transactionally versioned `account_status_events` record. Hydration applies the latest event after loading mutable user/suspension documents and backfills old active suspensions into the ledger, so stale mutable rows cannot silently reactivate the account.

Turnstile stops automated/bot-driven signups. It is **not** SMS verification or proof of identity; a determined human may still create accounts with different email/SRN details. There is no honest way to guarantee that every bypass is impossible. Stronger identity proof (for example, verified phone ownership or ICAI identity checks) remains a separate product and cost decision.

## Lock down Firestore direct access

The old rules allowed public browser reads/writes for account and entitlement collections. The rules in this branch now deny all direct browser access, while the backend uses the Firebase Admin SDK (privileged server connection) for Firestore persistence and queries. This closes the direct-client-rule bypass path for changing user/profile/credit documents.

Before deploying:
1. Confirm the Firebase App Hosting runtime service account has Firestore data access permissions (for example, the appropriate Cloud Datastore/Firestore data role) on the authoritative Firebase project. The Admin SDK uses Application Default Credentials; do not add a service-account JSON key to the repo or frontend.
2. Deploy to a staging backend first, then verify startup hydration, signup/OTP, normal login fallback, student dashboard, credit balance/consumption, payment fulfillment, admin updates, account suspension/reinstatement, and document deletion/recovery.
3. Because Firestore rules now reject all browser reads and writes, any frontend feature that directly accessed Firestore instead of the backend API must be migrated to the API before production rollout. The current frontend Firebase module is intended for Firebase Auth/MFA; business records must go through backend endpoints.

The server Admin SDK bypasses Firestore Security Rules, so all privileged access must continue to be gated by server authentication/authorization and validated inputs. A browser client must never receive Admin credentials.

## Configure the free-trial device secret

1. In Firebase App Hosting, configure `TRIAL_ABUSE_HMAC_SECRET` as a **server-side secret**, using a cryptographically random value of at least 32 characters.
2. Keep the same secret across normal deployments. Rotating it changes how existing browser cookies are validated and can weaken continuity of older device claims. Never expose it through a `VITE_*` variable, the frontend, or a committed file.
3. If the device signal cannot be signed/verified or Firestore cannot reserve a claim, the system withholds the free trial rather than granting an untracked allowance. The account can still register; test this behavior before a production launch.

The device check is a deterrent, not proof of legal identity. A determined person can clear site data or use another device, so the claim is combined with Turnstile, global ICAI-SRN checks, email OTP, rate limits and exact answer-sheet reuse detection. Do not turn the IP claim into a blanket lockout because shared networks produce legitimate false positives.

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

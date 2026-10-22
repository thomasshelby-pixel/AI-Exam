# MSG91 SMS OTP signup setup

This integration is intentionally **disabled by default**. Until the server-side flag and all required variables are configured, student registration keeps using the existing email OTP flow.

## Required runtime variables

Open Firebase Console → App Hosting → backend `caexamcheckerai-prod` → Settings → Environment. Add `MSG91_WIDGET_ID` as a normal runtime variable; add `MSG91_WIDGET_TOKEN` and `MSG91_AUTHKEY` as secrets. Keep `MSG91_PHONE_REGISTRATION_ENABLED=false` until the end-to-end SMS verification test succeeds. Do not paste credential values into source code, GitHub, chat, or frontend code.

- `MSG91_PHONE_REGISTRATION_ENABLED=true` — enables the mobile-registration path only after the other variables are present.
- `MSG91_AUTHKEY` — private server-side MSG91 Authkey used only to validate the widget access token.
- `MSG91_WIDGET_ID` — the numeric/string Widget ID from MSG91's OTP Widget configuration.
- `MSG91_WIDGET_TOKEN` — the OTP Widget-specific client Auth Token shown in MSG91's Client-side Integration / Token area. This is not the server Authkey.

The server's public config endpoint returns the Widget ID and widget token only when the feature flag and all credentials are configured. It never returns `MSG91_AUTHKEY`.

## MSG91 widget checklist

1. Use the existing OTP widget and configure the contact point as **Mobile Number** with **SMS** as the primary/only channel.
2. Turn off WhatsApp, Voice, and Email channels if SMS-only is intended.
3. Keep CAPTCHA / reCAPTCHA enabled and restrict the widget to India if the app serves Indian students only.
4. Configure the widget's retry count, resend delay, and OTP expiration. MSG91's current guide documents a minimum 15-minute expiration for this widget.
5. Use the provider's approved template where available. MSG91 documents a default SMS template to use while a custom template is awaiting DLT approval, but that is not a promise of a permanent DLT exemption. Its guide also warns that account communication-limit and price-block settings do not work with the default template. Confirm the route, price, and applicable Indian requirements with MSG91 before production usage.

## Authkey IP security

Firebase App Hosting / Cloud Run does not guarantee a static outbound IP by default. Do not whitelist an arbitrary or browser/client IP for the server-side Authkey. If MSG91 requires IP allowlisting, first configure stable egress and whitelist that actual egress IP, or ask MSG91 support for the supported secure configuration for this deployment.

## Enable and test safely

1. Add the server Authkey as a Secret Manager secret, and provide the widget ID and widget token through App Hosting runtime configuration.
2. Set `MSG91_PHONE_REGISTRATION_ENABLED=true` only after all three values are present.
3. Deploy the backend, then open `/api/auth/registration-otp-config`. It should return `phoneOtpEnabled: true`, a widget ID, and the public widget token. If it returns false, check the runtime configuration; never expose the server Authkey.
4. Test with a phone you control and monitor MSG91 widget logs and SMS charges.
5. Existing student accounts and the email/password sign-in path are unchanged. When SMS OTP is enabled, new student signups verify mobile ownership before account creation; the email address remains available for recovery and notifications.

## Important behaviour

- The signup flow rejects a phone number already found on an existing student account (normalizing common Indian number formats).
- Pending phone registration data expires after 15 minutes and uses a 60-second cooldown before a registration can be restarted.
- The MSG91 access token is validated from the server before an account is created. The browser's success callback alone is not trusted.
- Keep the feature flag false until the MSG91 runtime secrets are configured and the first end-to-end test is successful.

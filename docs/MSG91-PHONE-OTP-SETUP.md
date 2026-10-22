# MSG91 phone OTP registration setup

This integration is intentionally **disabled by default**. Existing email OTP registration remains the default until the MSG91 account and backend secrets are configured and the integration is tested.

## Important: this does not bypass Indian SMS compliance

MSG91's published OTP setup guidance tells Indian companies sending OTP SMS in India to follow its DLT guide: https://msg91.com/help/sendotp/step-by-step-process-to-configure-otp

Do not treat the default OTP widget or these code changes as a DLT exemption. Confirm the applicable requirements with MSG91 before using live production SMS.

## Firebase App Hosting runtime variables

Configure these on the **runtime/server** for the App Hosting backend, not as Vite `VITE_*` frontend variables:

- `MSG91_PHONE_REGISTRATION_ENABLED=false` — leave false until testing and compliance checks are complete; set to `true` to switch student signup to phone OTP.
- `MSG91_AUTHKEY` — private MSG91 Authkey used only by the server when validating access tokens. Add as a secret; never put it in source code or a browser variable.
- `MSG91_WIDGET_ID` — the widget ID shown on the MSG91 OTP Widget dashboard.
- `MSG91_WIDGET_TOKEN` — the widget's client Token/Auth Token used by the Web SDK. MSG91 expects this in the browser SDK, unlike the private Authkey.

Do not paste real keys into GitHub, issues, screenshots, or chat. After setting variables, deploy a new App Hosting release and confirm the runtime received them.

### Authkey IP security

MSG91 Authkeys may have IP security enabled. Firebase App Hosting/Cloud Run outbound IPs should not be assumed static. If access-token verification is blocked by an IP whitelist, coordinate with MSG91 on the correct supported configuration for this hosting setup. Do not whitelist a random address, and do not disable IP security without understanding the exposure.

## Student signup behavior

1. When disabled (the default), existing email OTP signup continues unchanged.
2. When enabled, student signup requires a valid mobile number. The browser sends OTP requests through the configured MSG91 Widget SDK.
3. The browser sends the widget access token to the app backend after OTP verification. The backend validates that token with MSG91 and verifies the returned phone matches the pending registration.
4. A phone can be used for only one student account according to normalized-number checks. Pending phone registrations expire.
5. Email remains on the account for recovery and notifications; phone OTP does **not** prove email ownership. The account flags record those separately.

## Before turning the flag on

- Complete any required MSG91/KYC and India DLT setup.
- Confirm only approved channels are enabled on the widget (SMS if that is the intended policy).
- Confirm OTP delivery and widget token verification work using a test account and the deployed App Hosting backend.
- Verify the duplicate-phone case, expired pending registration, invalid token, existing email, existing ICAI SRN, and existing-student login.
- Review SMS pricing and add provider-side spending/usage controls where available.

The server Authkey endpoint is a runtime operation. No actual SMS was sent by this repository change, and the integration has not been validated against live MSG91 credentials.

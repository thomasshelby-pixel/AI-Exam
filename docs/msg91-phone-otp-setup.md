# MSG91 mobile OTP registration setup

This integration is **feature-flagged off by default**. Existing student signup continues to use the current email OTP flow until the MSG91 settings are added and the feature flag is enabled. Email remains the account/recovery contact; only ownership verification changes.

## 1. Finish the MSG91 widget

In MSG91, open **OTP → OTP Widget/SDK → Widgets** and select the widget created for CA Exam Checker AI.

- Keep **SMS enabled**.
- Disable WhatsApp, Voice, and Email channels for this widget if SMS-only registration is the intended policy.
- Save the channel configuration.
- Use the widget's **Widget ID** and its **widget Auth Token**. The value called `tokenAuth` in MSG91's Web SDK example is the widget token.
- Do **not** use the account Authkey as `MSG91_WIDGET_TOKEN`. The account Authkey is server-only and is used only to verify the provider-issued access token after OTP verification.
- If MSG91 offers website/domain restrictions for the widget, restrict use to `caexamcheckerai.com` and the actual Firebase App Hosting domain used by this application.

MSG91 documents the custom Web SDK send/retry/verify flow and requires `reqId` for retry and verification; the integration handles the common SDK `message` request-ID response form too.

## 2. Add runtime values to Firebase App Hosting

Open Firebase Console → **App Hosting** → backend `caexamcheckerai-prod` → **Settings → Environment**.

Add the following values. Use **Secret** for credentials and a normal environment variable for the feature flag/widget ID.

| Variable | Firebase setting | Value |
| --- | --- | --- |
| `MSG91_PHONE_REGISTRATION_ENABLED` | Standard environment variable | `true` only after the verification test below passes |
| `MSG91_WIDGET_ID` | Standard environment variable | Exact Widget ID from the MSG91 widget |
| `MSG91_WIDGET_TOKEN` | Secret | Widget Auth Token used as `tokenAuth` by MSG91's browser SDK |
| `MSG91_AUTHKEY` | Secret | The account Authkey selected/generated for the server-side `verifyAccessToken` call |

The repository sets `MSG91_PHONE_REGISTRATION_ENABLED=false` as the safe default. A Firebase Console value overrides the value in `apphosting.yaml`. Keep the account Authkey out of source control, frontend code, screenshots, chat messages, and browser-visible configuration.

If your Authkey has IP security enabled, do not guess or whitelist an arbitrary address. Confirm with MSG91 whether your Firebase App Hosting egress configuration is compatible with that rule before enabling production SMS.

Choose **Save and deploy** (or save and trigger the next App Hosting rollout). The new runtime settings take effect after the rollout.

## 3. Verify before enabling for students

1. With the feature flag still `false`, confirm the existing email OTP signup still works.
2. Configure the MSG91 values, verify the SMS-only widget, then set `MSG91_PHONE_REGISTRATION_ENABLED=true`.
3. Register using a test email, a valid unused ICAI SRN, and a mobile number you control.
4. Confirm the SMS arrives; enter the code; ensure signup completes.
5. Try registering a second account using that same mobile number. The backend should reject the duplicate before a second student account is created.
6. Confirm the new account reports `phoneVerified=true` and `emailVerified=false`; existing student logins and password recovery by email should continue working.
7. Check MSG91 Widget Logs and the App Hosting rollout logs for any failed `verifyAccessToken` requests.

Do not enable the feature on production users until this end-to-end check passes. SMS delivery and provider pricing depend on MSG91's account, widget, and applicable Indian DLT/SMS configuration.

## Safety behaviour

- The server verifies the MSG91-issued access token with MSG91; a browser success callback alone does not create an account.
- A verified mobile must match the number reserved during registration.
- Existing phone-number duplicates are rejected for student signup.
- Email OTP remains the default when the feature flag is off.
- The server Authkey is never returned to the browser.

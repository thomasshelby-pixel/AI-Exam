# Android download QR and student light-theme implementation

## Download page

- `/download` uses the shared document theme class, so its body and the public Navbar switch together between light and dark.
- The page already reads `/api/public/android-app` for the latest published release. The QR code now uses the backend-returned `downloadPath`, including the current `versionCode`, and falls back to `/api/public/download/android` when metadata is temporarily unavailable.
- QR generation is asynchronous, high error correction, and refreshed when the release metadata changes. It is shown in the right-hand hero column at desktop widths (`lg:` and above), next to the download CTA.
- No APK version is hardcoded in the frontend. The backend release catalogue remains the source of truth.

## Student portal theme

- The student workspace consumes the existing `ThemeContext` `isDark` and `toggleTheme` values.
- The hardcoded `dark` class has been removed from the student workspace wrapper. Dark mode is added only when the shared preference is dark.
- A labelled Sun/Moon theme switch is placed beside Notifications in the student top bar; the same control is available at mobile widths.
- Student shell surfaces (sidebar, topbar, search, hero, panels, KPI cards and subject cards) have explicit light and dark styles. Existing dark hero/progress panels keep their intentional dark styling.

## Contrast adjustments

- Main page headings and body descriptions use the light/dark token mapping from the implementation guide.
- Muted text and icons on student dashboard, history, study planner, profile and enrollment surfaces have been adjusted where their previous light-mode tokens were too faint.
- Faculty Mock selectors, upload surfaces and file-selection controls now have light and dark variants.
- The illustrative phone mockups on the public download page intentionally remain dark so they continue to look like phone-screen previews.

## Verification checklist

- [ ] Run `npm run lint` (TypeScript) and `npm run build`.
- [ ] At desktop width (`lg:`), scan the QR code using an Android phone and confirm it opens the current published APK download URL.
- [ ] Publish a new APK version and confirm the QR follows the latest metadata without a source-code version change.
- [ ] Visit `/download` in light and dark mode; verify Navbar and body backgrounds transition together.
- [ ] Toggle theme on `/student/dashboard`, `/student/upload`, `/student/evaluations`, `/student/profile` and Faculty Mock; confirm persistence after navigation and refresh.
- [ ] Verify desktop and mobile theme toggle controls and check small muted labels, badges, icons, form placeholders and disabled states.
- [ ] Perform a manual visual contrast review at 100% zoom. A build alone does not certify WCAG AA compliance.

# Analytics

Interviewer v8 sends **anonymous, opt-out** usage and error telemetry to the
Codaco-managed PostHog project, mirroring the approach used by Fresco and the
`@codaco/interview` engine. This document describes what is collected, how the
user controls it, and how the preference reaches the native mobile SDKs.

## Principles

- **No participant data, ever.** Network data, interview responses, case IDs,
  protocol contents, and asset files never leave the device.
- **No user-identifiable data.** Events are associated only with a random
  per-device installation id (`installationId.ts`). The single-user invariant
  holds: `installationId` identifies the device, not a user.
- **Opt-out, defaults on.** `StoredSettings.analyticsEnabled` defaults to
  `true`. Existing installs inherit the default because both the Dexie and
  SQLCipher settings backends merge `DEFAULT_SETTINGS` over stored rows.
- **Telemetry never breaks the app.** Client init, tracking, and exception
  capture all swallow errors.

## Where the preference lives

`StoredSettings.analyticsEnabled` (in `src/lib/db/types.ts`) is the source of
truth. It is editable in two places:

- **Onboarding wizard** — `SetupWizard/Step5Analytics.tsx` ("Help improve the
  app"), persisted on finish by `SetupWizardDialog.tsx`.
- **Settings → Privacy** — `SettingsDialog.tsx`, applied immediately.

Both routes go through `AnalyticsProvider.setEnabled()`, which:

1. persists `analyticsEnabled` via `updateSettings`,
2. opts the shared posthog-js client in or out, and
3. mirrors the flag into Capacitor Preferences for the native SDKs.

## Web / JS layer

`src/lib/analytics/`:

- `config.ts` — API key, proxy host, instance name, native pref key.
- `client.ts` — lazily-initialised singleton posthog-js client. Autocapture,
  page views, and session replay are off; `capture_exceptions` is on so
  uncaught JS errors and unhandled rejections are reported.
- `AnalyticsProvider.tsx` — React context exposing `enabled`, `client`,
  `setEnabled`, `track`, and `captureException`. Registers anonymous super
  properties (`app`, `installation_id`, `host_version`) and identifies by
  installation id.

The same client is passed into the `@codaco/interview` `Shell`
(`routes/Interview.tsx`) via `posthogClient`, with `disableAnalytics` bound to
the inverse of the preference, so the engine's built-in events share one client
and one opt-out switch.

`AppErrorBoundary.tsx` reports React render errors (which PostHog's uncaught
handler does not see) through `captureException`.

### App-level events

| Event                     | Where                 | Properties (anonymous)                                            |
| ------------------------- | --------------------- | ----------------------------------------------------------------- |
| `protocol_installed`      | `routes/Home.tsx`     | `source`, `migrated`, `protocol_hash`                             |
| `protocol_install_failed` | `routes/Home.tsx`     | `source`, `reason`                                                |
| `data_exported`           | `components/DataView` | `interview_count`, `failed_count`, `export_graphml`, `export_csv` |

Interview-engine events (stage navigation, node/edge mutations, form
interactions, etc.) are emitted by `@codaco/interview` itself.

## Native mobile (Capacitor) error tracking

The renderer runs in a WebView and cannot call the native PostHog SDKs, so the
preference is mirrored into Capacitor Preferences
(`writeNativeAnalyticsPreference`) under key `analytics_enabled`:

- **iOS** — `UserDefaults`, key `CapacitorStorage.analytics_enabled`. Read in
  `ios/App/App/AppDelegate.swift`, which initialises `PostHogSDK` with
  `optOut` set from the flag. Pod added in `ios/App/Podfile`.
- **Android** — `CapacitorStorage` SharedPreferences, key `analytics_enabled`.
  Read in `AnalyticsApplication.java`, which calls `PostHogAndroid.setup` with
  `optOut` set from the flag. Dependency added in `android/app/build.gradle` and
  the `Application` registered in `AndroidManifest.xml`.

Because the flag is read at launch, toggling analytics in Settings takes effect
for **native** crash/error capture on the next app start (the JS layer reacts
immediately). Screen views, autocapture, and session replay are disabled on both
platforms, so native telemetry is limited to crash/error reports keyed to the
anonymous installation id.

> **Build note:** the native changes (Podfile, Gradle, `AppDelegate.swift`,
> `AnalyticsApplication.java`, manifest) require the iOS/Android toolchains to
> compile and were not built in CI for this change. Run `pnpm capacitor:sync`
> followed by a native build (`pnpm capacitor:run:ios` /
> `pnpm capacitor:run:android`) to verify, and confirm the exact PostHog SDK
> setup signatures against the linked docs for the resolved SDK versions.

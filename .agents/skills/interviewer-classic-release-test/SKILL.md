---
name: interviewer-classic-release-test
description: Build Interviewer Classic (apps/interviewer-classic, the schema 7 Electron and Capacitor app) locally and drive it through its core journeys on desktop, the iOS simulator and the Android emulator to decide whether a release is ready. Use before merging or releasing an interviewer-classic version bump, or when asked to release-test, smoke-test or check the iOS/Android/desktop builds of Interviewer Classic. Not for the modern Interviewer PWA (use interviewer-release-test). Keywords: interviewer classic release test, classic smoke test, iPad, Android tablet, simulator, emulator, packaged app, 6.x.
---

# Interviewer Classic release test

## Overview

Interviewer Classic ships as a packaged Electron app and as Capacitor apps for
iOS and Android, all built from this checkout. This test builds each release
candidate locally and drives it with
`scripts/release-test/interviewer-classic-release-walker.mjs`, one platform per
run. Every platform walks the same journey and is checked against the app's
persisted state (`persist:networkCanvas6`) and its export files, not just the
screen:

1. boot, and show the version under test (mobile also checks the native
   version stamps match `package.json`);
2. install the sample protocol from its URL (download + validation);
3. conduct an interview: consent, ego form, quick add, placing nodes on the
   sociogram, creating an edge, finishing;
4. export the session and check the zip: graphml, ego CSV with
   `APP_VERSION`, the created nodes with sociogram positions, the edge;
5. import a protocol file of each supported schema (7, 6, 5, 4) and confirm a
   schema 8 file (what current Architect writes) is refused with an
   explanation.

The walker drives the UI with synthesised DOM events so one journey runs on all
three platforms. It does not cover signing, store submission, OS-level touch
input, or Windows/Linux packages.

Run from the checkout of the release candidate (the release PR's branch, or
`main` for a health check) with `pnpm install` done and network access. Run the
platforms one at a time; after its build, desktop takes about 2 minutes,
iOS about 3 plus the manual steps, and Android 10–15 (its picker is slow). Use a fresh
artifacts directory in your scratchpad per run, run walkers in the background
and wait for them — never predict a result.

Ask which platforms to test only if the request does not say; default to all
three on macOS, desktop only elsewhere.

## Desktop

```bash
node scripts/release-test/classic-release-build.mjs --app interviewer --platform desktop
node scripts/release/verify-packaged-app.mjs --app apps/interviewer-classic
node scripts/release-test/interviewer-classic-release-walker.mjs --platform desktop --artifacts <dir>
```

Native file dialogs are stubbed; the app window opens on screen while it runs.

## Android

Needs the Android SDK command-line tools with an emulator image, and a JDK
(Homebrew `openjdk@21` and `android-commandlinetools` are picked up
automatically). The project's emulator is the `Pixel_Tablet_API_35` AVD; if
`emulator -list-avds` lacks it, create it with `avdmanager create avd -n
Pixel_Tablet_API_35 -k "system-images;android-35;google_apis;arm64-v8a" -d
pixel_tablet` (installing the image with `sdkmanager` asks the user first).

1. Boot the emulator unless `adb devices` already lists one: run `emulator
-avd Pixel_Tablet_API_35 -no-snapshot -no-audio -no-boot-anim` in the
   background (with a long timeout), then wait for `adb shell getprop
sys.boot_completed` to print 1.
2. Build: `node scripts/release-test/classic-release-build.mjs --app interviewer --platform android`.
3. Walk: `node scripts/release-test/interviewer-classic-release-walker.mjs --platform android --app-path apps/interviewer-classic/android/app/build/outputs/apk/debug/app-debug.apk --artifacts <dir>`.

The walker installs the APK, clears its data, and drives the WebView through
Playwright's Android support. The system file picker is driven with adb alone
(a UI Automator dump to find a control, `input tap` to press it, the picker's
search to find each file), so no extra driver is installed on the device. The
export is read from the app's cache before the share sheet is dismissed. The
debug build is used because only it exposes the WebView to automation; it
ships the same web bundle as release.

## iOS

Needs Xcode with an iOS simulator runtime and `ios_webkit_debug_proxy`
(`brew install ios-webkit-debug-proxy`). Prefer an iPad simulator (the app is
landscape-only).

1. Boot a simulator unless one is booted (`xcrun simctl list devices booted`):
   `xcrun simctl boot <udid>` and `open -a Simulator`. Claude Code: attach the
   simulator panel now so the user can watch.
2. Build: `node scripts/release-test/classic-release-build.mjs --app interviewer --platform ios`.
3. Walk: `node scripts/release-test/interviewer-classic-release-walker.mjs --platform ios --app-path apps/interviewer-classic/release-builds/ios-derived-data/Build/Products/Debug-iphonesimulator/App.app --artifacts <dir>`.
4. The Files picker and the share sheet are native UI no script reaches, so
   the walker leaves them as `manual` entries in `result.json`, with exact
   instructions. Perform each with the simulator tool (Claude Code: the iOS
   simulator control). Take a screenshot before every tap and again a few
   seconds after it: the simulator applies taps late, and the page can still be
   scrolling. The app is landscape-only, so on an iPad in portrait its UI
   appears rotated and tap coordinates follow the rotated layout; "Import From
   File" is near the end of the start screen, reached by swiping the page.
   - `ios-save-to-files`: the export's share sheet is open — Save to Files →
     On My iPad → Save. Confirm the zip landed in the Files storage folder (the
     walker already checked its contents) and that the session card then shows
     an export time.
   - `ios-import-from-files`: the walker staged `rt7`, `rt6`, `rt5`, `rt4` and
     `rt8` `.netcanvas` files in Files → On My iPad. Import each through
     "Import From File": the first four must show "Protocol installed
     successfully"; `rt8` (schema 8) must be refused with the "failed
     validation" dialog (dismiss it with OK). Then run the walker again with
     `--platform ios --phase verify-imports --artifacts <new dir>`, which
     reads the installed protocols from the app without reinstalling it.
     Record each manual step's outcome yourself; it is part of the verdict.

## Report

For each platform, read `<artifacts>/result.json` (`steps`, `failures`,
`manual`, `notes`) and lead with the overall verdict:

- **Ready** — every platform's build passed, desktop's package verification
  passed, every walker exited 0, and every manual iOS step succeeded.
- **Not ready** — any failed check, build or manual step. List each with its
  note and the `fail-*.png` screenshot in the artifacts directory; quote
  "app reported: …" notes, which are the app's own error dialogs.
- **Incomplete** — a walker exited 2 (watchdog: something hung) or 3 (setup:
  no device, no build, inspector unreachable), or a platform was not run. Say
  which and why; do not give an overall verdict.

A failure is not automatically a regression. Classic releases are not tagged in
this repository: the previous release is the commit that bumped
`apps/interviewer-classic/package.json` to its version (`git log
-S'"version": "<previous>"' --format=%h -- apps/interviewer-classic/package.json`
— the oldest hit). To tell whether a failure shipped already, build that
commit in a separate worktree and walk it. Say which failures are new; the user
decides what blocks the release.

## Changing the walker

The journey, its stage indices (the sample protocol's) and the platform
adapters live in the walker; shared helpers (dialog stubs, synthetic input,
result recording, export and version oracles) in
`scripts/release-test/classic-release-lib.mjs`, whose pure oracles have unit
tests in `classic-release-lib.test.mjs`. A new check must fail against a build
with the bug it guards before it lands — reintroduce the bug locally, build,
and walk.

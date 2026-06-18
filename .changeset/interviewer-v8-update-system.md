---
'@codaco/interviewer-v8': minor
---

Add an in-app update system. On launch the app checks GitHub Releases for a newer version and shows a toast (with "skip this release" and "dismiss"); opening it shows a dialog with the rendered release notes and a platform-specific action. On Electron it downloads and installs the update in the background via electron-updater (generic feed maintained by CI); on Capacitor it opens the App Store / Play Store listing.

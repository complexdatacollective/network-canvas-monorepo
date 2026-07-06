// True when the app is running as an installed / standalone PWA rather than in a
// normal browser tab. The display-mode media query covers Chromium and Safari
// dock apps; the legacy `navigator.standalone` flag covers iOS/iPadOS
// home-screen apps. Guards for SSR / no-window so it's safe to call anywhere.
//
// This is deliberately broader than `hasPasskeyWindowLimitation` in
// `passkeyWindowLimitation.ts`, which detects only the narrow macOS-Chromium
// installed-window case where WebAuthn can't reach iCloud Keychain.
export function isRunningInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }
  return typeof navigator !== 'undefined' && navigator.standalone === true;
}

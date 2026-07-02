// Chromium on macOS cannot reach the iCloud Keychain (Apple Passwords)
// authenticator from installed-PWA windows: the WebAuthn request has no valid
// NSWindow in the browser process to anchor the native passkey sheet, so
// Chrome silently omits the only PRF-capable platform authenticator there
// (crbug.com/364926914). create() falls back to Chrome's profile
// authenticator, which does not implement PRF, and get() can only offer the
// hybrid (QR) flow for a credential stored in Apple Passwords. Biometric
// enrolment and unlock must degrade to PIN/passphrase/recovery in that
// context.

export function isMacChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS also reports 'MacIntel' in desktop mode; real Macs have no
  // touchscreen, so maxTouchPoints separates them.
  const isMac =
    navigator.platform.startsWith('Mac') && navigator.maxTouchPoints === 0;
  // Chromium-only API surface; Safari and Firefox don't expose userAgentData.
  return isMac && 'userAgentData' in navigator;
}

export function hasPasskeyWindowLimitation(): boolean {
  return (
    isMacChromium() &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  );
}

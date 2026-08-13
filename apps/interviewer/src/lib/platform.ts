// Whether this is a handheld OS (iOS, iPadOS, Android), where the browser has
// no download manager or user-reachable file system: a file has to be handed
// to the OS through the share sheet to end up anywhere the person can find it.
// Every desktop browser — Safari included — saves an <a download> to the
// Downloads folder and surfaces it in its own downloads UI, so a share sheet
// there is an unwanted detour.
export function isHandheldPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  if (/Android|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ presents itself as a Mac, and its default (desktop-mode) user
  // agent says nothing about iPad. A real Mac has no touchscreen, so
  // maxTouchPoints is what separates them — the same idiom as
  // lib/pwa/passkeyWindowLimitation.ts, read in the opposite direction.
  return (
    typeof navigator.platform === 'string' &&
    navigator.platform.startsWith('Mac') &&
    navigator.maxTouchPoints > 0
  );
}

export type Platform = 'web' | 'electron' | 'capacitor';

export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';
  if (window.electronAPI) return 'electron';
  const capacitor = (
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  if (capacitor?.isNativePlatform?.()) return 'capacitor';
  return 'web';
}

export const platform = detectPlatform();

export const isElectron = platform === 'electron';
export const isCapacitor = platform === 'capacitor';
export const isWeb = platform === 'web';

export const hostAppName = 'interviewer-v7';

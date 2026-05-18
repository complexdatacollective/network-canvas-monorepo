type Platform = 'web' | 'electron' | 'capacitor';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';
  if (window.electronAPI) return 'electron';
  const capacitor = (
    window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  if (capacitor?.isNativePlatform?.()) return 'capacitor';
  return 'web';
}

const platform = detectPlatform();

export const isElectron = platform === 'electron';
export const isCapacitor = platform === 'capacitor';

export const hostAppName = 'interviewer-v7';

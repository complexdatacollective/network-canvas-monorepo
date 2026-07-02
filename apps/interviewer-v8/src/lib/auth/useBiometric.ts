import { useEffect, useState } from 'react';

import { isBiometricSupported } from './api';

type BiometricState =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: string };

const NO_HARDWARE_REASON = 'No biometric sensor available on this device';

export function useBiometric(): BiometricState {
  const [biometric, setBiometric] = useState<BiometricState>({
    status: 'checking',
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supported = await isBiometricSupported();
        if (!active) return;
        setBiometric(
          supported
            ? { status: 'available' }
            : { status: 'unavailable', reason: NO_HARDWARE_REASON },
        );
      } catch {
        if (!active) return;
        setBiometric({ status: 'unavailable', reason: NO_HARDWARE_REASON });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return biometric;
}

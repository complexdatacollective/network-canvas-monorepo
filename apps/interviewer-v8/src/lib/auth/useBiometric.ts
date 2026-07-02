import { useEffect, useState } from 'react';

import { isBiometricSupported } from './api';

export type BiometricState =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: string };

const UNSUPPORTED_REASON =
  'This browser or device does not support biometric unlock. Use a PIN or passphrase instead.';

export function useBiometric(): BiometricState {
  const [biometric, setBiometric] = useState<BiometricState>({
    status: 'checking',
  });

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const supported = await isBiometricSupported();
        if (!active) return;
        setBiometric(
          supported
            ? { status: 'available' }
            : { status: 'unavailable', reason: UNSUPPORTED_REASON },
        );
      } catch {
        if (!active) return;
        setBiometric({ status: 'unavailable', reason: UNSUPPORTED_REASON });
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, []);

  return biometric;
}

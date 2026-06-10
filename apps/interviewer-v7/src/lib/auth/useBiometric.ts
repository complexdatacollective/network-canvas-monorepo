import { useEffect, useState } from 'react';

import { isCapacitor } from '../platform/platform';
import { isBiometricSupported } from './api';
import {
  type BiometricAvailability,
  isBiometricNativeAvailable,
} from './biometricNative';

type BiometricState =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: string };

const UNAVAILABLE_REASON_TEXT: Record<
  Extract<BiometricAvailability, { ok: false }>['reason'],
  string
> = {
  'no-hardware': 'No biometric sensor available on this device',
  'not-enrolled': 'No biometric is enrolled on this device',
  'no-device-passcode': 'Set a device passcode first',
  'unknown': 'Biometric authentication is not available',
};

export function useBiometric(): BiometricState {
  const [biometric, setBiometric] = useState<BiometricState>({
    status: 'checking',
  });

  useEffect(() => {
    async function checkBiometric() {
      if (isCapacitor) {
        const result = await isBiometricNativeAvailable();
        if (result.ok) {
          setBiometric({ status: 'available' });
        } else {
          setBiometric({
            status: 'unavailable',
            reason: UNAVAILABLE_REASON_TEXT[result.reason],
          });
        }
      } else if (!(await isBiometricSupported())) {
        setBiometric({
          status: 'unavailable',
          reason: UNAVAILABLE_REASON_TEXT['no-hardware'],
        });
      } else {
        setBiometric({ status: 'available' });
      }
    }

    void checkBiometric();
  }, []);

  return biometric;
}

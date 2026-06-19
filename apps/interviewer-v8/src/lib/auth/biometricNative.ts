import {
  BiometricAuth,
  BiometryErrorType,
} from '@aparajita/capacitor-biometric-auth';

import { isCapacitor } from '../platform/platform';

export type BiometricAvailability =
  | { ok: true }
  | {
      ok: false;
      reason: 'no-hardware' | 'not-enrolled' | 'no-device-passcode' | 'unknown';
    };

export async function isBiometricNativeAvailable(): Promise<BiometricAvailability> {
  if (!isCapacitor) return { ok: false, reason: 'no-hardware' };
  try {
    const result = await BiometricAuth.checkBiometry();
    if (result.isAvailable) return { ok: true };
    switch (result.code) {
      case BiometryErrorType.biometryNotAvailable:
        return { ok: false, reason: 'no-hardware' };
      case BiometryErrorType.biometryNotEnrolled:
        return { ok: false, reason: 'not-enrolled' };
      case BiometryErrorType.passcodeNotSet:
        return { ok: false, reason: 'no-device-passcode' };
      default:
        return { ok: false, reason: 'unknown' };
    }
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}

export async function verifyBiometric(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (!isCapacitor) {
    return { ok: false, message: 'Biometric authentication is not available' };
  }
  try {
    await BiometricAuth.authenticate({
      reason: 'Unlock Network Canvas Interviewer 8',
      allowDeviceCredential: true,
    });
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, message };
  }
}

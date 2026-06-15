import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkBiometryMock, authenticateMock } = vi.hoisted(() => ({
  checkBiometryMock: vi.fn(),
  authenticateMock: vi.fn(),
}));

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: checkBiometryMock,
    authenticate: authenticateMock,
  },
  // Actual BiometryErrorType values — none is "" not "none"
  BiometryErrorType: {
    none: '',
    biometryNotAvailable: 'biometryNotAvailable',
    biometryNotEnrolled: 'biometryNotEnrolled',
    passcodeNotSet: 'passcodeNotSet',
    noDeviceCredential: 'noDeviceCredential',
    userCancel: 'userCancel',
  },
}));

vi.mock('../../platform/platform', () => ({
  isElectron: false,
  isCapacitor: true,
  hostAppName: 'capacitor',
}));

import {
  isBiometricNativeAvailable,
  verifyBiometric,
} from '../biometricNative';

describe('biometricNative — inside Capacitor', () => {
  beforeEach(() => {
    checkBiometryMock.mockReset();
    authenticateMock.mockReset();
  });

  it('reports availability when checkBiometry returns isAvailable: true', async () => {
    checkBiometryMock.mockResolvedValue({ isAvailable: true, code: '' });
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: true });
  });

  it('maps biometryNotAvailable code to no-hardware', async () => {
    checkBiometryMock.mockResolvedValue({
      isAvailable: false,
      code: 'biometryNotAvailable',
    });
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: false, reason: 'no-hardware' });
  });

  it('maps biometryNotEnrolled code to not-enrolled', async () => {
    checkBiometryMock.mockResolvedValue({
      isAvailable: false,
      code: 'biometryNotEnrolled',
    });
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: false, reason: 'not-enrolled' });
  });

  it('maps passcodeNotSet code to no-device-passcode', async () => {
    checkBiometryMock.mockResolvedValue({
      isAvailable: false,
      code: 'passcodeNotSet',
    });
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: false, reason: 'no-device-passcode' });
  });

  it('maps an unrecognised code to unknown', async () => {
    checkBiometryMock.mockResolvedValue({
      isAvailable: false,
      code: 'someFutureErrorCode',
    });
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: false, reason: 'unknown' });
  });

  it('returns unknown when checkBiometry throws', async () => {
    checkBiometryMock.mockRejectedValue(new Error('plugin error'));
    const r = await isBiometricNativeAvailable();
    expect(r).toEqual({ ok: false, reason: 'unknown' });
  });

  it('verifies successfully when authenticate resolves', async () => {
    authenticateMock.mockResolvedValue(undefined);
    const r = await verifyBiometric();
    expect(r).toEqual({ ok: true });
    expect(authenticateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowDeviceCredential: true,
      }),
    );
  });

  it('returns ok:false with message when authenticate throws BiometryError', async () => {
    authenticateMock.mockRejectedValue(
      Object.assign(new Error('User cancelled'), { code: 'userCancel' }),
    );
    const r = await verifyBiometric();
    expect(r).toEqual({ ok: false, message: 'User cancelled' });
  });

  it('handles non-Error throws from authenticate', async () => {
    authenticateMock.mockRejectedValue('string error');
    const r = await verifyBiometric();
    expect(r).toEqual({ ok: false, message: 'string error' });
  });
});

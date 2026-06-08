import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// The @aparajita/capacitor-biometric-auth ESM build re-exports from './definitions'
// without the .js extension, which Node ESM refuses to resolve in jsdom test mode.
// Tests that exercise Capacitor-only code paths should override this mock with
// platform-specific behaviour (see biometricNative.test.ts for an example).
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(),
    authenticate: vi.fn(),
  },
  BiometryErrorType: {
    none: '',
    biometryNotAvailable: 'biometryNotAvailable',
    biometryNotEnrolled: 'biometryNotEnrolled',
    passcodeNotSet: 'passcodeNotSet',
    noDeviceCredential: 'noDeviceCredential',
    userCancel: 'userCancel',
  },
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { frescoLocales } from '~/i18n/locales';
import { TWO_FACTOR_SETUP_PATH } from '~/lib/auth/paths';

const { mockPush, mockLogin } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockLogin: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => false,
  startAuthentication: vi.fn(),
}));

vi.mock('~/actions/auth', () => ({
  login: mockLogin,
  recoveryCodeLogin: vi.fn(),
}));

vi.mock('~/actions/twoFactor', () => ({ verifyTwoFactor: vi.fn() }));

vi.mock('~/actions/webauthn', () => ({
  generateAuthenticationOptions: vi.fn(),
  verifyAuthentication: vi.fn(),
}));

import { SignInForm } from '../SignInForm';

const view = (
  <AppI18nProvider locale="en" locales={frescoLocales}>
    <SignInForm />
  </AppI18nProvider>
);

const signIn = async () => {
  render(view);
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'alice' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'Correct-horse-1!' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(mockLogin).toHaveBeenCalled());
};

describe('SignInForm after a password sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('goes to two-factor setup when the installation requires it of this account', async () => {
    mockLogin.mockResolvedValue({
      success: true,
      requiresTwoFactorSetup: true,
    });

    await signIn();

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(TWO_FACTOR_SETUP_PATH),
    );
    expect(mockPush).not.toHaveBeenCalledWith('/dashboard');
  });

  it('goes to the dashboard otherwise', async () => {
    mockLogin.mockResolvedValue({ success: true });

    await signIn();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockPush).not.toHaveBeenCalledWith(TWO_FACTOR_SETUP_PATH);
  });
});

// A "back" arrow points at where the reader came from: left, or right in a
// right-to-left language. The icon is drawn pointing left and turned round by
// the stylesheet, which this environment does not load, so the check is that
// each back button asks for the turn.
describe('SignInForm back buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const backArrow = () =>
    screen
      .getByRole('button', { name: 'Back to sign in' })
      .querySelector('svg');

  it('turns the arrow round on the two-factor step', async () => {
    mockLogin.mockResolvedValue({
      success: false,
      requiresTwoFactor: true,
      twoFactorToken: 'token',
    });

    await signIn();

    await screen.findByRole('button', { name: 'Back to sign in' });
    expect(backArrow()).toHaveClass('rtl:rotate-180');
  });

  it('turns the arrow round on the recovery-code step', async () => {
    render(view);
    fireEvent.click(screen.getByRole('button', { name: /Trouble signing in/ }));

    await screen.findByRole('button', { name: 'Back to sign in' });
    expect(backArrow()).toHaveClass('rtl:rotate-180');
  });
});

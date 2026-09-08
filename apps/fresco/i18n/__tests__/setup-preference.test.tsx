import type { RegistrationResponseJSON } from '@simplewebauthn/browser';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignUpForm } from '~/app/(blobs)/(setup)/_components/SignUpForm';
import { FrescoI18nProvider } from '~/i18n/FrescoI18nProvider';
import LanguageSetting from '~/i18n/LanguageSetting';

const { signup, signupWithPasskey, startRegistration, updateLocale, router } =
  vi.hoisted(() => ({
    signup: vi.fn(),
    signupWithPasskey: vi.fn(),
    startRegistration: vi.fn(),
    updateLocale: vi.fn(),
    router: { refresh: vi.fn(), push: vi.fn() },
  }));
vi.mock('~/actions/auth', () => ({ signup }));
vi.mock('~/actions/locale', () => ({ updateLocale }));
vi.mock('~/actions/webauthn', () => ({
  signupWithPasskey,
  generateSignupRegistrationOptions: async () => ({
    error: null,
    data: { options: {} },
  }),
}));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration,
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('usehooks-ts', () => ({ useMediaQuery: () => false }));

function View({ password = false }: { password?: boolean }) {
  return (
    <FrescoI18nProvider
      initial={{
        locale: 'en',
        preference: null,
        userId: null,
        requested: ['en'],
      }}
    >
      <LanguageSetting />
      <SignUpForm sandboxMode={password} />
    </FrescoI18nProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  signup.mockResolvedValue({ success: false, error: null });
  signupWithPasskey.mockResolvedValue({ error: null, data: {} });
  updateLocale.mockResolvedValue({ success: true });
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    value: ['en'],
  });
});

describe('setup language across account creation', () => {
  it('passes the selected password-signup preference before its mirror write completes', async () => {
    updateLocale.mockReturnValue(new Promise(() => undefined));
    const view = render(<View password />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'es' },
    });
    fireEvent.change(view.container.querySelector('input[name="username"]')!, {
      target: { value: 'Researcher' },
    });
    fireEvent.change(view.container.querySelector('input[name="password"]')!, {
      target: { value: 'Sup3rSecret!' },
    });
    await waitFor(() =>
      expect(
        view.container.querySelector('input[name="confirmPassword"]'),
      ).not.toBeNull(),
    );
    fireEvent.change(
      view.container.querySelector('input[name="confirmPassword"]')!,
      { target: { value: 'Sup3rSecret!' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() =>
      expect(signup).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'Researcher' }),
        'es',
      ),
    );
  });

  it.each(['es', '__automatic'])(
    'uses the latest committed preference %s after the passkey prompt resolves',
    async (choice) => {
      let resolveRegistration!: (credential: RegistrationResponseJSON) => void;
      startRegistration.mockReturnValue(
        new Promise<RegistrationResponseJSON>((resolve) => {
          resolveRegistration = resolve;
        }),
      );
      const view = render(<View />);
      await waitFor(() =>
        expect(
          view.container.querySelector('input[name="password"]'),
        ).toBeNull(),
      );
      fireEvent.change(
        view.container.querySelector('input[name="username"]')!,
        { target: { value: 'Researcher' } },
      );
      fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
      await waitFor(() => expect(startRegistration).toHaveBeenCalledOnce());
      fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
        target: { value: 'es' },
      });
      if (choice === '__automatic')
        fireEvent.change(screen.getByRole('combobox', { name: 'Idioma' }), {
          target: { value: choice },
        });
      await act(async () =>
        resolveRegistration({
          id: 'credential',
          rawId: 'credential',
          type: 'public-key',
          response: { clientDataJSON: 'fixture', attestationObject: 'fixture' },
          clientExtensionResults: {},
        }),
      );
      await waitFor(() =>
        expect(signupWithPasskey).toHaveBeenCalledWith(
          expect.objectContaining({
            username: 'Researcher',
            locale: choice === 'es' ? 'es' : null,
          }),
        ),
      );
    },
  );
});

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import type * as I18nProviderModule from '~/i18n/InterviewerI18nProvider';

import App from '../App';
import { LOCALE_PREFERENCE_KEY } from '../i18n/preference';

const failures = vi.hoisted(() => ({ locale: false, providers: false }));

vi.mock('~/i18n/InterviewerI18nProvider', async (importOriginal) => {
  const original = await importOriginal<typeof I18nProviderModule>();
  return {
    InterviewerI18nProvider: ({ children }: { children: ReactNode }) => {
      if (failures.locale) throw new Error('Locale provider startup failed');
      return (
        <original.InterviewerI18nProvider>
          {children}
        </original.InterviewerI18nProvider>
      );
    },
  };
});
vi.mock('~/providers/AppProviders', () => ({
  AppProviders: ({ children }: { children: ReactNode }) => {
    if (failures.providers) throw new Error('App provider startup failed');
    return children;
  },
}));
vi.mock('~/components/AppUpdate/AppUpdateProvider', () => ({
  AppUpdateProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('~/components/AuthGate', () => ({
  AuthGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('~/routes/Home', () => ({ HomeRoute: () => null }));
vi.mock('~/routes/Interview', () => ({ InterviewRoute: () => null }));
vi.mock('~/routes/NotFound', () => ({ NotFoundRoute: () => null }));
vi.mock('~/routes/Welcome', () => ({ WelcomeRoute: () => null }));
vi.mock('@codaco/art', () => ({ BackgroundLights: () => null }));

// The real dialog and animated background are exercised by the boundary's
// Storybook test. Here the complete App provider ordering is the contract.
vi.mock('@codaco/fresco-ui/dialogs/Dialog', () => ({
  default: ({ open, title, description, footer }: DialogProps) =>
    open ? (
      <dialog open aria-label={typeof title === 'string' ? title : undefined}>
        <h2>{title}</h2>
        <p>{description}</p>
        {footer}
      </dialog>
    ) : null,
}));

beforeEach(() => {
  failures.locale = false;
  failures.providers = false;
  localStorage.setItem(LOCALE_PREFERENCE_KEY, 'es');
  // The bootstrap screen owns these before the React provider is mounted.
  document.documentElement.lang = 'es';
  document.documentElement.dir = 'ltr';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(LOCALE_PREFERENCE_KEY);
  document.documentElement.lang = 'en';
});

it('offers provider-optional English recovery when locale startup throws', () => {
  failures.locale = true;
  let uncaught: unknown;
  try {
    render(<App />);
  } catch (error) {
    uncaught = error;
  }
  const dialog = screen.queryByRole('dialog', {
    name: 'Something went wrong.',
  });
  expect(dialog).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
  expect(dialog?.closest('[lang]')).toHaveAttribute('lang', 'en');
  expect(dialog?.closest('[dir]')).toHaveAttribute('dir', 'ltr');
  expect(uncaught).toBeUndefined();
});

it('keeps recovery localized when a later app provider throws', () => {
  failures.providers = true;
  render(<App />);
  const dialog = screen.getByRole('dialog', {
    name: 'Se ha producido un error.',
  });
  expect(dialog).toBeVisible();
  expect(screen.getByRole('button', { name: 'Volver a cargar' })).toBeVisible();
  expect(dialog.closest('[lang]')).toHaveAttribute('lang', 'es');
  expect(document.documentElement).toHaveAttribute('lang', 'es');
});

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { InterviewerI18nProvider } from '~/i18n/InterviewerI18nProvider';
import { LOCALE_PREFERENCE_KEY } from '~/i18n/preference';

import { AppErrorBoundary, ErrorBoundary } from './AppErrorBoundary';

// Renders the boundary's fallback for real (blob backdrop + fresco-ui Dialog)
// by throwing during render — the jsdom unit test stubs the Dialog out, so
// this story is what exercises the actual error UI.
function Thrower(): never {
  throw new Error('Storybook: deliberate render error');
}

const meta: Meta<typeof AppErrorBoundary> = {
  title: 'Components/AppErrorBoundary',
  component: AppErrorBoundary,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AppErrorBoundary>;

export const ErrorFallback: Story = {
  render: () => (
    <AppErrorBoundary>
      <Thrower />
    </AppErrorBoundary>
  ),
  play: async ({ canvasElement }) => {
    // Use the document so the assertion covers the actual portaled dialog.
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(
        within(dialog).getByText('Something went wrong.'),
      ).toBeInTheDocument(),
    );
    await expect(
      within(dialog).getByRole('button', { name: 'Reload' }),
    ).toBeInTheDocument();
    // dismissible={false} — no close button.
    await expect(
      within(dialog).queryByRole('button', { name: /close/i }),
    ).not.toBeInTheDocument();
    await expect(dialog.closest('[lang]')).toHaveAttribute('lang', 'en');
    await expect(dialog.closest('[dir]')).toHaveAttribute('dir', 'ltr');
  },
};

export const ProviderOptionalRecovery: Story = {
  render: () => (
    // Bootstrap can already have selected Spanish before locale startup fails.
    <ThemedRegion theme="interview" lang="es" dir="ltr">
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    </ThemedRegion>
  ),
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const dialog = await screen.findByRole('dialog', {
      name: 'Something went wrong.',
    });
    await expect(
      within(dialog).getByRole('button', { name: 'Reload' }),
    ).toBeVisible();
    await expect(dialog.closest('[lang]')).toHaveAttribute('lang', 'en');
    await expect(dialog.closest('[dir]')).toHaveAttribute('dir', 'ltr');
  },
};

export const LocalizedRecoveryRemainsLive: Story = {
  beforeEach: () => {
    const originalPreference = localStorage.getItem(LOCALE_PREFERENCE_KEY);
    const originalLanguage = document.documentElement.lang;
    const originalDirection = document.documentElement.dir;
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'en');
    return () => {
      if (originalPreference === null) {
        localStorage.removeItem(LOCALE_PREFERENCE_KEY);
      } else {
        localStorage.setItem(LOCALE_PREFERENCE_KEY, originalPreference);
      }
      document.documentElement.lang = originalLanguage;
      document.documentElement.dir = originalDirection;
    };
  },
  render: () => (
    <InterviewerI18nProvider>
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    </InterviewerI18nProvider>
  ),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const screen = within(document.body);
    const receiveSavedLanguage = (locale: string) => {
      // Simulate the browser notifying this open tab after another tab saves
      // the device preference, while this tab's recovery dialog stays open.
      localStorage.setItem(LOCALE_PREFERENCE_KEY, locale);
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LOCALE_PREFERENCE_KEY,
          newValue: locale,
        }),
      );
    };
    const dialog = await screen.findByRole('dialog', {
      name: 'Something went wrong.',
    });
    await expect(dialog.closest('[lang]')).toHaveAttribute('lang', 'en');
    receiveSavedLanguage('es');
    await expect(
      await screen.findByRole('dialog', { name: 'Se ha producido un error.' }),
    ).toBeVisible();
    await expect(
      within(dialog).getByRole('button', { name: 'Volver a cargar' }),
    ).toBeVisible();
    await expect(dialog.closest('[lang]')).toHaveAttribute('lang', 'es');
    await expect(dialog.closest('[dir]')).toHaveAttribute('dir', 'ltr');
    await expect(document.documentElement).toHaveAttribute('lang', 'es');
    receiveSavedLanguage('en');
    await expect(
      await screen.findByRole('dialog', { name: 'Something went wrong.' }),
    ).toBeVisible();
    await expect(dialog.closest('[lang]')).toHaveAttribute('lang', 'en');
    await expect(document.documentElement).toHaveAttribute('lang', 'en');
  },
};

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import {
  AppI18nProvider,
  useAppIntl,
  useAppLocale,
} from '@codaco/app-i18n/react';

import LocaleLoadFailureToast from './LocaleLoadFailureToast';
import { withToastProvider } from './storybook-support/withToastProvider';

const unavailable = new Error('Failed to fetch dynamically imported module');

/**
 * Stands in for a host whose language download failed: the toolbar's language
 * stays on screen, and Español (Français when the toolbar is already on
 * Español) is the one that could not be loaded.
 */
function FailedLanguage({ children }: { children: ReactNode }) {
  const { locale, locales } = useAppLocale();
  const { messages } = useAppIntl();
  return (
    <AppI18nProvider
      locale={locale}
      locales={locales}
      messages={messages}
      loadFailure={{
        locale: locale === 'es' ? 'fr' : 'es',
        error: unavailable,
      }}
      manageDocument={false}
    >
      {children}
    </AppI18nProvider>
  );
}

const withFailedLanguage: Decorator = (Story) => (
  <FailedLanguage>
    <Story />
  </FailedLanguage>
);

const meta = {
  title: 'Components/LocaleLoadFailureToast',
  component: LocaleLoadFailureToast,
  decorators: [withFailedLanguage, withToastProvider],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Tells the user that the language they chose could not be downloaded and which language is on screen instead. Mount it once inside the host’s `Toast.Provider`; it shows a toast while `useLocaleLoadFailure()` reports a failure and closes it when the language arrives.',
      },
    },
  },
  args: { onFailure: fn() },
  tags: ['autodocs'],
} satisfies Meta<typeof LocaleLoadFailureToast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithReload: Story = {
  args: { onReload: fn() },
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reload' }),
    );
    await expect(args.onReload).toHaveBeenCalledOnce();
    await expect(args.onFailure).toHaveBeenCalledOnce();
  },
};

/** For a host where reloading would cost more than the language, such as an interview. */
export const WithoutReload: Story = {
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    await screen.findByText('Showing English instead.');
    await expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  },
};

import { act, render, screen, waitFor } from '@testing-library/react';
import { startTransition, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import { architectProductionLocales } from '~/i18n/locales';

import { ShellLanguageMessage } from '../ShellLanguageMessage';

// A French catalog that is not loaded when the message first renders in
// French, and whose load settles within microtasks — as an import already in
// the module cache does.
vi.mock('~/locales/catalogs', async () => {
  const { createCatalogSource } = await import('@codaco/app-i18n/locales');
  return {
    architectCatalogSource: createCatalogSource({
      fr: () =>
        Promise.resolve({
          default: { 'test.shellLanguage.greeting': 'Bonjour' },
        }),
    }),
  };
});

const messages = defineMessages({
  greeting: {
    id: 'test.shellLanguage.greeting',
    defaultMessage: 'Hello',
    description: 'Test message.',
  },
});

const switchLocale: { current: (locale: string) => void } = {
  current: () => undefined,
};

// Stands in for the Shell's provider, whose language can change under a
// message that is already showing.
function ShellLanguage() {
  const [locale, setLocale] = useState('en');
  switchLocale.current = setLocale;
  return (
    <AppI18nProvider
      locale={locale}
      locales={architectProductionLocales}
      manageDocument={false}
    >
      <ShellLanguageMessage message={messages.greeting} />
    </AppI18nProvider>
  );
}

type ActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('ShellLanguageMessage', () => {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    errors.push(event.error);
    event.preventDefault();
  };
  const actGlobal: ActGlobal = globalThis;
  const actEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;

  afterEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    window.removeEventListener('error', onError);
    errors.length = 0;
  });

  it('changes to a language whose catalog loads during a concurrent render, without a render error', async () => {
    window.addEventListener('error', onError);
    await act(async () => {
      render(<ShellLanguage />);
    });
    expect(screen.getByText('Hello')).toBeInTheDocument();

    // A transition outside act renders concurrently: React yields while the
    // catalog loads and, once it has, replays the suspended message rather
    // than unwinding to its fallback. That replay is what failed.
    //
    // React also logs a development warning here, that `use()` was not called
    // when the replay finished: `useLocaleCatalog` (@codaco/app-i18n) skips it
    // once the catalog is ready. That is the package's to fix; this guards
    // the error the host can prevent.
    actGlobal.IS_REACT_ACT_ENVIRONMENT = false;
    startTransition(() => switchLocale.current('fr'));

    await waitFor(() => {
      expect(screen.getByText('Bonjour')).toBeInTheDocument();
    });
    // React recovers by rendering the whole root again synchronously, so the
    // text alone cannot tell; the error it reports can.
    expect(errors).toEqual([]);
  });
});

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppIntl, useAppLocale } from '@codaco/app-i18n/react';

import { sessionQueryOptions } from '../../lib/session.ts';
import { studioCatalogSource } from '../../locales/catalogs.ts';
import {
  resolveInitialLocale,
  StudioI18nProvider,
} from '../StudioI18nProvider.tsx';

/**
 * `main.tsx` loads the catalog for `resolveInitialLocale()` and only then
 * renders, which is what keeps a returning en-GB researcher from a US English
 * flash (design invariant 7). That only works while it names the locale the
 * provider really starts in, so these render the provider the way the app
 * does — nothing awaited between the load and the render — and read what it
 * produced.
 */

const MIRROR_KEY = 'studio.locale';

/** What the browser asks for, which jsdom does not otherwise let a test say. */
function setBrowserLanguages(languages: readonly string[]) {
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  });
}

let rendered: { locale: string; sentence: string } | null;

function Probe() {
  const { locale } = useAppLocale();
  const intl = useAppIntl();
  rendered = {
    locale,
    // One of Studio's own overrides, so an English fallback is distinguishable
    // from the British catalog having arrived.
    sentence: intl.formatMessage({
      id: 'studio.teamActivity.unrecognizedEvent',
      defaultMessage: 'Unrecognized event',
      description: 'Test fixture.',
    }),
  };
  return null;
}

async function renderFirstPaint() {
  await studioCatalogSource.load(resolveInitialLocale());
  const queryClient = new QueryClient();
  queryClient.setQueryData(sessionQueryOptions.queryKey, 'signedOut');
  render(
    <QueryClientProvider client={queryClient}>
      <StudioI18nProvider>
        <Probe />
      </StudioI18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rendered = null;
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  setBrowserLanguages(['en-US', 'en']);
});

describe('the locale the first render lands in', () => {
  it('is the device mirror, with its catalog already in place', async () => {
    window.localStorage.setItem(MIRROR_KEY, 'en-GB');

    await renderFirstPaint();

    expect(resolveInitialLocale()).toBe('en-GB');
    expect(rendered).toEqual({
      locale: 'en-GB',
      sentence: 'Unrecognised event',
    });
    expect(document.documentElement.lang).toBe('en-GB');
  });

  it('is what the browser negotiates when there is no mirror', async () => {
    setBrowserLanguages(['en-GB', 'en']);

    await renderFirstPaint();

    expect(resolveInitialLocale()).toBe('en-GB');
    expect(rendered).toEqual({
      locale: 'en-GB',
      sentence: 'Unrecognised event',
    });
  });

  it('is English, which has no catalog to wait for', async () => {
    await renderFirstPaint();

    expect(resolveInitialLocale()).toBe('en');
    expect(rendered).toEqual({
      locale: 'en',
      sentence: 'Unrecognized event',
    });
  });

  it('negotiates past a mirror naming a locale Studio no longer declares', async () => {
    window.localStorage.setItem(MIRROR_KEY, 'xx');
    setBrowserLanguages(['en-GB', 'en']);

    await renderFirstPaint();

    expect(resolveInitialLocale()).toBe('en-GB');
    expect(rendered?.locale).toBe('en-GB');
  });
});

import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryPage from '../SummaryPage';

// Resource previews read blobs from storage, which the summary text does not.
vi.mock('~/utils/assetUtils', () => ({
  getAssetBlobUrl: vi.fn(async () => null),
  revokeBlobUrl: vi.fn(),
}));

const bilingualProtocol: CurrentProtocol = {
  name: 'Bilingual study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  codebook: {},
  assetManifest: {},
  stages: [
    {
      id: 'welcome',
      type: 'Information',
      label: { en: 'Welcome', fr: 'Bienvenue' },
      title: { en: 'Hello', fr: 'Bonjour' },
      items: [
        { id: 'intro', type: 'text', content: { en: 'Written in English' } },
      ],
    },
  ],
};

const renderSummary = (protocol: CurrentProtocol) => {
  const store = configureStore({
    reducer: { activeProtocol: (state = { present: protocol }) => state },
  });
  return render(
    <Provider store={store}>
      <SummaryPage />
    </Provider>,
  );
};

afterEach(() => {
  document.documentElement.classList.remove('summary-view');
});

describe('<SummaryPage /> language', () => {
  it('shows the protocol text in the default language first', () => {
    renderSummary(bilingualProtocol);

    const language = screen.getByRole('combobox', {
      name: 'Summary language',
    });
    expect(language).toHaveValue('en');
    expect(
      [...language.querySelectorAll('option')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['English', 'French']);
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(screen.getByText('Hello')).toHaveAttribute('lang', 'en');
  });

  it('switches every protocol text to the chosen language, marking fallbacks with their own language', () => {
    renderSummary(bilingualProtocol);

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Summary language' }),
      { target: { value: 'fr' } },
    );

    expect(screen.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
    expect(screen.getByText('Bonjour')).toHaveAttribute('lang', 'fr');
    expect(
      screen.getByText('Written in English').closest('[lang]'),
    ).toHaveAttribute('lang', 'en');
  });

  it('sets the reading direction of right-to-left text', () => {
    renderSummary({
      ...bilingualProtocol,
      localization: { defaultLocale: 'ar', locales: ['ar'] },
      stages: [
        {
          id: 'welcome',
          type: 'Information',
          label: { ar: 'مرحبا' },
          title: { ar: 'أهلا' },
          items: [],
        },
      ],
    });

    expect(screen.getByText('أهلا')).toHaveAttribute('dir', 'rtl');
  });

  it('offers no language choice for a protocol in one language', () => {
    renderSummary({
      ...bilingualProtocol,
      localization: { defaultLocale: 'en', locales: ['en'] },
    });

    expect(
      screen.queryByRole('combobox', { name: 'Summary language' }),
    ).not.toBeInTheDocument();
  });
});

import { configureStore } from '@reduxjs/toolkit';
import { render, screen, within } from '@testing-library/react';
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
      content: { en: '# Hello', fr: '# Bonjour' },
    },
    {
      id: 'thanks',
      type: 'Information',
      label: { en: 'Thanks', fr: 'Merci' },
      content: { en: 'Written in English' },
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
  it('offers no choice of summary language', () => {
    renderSummary(bilingualProtocol);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows every protocol text in every protocol language', () => {
    renderSummary(bilingualProtocol);

    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    expect(screen.getByText('Hello').closest('[lang]')).toHaveAttribute(
      'lang',
      'en',
    );
    expect(screen.getByText('Bonjour').closest('[lang]')).toHaveAttribute(
      'lang',
      'fr',
    );
    expect(
      screen.getByText('Written in English').closest('[lang]'),
    ).toHaveAttribute('lang', 'en');
    expect(
      screen.getByText('Not translated yet. Participants see it in English.'),
    ).toBeVisible();
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
          content: { ar: '# أهلا' },
        },
      ],
    });

    expect(screen.getByText('أهلا').closest('[dir]')).toHaveAttribute(
      'dir',
      'rtl',
    );
  });

  it('lists the languages on the cover alphabetically, whatever order the protocol declares them in', () => {
    renderSummary({
      ...bilingualProtocol,
      localization: { defaultLocale: 'fr', locales: ['fr', 'de', 'en'] },
    });

    const languages = screen.getByRole('heading', {
      name: 'Languages',
    }).nextElementSibling;
    if (!(languages instanceof HTMLElement)) {
      throw new Error('The cover lists no languages.');
    }
    expect(
      within(languages)
        .getAllByRole('listitem')
        .map((language) => language.textContent),
    ).toEqual(['English', 'FrenchDefault', 'German']);
  });

  it('prints a protocol in one language without naming its language', () => {
    renderSummary({
      ...bilingualProtocol,
      localization: { defaultLocale: 'en', locales: ['en'] },
    });

    expect(
      screen.queryByRole('heading', { name: 'Languages' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
    expect(screen.getByText('Hello').closest('[lang]')).toHaveAttribute(
      'lang',
      'en',
    );
  });
});

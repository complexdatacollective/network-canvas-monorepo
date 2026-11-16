import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import Cover from '../Cover';
import SummaryContext from '../SummaryContext';

afterEach(cleanup);

const renderCover = (localization: CurrentProtocol['localization']) => {
  const protocol: CurrentProtocol = {
    name: 'Study',
    schemaVersion: 9,
    lastModified: '2026-11-12T10:00:00.000Z',
    localization,
    assetManifest: {},
    codebook: {},
    stages: [],
  };
  return render(
    <ArchitectI18nProvider>
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <Cover />
      </SummaryContext.Provider>
    </ArchitectI18nProvider>,
  );
};

describe('the cover of the printable summary', () => {
  // Swahili is a language Network Canvas has no built-in wording in, so a
  // protocol whose default language it is names a fallback language.
  it('names the fallback language of a protocol that has one, even with a single language', () => {
    renderCover({
      defaultLocale: 'sw',
      locales: ['sw'],
      fallbackLocale: 'es',
    });

    expect(screen.getByText('Fallback language: Spanish')).toBeInTheDocument();
  });

  it('says nothing about one for a protocol that names none', () => {
    renderCover({ defaultLocale: 'en', locales: ['en', 'fr'] });

    expect(screen.queryByText(/Fallback language/)).not.toBeInTheDocument();
  });
});

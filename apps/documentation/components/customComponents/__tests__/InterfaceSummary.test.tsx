import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';

import en from '~/messages/en.json';
import es from '~/messages/es.json';

import { InterfaceMeta } from '../InterfaceSummary';

const renderMeta = (
  locale: 'en' | 'es',
  props: { creates: string; requires: string },
) =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : es}
      timeZone="UTC"
    >
      <InterfaceMeta
        type="Geospatial"
        usesprompts="true"
        compatibility={null}
        {...props}
      />
    </NextIntlClientProvider>,
  );

// The requirement's text sits directly in its pill, beside the icon.
const pill = (text: string) => screen.getByText(text);

afterEach(cleanup);

describe('InterfaceMeta', () => {
  it('labels its fields in the page language', () => {
    renderMeta('es', { creates: 'Nodos', requires: 'Internet' });

    for (const label of [
      es.InterfaceSummary.type,
      es.InterfaceSummary.creates,
      es.InterfaceSummary.usesPrompts,
      es.InterfaceSummary.requires,
      es.InterfaceSummary.yes,
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(en.InterfaceSummary.creates)).toBeNull();
  });

  it.each([
    ['en', 'Internet, Mapbox account', ['Internet', 'Mapbox account']],
    ['es', 'Internet, cuenta de Mapbox', ['Internet', 'cuenta de Mapbox']],
    ['en', 'Roster data', ['Roster data']],
    [
      'es',
      'Datos de una lista predefinida',
      ['Datos de una lista predefinida'],
    ],
  ] as const)(
    'gives every %s requirement in "%s" an icon',
    (locale, requires, requirements) => {
      renderMeta(locale, { creates: 'Nodes', requires });

      for (const requirement of requirements) {
        expect(pill(requirement).querySelector('svg')).not.toBeNull();
      }
    },
  );

  it('renders no icon for a requirement it does not recognise', () => {
    renderMeta('en', { creates: 'Nodes', requires: 'Patience' });

    expect(pill('Patience').querySelector('svg')).toBeNull();
  });
});

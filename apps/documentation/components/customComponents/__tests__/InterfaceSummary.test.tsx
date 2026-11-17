import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';

import { getCompatibility } from '~/lib/interfaceCompatibility';
import en from '~/messages/en.json';
import es from '~/messages/es.json';
import fr from '~/messages/fr.json';

import { InterfaceMeta } from '../InterfaceSummary';

const messagesByLocale = { en, es, fr };

const renderMeta = (
  locale: keyof typeof messagesByLocale,
  props: { creates: string; requires: string },
) =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={messagesByLocale[locale]}
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
    ['fr', 'Internet, compte Mapbox', ['Internet', 'compte Mapbox']],
    ['fr', 'Données de liste', ['Données de liste']],
  ] as const)(
    'gives every %s requirement in "%s" an icon',
    (locale, requires, requirements) => {
      renderMeta(locale, { creates: 'Nodes', requires });

      for (const requirement of requirements) {
        expect(pill(requirement).querySelector('svg')).not.toBeNull();
      }
    },
  );

  it('lists apps an interface is unavailable in, by role', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <InterfaceMeta
          type="Geospatial"
          creates="Nodes"
          usesprompts="true"
          compatibility={getCompatibility('geospatial')}
        />
      </NextIntlClientProvider>,
    );

    const configure = screen.getByText(
      en.InterfaceSummary.configureIn,
    ).nextElementSibling;
    const run = screen.getByText(en.InterfaceSummary.runIn).nextElementSibling;

    expect(configure).toHaveTextContent('Architect Classic (not available)');
    expect(configure).toHaveTextContent(/Architect$/);
    expect(run).toHaveTextContent('Interviewer Classic (not available)');
    expect(run).not.toHaveTextContent('Fresco (not available)');
    expect(run).toHaveTextContent('Fresco');
    expect(
      screen.getByRole('link', { name: 'protocol schema' }),
    ).toHaveAttribute('href', '/en/get-started/protocol-schema-information');
  });

  it('renders no icon for a requirement it does not recognise', () => {
    renderMeta('en', { creates: 'Nodes', requires: 'Patience' });

    expect(pill('Patience').querySelector('svg')).toBeNull();
  });
});

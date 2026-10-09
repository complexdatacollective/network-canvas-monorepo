import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import IntroductionPanel from '../IntroductionPanel';

const protocolIn = (locales: string[]) =>
  ({
    schemaVersion: 9,
    name: 'Introduction protocol',
    localization: { defaultLocale: 'en', locales },
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
    stages: [],
  }) satisfies CurrentProtocol;

const renderPanel = (
  locales: string[],
  introductionPanel: Parameters<
    typeof IntroductionPanel
  >[0]['introductionPanel'],
) => {
  const protocol = protocolIn(locales);
  return render(
    <SummaryContext.Provider
      value={{ protocol, protocolName: protocol.name, index: [] }}
    >
      <IntroductionPanel introductionPanel={introductionPanel} />
    </SummaryContext.Provider>,
  );
};

// A panel's text is optional: a panel can show only its title.
describe('Protocol Summary introduction panel', () => {
  it('lists the title and the text of a multilingual panel', () => {
    renderPanel(['en', 'fr'], {
      title: { en: 'Welcome', fr: 'Bienvenue' },
      text: { en: 'Hello', fr: 'Bonjour' },
    });

    expect(screen.getByRole('row', { name: /Title/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Text/ })).toBeInTheDocument();
  });

  it('lists no text row for a multilingual panel with only a title', () => {
    renderPanel(['en', 'fr'], { title: { en: 'Welcome', fr: 'Bienvenue' } });

    expect(screen.getByRole('row', { name: /Title/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Text/ })).not.toBeInTheDocument();
  });

  it('shows only the heading of a panel with only a title', () => {
    const { container } = renderPanel(['en'], { title: { en: 'Welcome' } });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Welcome' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });
});

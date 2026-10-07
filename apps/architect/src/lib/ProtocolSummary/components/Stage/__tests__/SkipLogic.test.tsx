import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  CurrentProtocol,
  SkipLogicDestination,
} from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import SkipLogic from '../SkipLogic';

const protocol = {
  schemaVersion: 9,
  name: 'Skip destination protocol',
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [
    {
      id: 'source',
      type: 'Information',
      label: { en: 'Source', fr: 'Source' },
      title: { en: 'Source', fr: 'Source' },
      items: [],
    },
    {
      id: 'debrief',
      type: 'Information',
      label: { en: 'Debrief', fr: 'Bilan' },
      title: { en: 'Debrief', fr: 'Bilan' },
      items: [],
    },
  ],
} satisfies CurrentProtocol;

describe('Protocol Summary skip logic', () => {
  const renderSkipLogic = (
    destination?: SkipLogicDestination,
    localization: CurrentProtocol['localization'] = protocol.localization,
  ) =>
    render(
      <SummaryContext.Provider
        value={{
          protocol: { ...protocol, localization },
          protocolName: protocol.name,
          index: [],
        }}
      >
        <SkipLogic
          skipLogic={{
            action: 'SKIP',
            destination,
            filter: { join: 'AND', rules: [] },
          }}
        />
      </SummaryContext.Provider>,
    );

  const destinationRow = () => screen.getByText('Destination').closest('tr');

  it('includes the resolved destination stage', () => {
    renderSkipLogic({ type: 'stage', stageId: 'debrief' });

    expect(destinationRow()).toHaveTextContent('Stage 2 — Debrief');
    expect(screen.getByText('Debrief')).toHaveAttribute('lang', 'en');
  });

  it('names the destination stage in the default language', () => {
    renderSkipLogic(
      { type: 'stage', stageId: 'debrief' },
      { defaultLocale: 'fr', locales: ['en', 'fr'] },
    );

    expect(destinationRow()).toHaveTextContent('Stage 2 — Bilan');
    expect(screen.getByText('Bilan')).toHaveAttribute('lang', 'fr');
  });

  it('shows the next available stage for legacy skip logic', () => {
    renderSkipLogic();

    expect(screen.getByText('Next available stage')).toBeInTheDocument();
  });

  it('shows the interview end for a finish destination', () => {
    renderSkipLogic({ type: 'finish' });

    expect(screen.getByText('End interview')).toBeInTheDocument();
  });
});

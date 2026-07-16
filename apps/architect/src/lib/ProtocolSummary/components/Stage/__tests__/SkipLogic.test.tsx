import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  CurrentProtocol,
  SkipLogicDestination,
} from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import SkipLogic from '../SkipLogic';

const protocol = {
  schemaVersion: 8,
  name: 'Skip destination protocol',
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [
    {
      id: 'source',
      type: 'Information',
      label: 'Source',
      title: 'Source',
      items: [],
    },
    {
      id: 'debrief',
      type: 'Information',
      label: 'Debrief',
      title: 'Debrief',
      items: [],
    },
  ],
} satisfies CurrentProtocol;

describe('Protocol Summary skip logic', () => {
  const renderSkipLogic = (destination?: SkipLogicDestination) =>
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
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

  it('includes the resolved destination stage', () => {
    renderSkipLogic({ type: 'stage', stageId: 'debrief' });

    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.getByText('Stage 2 — Debrief')).toBeInTheDocument();
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

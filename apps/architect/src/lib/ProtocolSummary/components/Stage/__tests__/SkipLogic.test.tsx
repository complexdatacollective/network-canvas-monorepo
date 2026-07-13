import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import SkipLogic from '../SkipLogic';

const protocol = {
  schemaVersion: 8,
  name: 'Skip destination protocol',
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [
    { id: 'source', type: 'Information', label: 'Source', items: [] },
    { id: 'debrief', type: 'Information', label: 'Debrief', items: [] },
  ],
} satisfies CurrentProtocol;

describe('Protocol Summary skip logic', () => {
  it('includes the resolved destination stage', () => {
    render(
      <SummaryContext.Provider
        value={{ protocol, protocolName: protocol.name, index: [] }}
      >
        <SkipLogic
          skipLogic={{
            action: 'SKIP',
            destination: { type: 'stage', stageId: 'debrief' },
            filter: { join: 'AND', rules: [] },
          }}
        />
      </SummaryContext.Provider>,
    );

    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.getByText('Stage 2 — Debrief')).toBeInTheDocument();
  });
});

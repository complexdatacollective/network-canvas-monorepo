import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProtocolInfo } from '../protocolInfoDialog';

describe('ProtocolInfo', () => {
  it('lists the schema and the interviews, and names no other place for them', () => {
    render(
      <ProtocolInfo
        protocol={{
          id: 'row',
          hash: 'hash',
          name: 'Wave One',
          schemaVersion: 8,
          importedAt: '2025-05-20T10:00:00.000Z',
          codebook: {},
          protocol: { schemaVersion: 8, codebook: {}, stages: [] },
          sessionCount: 12,
        }}
      />,
    );
    expect(screen.getByText('Schema version').nextSibling).toHaveTextContent(
      '8',
    );
    expect(screen.getByText('Interviews').nextSibling).toHaveTextContent('12');
    expect(screen.queryByText('Last changed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Interviewer 8/)).not.toBeInTheDocument();
  });
});

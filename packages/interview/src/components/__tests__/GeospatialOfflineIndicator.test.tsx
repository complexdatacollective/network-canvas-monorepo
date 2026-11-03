import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';

let online = true;
vi.mock('../../hooks/useOnline', () => ({
  default: () => online,
}));

import { GeospatialOfflineIndicator } from '../GeospatialOfflineIndicator';

describe('GeospatialOfflineIndicator', () => {
  it('renders the offline notice when offline on a Geospatial stage', () => {
    online = false;
    render(
      <TestProtocolLocalization>
        <GeospatialOfflineIndicator onMapStage />
      </TestProtocolLocalization>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(
      'You are offline — the map will not load until you reconnect.',
    );
  });

  it('renders nothing when online on a Geospatial stage', () => {
    online = true;
    const { container } = render(
      <TestProtocolLocalization>
        <GeospatialOfflineIndicator onMapStage />
      </TestProtocolLocalization>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when offline but not on a Geospatial stage', () => {
    online = false;
    const { container } = render(
      <TestProtocolLocalization>
        <GeospatialOfflineIndicator onMapStage={false} />
      </TestProtocolLocalization>,
    );
    expect(container.innerHTML).toBe('');
  });
});

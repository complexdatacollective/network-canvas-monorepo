import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';

let online = true;
vi.mock('../../hooks/useOnline', () => ({
  default: () => online,
}));

import { GeospatialOfflineIndicator } from '../GeospatialOfflineIndicator';

const NOTICE = { en: 'You are offline. The map will not load.' };

describe('GeospatialOfflineIndicator', () => {
  it('renders the stage’s offline notice when offline on a Geospatial stage', () => {
    online = false;
    render(
      <TestProtocolLocalization>
        <GeospatialOfflineIndicator notice={NOTICE} />
      </TestProtocolLocalization>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('You are offline. The map will not load.');
  });

  it('renders nothing when online on a Geospatial stage', () => {
    online = true;
    const { container } = render(
      <TestProtocolLocalization>
        <GeospatialOfflineIndicator notice={NOTICE} />
      </TestProtocolLocalization>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when offline but not on a Geospatial stage', () => {
    online = false;
    const { container } = render(
      <TestProtocolLocalization>
        <GeospatialOfflineIndicator notice={undefined} />
      </TestProtocolLocalization>,
    );
    expect(container.innerHTML).toBe('');
  });
});

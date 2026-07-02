import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let online = true;
vi.mock('~/hooks/useOnline', () => ({
  default: () => online,
}));

import { GeospatialOfflineIndicator } from '../GeospatialOfflineIndicator';

describe('GeospatialOfflineIndicator', () => {
  it('renders an offline banner when active and offline', () => {
    online = false;
    render(<GeospatialOfflineIndicator active />);
    const status = screen.getByRole('status');
    expect(/offline/i.test(status.textContent ?? '')).toBe(true);
  });

  it('renders nothing when active but online', () => {
    online = true;
    const { container } = render(<GeospatialOfflineIndicator active />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when offline but not on a Geospatial stage', () => {
    online = false;
    const { container } = render(<GeospatialOfflineIndicator active={false} />);
    expect(container.innerHTML).toBe('');
  });
});

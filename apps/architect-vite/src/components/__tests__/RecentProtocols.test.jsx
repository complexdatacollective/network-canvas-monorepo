import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { UnconnectedRecentProtocols } from '../RecentProtocols';

const mockProps = {
  recentProtocols: [],
};

describe('<RecentProtocols />', () => {
  it('can render?', () => {
    const { container } = render(<UnconnectedRecentProtocols {...mockProps} />);

    expect(container).toMatchSnapshot();
  });
});

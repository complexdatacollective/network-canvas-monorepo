import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { Timeline } from '../Timeline';

const mockProps = {
  deleteStage: () => {},
  openDialog: () => {},
  openScreen: () => {},
  locus: 0,
};

describe('<Timeline />', () => {
  it('renders stages', () => {
    const mockStages = [{ id: 1, type: 'NameGenerator' }, { id: 2, type: 'Sociogram' }];

    const { container } = render(<Timeline {...mockProps} stages={mockStages} />);

    // Check that stages are rendered (this might need adjustment based on actual component structure)
    const stageElements = container.querySelectorAll('[data-testid="stage"], .stage');
    expect(stageElements).toHaveLength(2);
  });
});

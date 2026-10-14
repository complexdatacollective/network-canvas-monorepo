import { render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { describe, expect, it } from 'vitest';

import NodeDropAnimation from './NodeDropAnimation';

describe('NodeDropAnimation', () => {
  it('is hidden from assistive technology', () => {
    render(<NodeDropAnimation />);
    expect(screen.getByTestId('node-drop-animation')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('shows a still frame when motion is reduced', () => {
    render(
      <MotionConfig reducedMotion="always">
        <NodeDropAnimation />
      </MotionConfig>,
    );
    const root = screen.getByTestId('node-drop-animation');
    const node = root.lastElementChild;
    expect(node).toHaveClass('-translate-y-3/4');
    expect(node?.getAttribute('style') ?? '').not.toMatch(/transform|opacity/);
  });
});

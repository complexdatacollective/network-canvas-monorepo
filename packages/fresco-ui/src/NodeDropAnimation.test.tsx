import { render, screen } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { describe, expect, it } from 'vitest';

import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import NodeDropAnimation from './NodeDropAnimation';

describe('NodeDropAnimation', () => {
  it('animates, hidden from assistive technology', async () => {
    await withAnimationsEnabled(() => {
      render(
        <MotionConfig reducedMotion="never">
          <NodeDropAnimation />
        </MotionConfig>,
      );
      const root = screen.getByTestId('node-drop-animation');
      expect(root).toHaveAttribute('aria-hidden', 'true');
      expect(root).not.toHaveAttribute('data-still');
    });
  });

  it('shows a still frame when motion is reduced', () => {
    render(
      <MotionConfig reducedMotion="always">
        <NodeDropAnimation />
      </MotionConfig>,
    );
    const root = screen.getByTestId('node-drop-animation');
    expect(root).toHaveAttribute('data-still');
    expect(root.querySelector('[style*="transform"]')).toBeNull();
  });
});

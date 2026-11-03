import { act, render, screen, waitFor } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';

import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import NodeDropAnimation from './NodeDropAnimation';

describe('NodeDropAnimation', () => {
  it('animates, hidden from assistive technology', async () => {
    await withAnimationsEnabled(async () => {
      render(
        <MotionConfig reducedMotion="never">
          <NodeDropAnimation />
        </MotionConfig>,
      );
      const root = screen.getByTestId('node-drop-animation');
      expect(root).toHaveAttribute('aria-hidden', 'true');
      expect(root).not.toHaveAttribute('data-still');

      // The pointer heads for the node from the start, so its position
      // changes within the first moments of the loop.
      const moving = () =>
        Array.from(root.querySelectorAll<SVGElement>('[style*="transform"]'))
          .map((el) => el.style.transform)
          .join('|');
      const first = moving();
      expect(first).not.toBe('');
      await waitFor(() => expect(moving()).not.toBe(first));
    });
  });

  it('shows a still frame while its window is not focused, and animates when it returns', async () => {
    let focused = false;
    const hasFocus = vi
      .spyOn(document, 'hasFocus')
      .mockImplementation(() => focused);
    try {
      await withAnimationsEnabled(async () => {
        render(
          <MotionConfig reducedMotion="never">
            <NodeDropAnimation />
          </MotionConfig>,
        );
        expect(screen.getByTestId('node-drop-animation')).toHaveAttribute(
          'data-still',
        );

        await act(async () => {
          focused = true;
          window.dispatchEvent(new Event('focus'));
        });
        expect(screen.getByTestId('node-drop-animation')).not.toHaveAttribute(
          'data-still',
        );
      });
    } finally {
      hasFocus.mockRestore();
    }
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

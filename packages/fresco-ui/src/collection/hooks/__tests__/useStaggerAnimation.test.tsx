import { render, screen, waitFor } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import { staggerSelector, useStaggerAnimation } from '../useStaggerAnimation';

function StaggeredItems({ count }: { count: number }) {
  const scope = useStaggerAnimation(true, count);
  return (
    <div ref={scope}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} data-stagger-item data-testid="item" />
      ))}
    </div>
  );
}

describe('useStaggerAnimation', () => {
  it('finishes the entrance when StrictMode remounts the list', async () => {
    // StrictMode ends each new mount and mounts it again. The end of the
    // first mount stops the entrance before it finishes, so the second mount
    // has to play it again. In a browser, Motion 14 has already written the
    // first keyframe by then, so a stopped entrance leaves the items at
    // opacity 0.
    await withAnimationsEnabled(async () => {
      render(
        <StrictMode>
          <MotionConfig reducedMotion="never">
            <StaggeredItems count={3} />
          </MotionConfig>
        </StrictMode>,
      );

      await waitFor(
        () => {
          for (const item of screen.getAllByTestId('item')) {
            expect(item.style.opacity).toBe('1');
          }
        },
        { timeout: 3000 },
      );
    });
  });
});

describe('staggerSelector', () => {
  it('targets every item without a key', () => {
    expect(staggerSelector()).toBe('[data-stagger-item]');
  });

  it('scopes to the current key', () => {
    expect(staggerSelector('sort::asc')).toBe(
      '[data-stagger-item][data-stagger-key="sort::asc"]',
    );
    expect(staggerSelector(3)).toBe(
      '[data-stagger-item][data-stagger-key="3"]',
    );
  });

  it('escapes a key that carries selector metacharacters', () => {
    // A search query is a typical key; a quoted phrase must not end the
    // attribute value early and leave an invalid selector behind.
    const selector = staggerSelector('"network" \\ end');

    expect(selector).toBe(
      '[data-stagger-item][data-stagger-key="\\"network\\" \\\\ end"]',
    );
    expect(() => document.querySelectorAll(selector)).not.toThrow();
  });
});

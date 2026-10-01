import type * as MotionReact from 'motion/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn<() => boolean | null>(),
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  return { ...actual, useReducedMotion: mockUseReducedMotion };
});

import { Reveal } from '../Reveal';

/**
 * `useReducedMotion()` answers `null` on the server — motion only learns the
 * preference from `matchMedia`, which the server has no access to — and `true`
 * or `false` on the client. So anything the server serialises must not depend
 * on it: motion writes a resolved `initial` into the SSR markup as an inline
 * style, and a visitor who prefers reduced motion would then hydrate markup
 * that disagrees with what their client renders.
 *
 * React reports that class of disagreement as an attribute mismatch, which it
 * explicitly "won't patch up" rather than routing to `onRecoverableError`, so a
 * hydration-error spy cannot see it. Comparing the server markup across the
 * three answers can, and states the invariant directly.
 */
const serverMarkupFor = (preference: boolean | null) => {
  mockUseReducedMotion.mockReturnValue(preference);
  return renderToString(
    <Reveal>
      <p>content</p>
    </Reveal>,
  );
};

describe('Reveal server markup', () => {
  it('does not depend on the reduced-motion preference', () => {
    const server = serverMarkupFor(null);

    expect(serverMarkupFor(false)).toBe(server);
    // The case that was broken: motion resolved `initial` to inline
    // `opacity: 0; transform: translateY(24px)` for the server and to nothing
    // for a reduced-motion client.
    expect(serverMarkupFor(true)).toBe(server);
  });

  it('still renders its children into the server markup', () => {
    expect(serverMarkupFor(null)).toContain('content');
  });
});

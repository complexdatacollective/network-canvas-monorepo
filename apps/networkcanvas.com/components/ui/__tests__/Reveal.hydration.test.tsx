import type * as MotionReact from 'motion/react';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { mockUseReducedMotion } = vi.hoisted(() => ({
  mockUseReducedMotion: vi.fn<() => boolean | null>(),
}));

// Partial, not wholesale: the real `motion/react` has to stay in place so the
// `motion.div` under test still resolves `initial` into markup. Replacing the
// whole module would reduce this to a test of the mock, and would also make
// `useReducedMotion` incapable of returning the `null` that only the server
// ever sees — the exact blind spot that let this class of bug through.
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  return { ...actual, useReducedMotion: mockUseReducedMotion };
});

const { Reveal } = await import('../Reveal');
const { scrollDrivenRevealMotion } = await import('../scrollDrivenMotion');

/**
 * `useReducedMotion()` answers `null` on the server — motion only learns the
 * preference from `matchMedia`, which the server has no access to — and `true`
 * or `false` on the client. So nothing the server serialises may depend on it:
 * motion writes a resolved `initial` into the SSR markup as an inline style,
 * and a visitor who prefers reduced motion would then hydrate markup that
 * disagrees with what their own first render produces.
 *
 * React reports that class of disagreement as an attribute mismatch, which it
 * explicitly "won't patch up" rather than routing to `onRecoverableError`, so a
 * hydration-error spy cannot see it. Comparing the server markup across the
 * three answers can, and states the invariant directly.
 *
 * Honouring the preference is the app-root `<MotionConfig reducedMotion="user">`
 * in `app/[locale]/layout.tsx`, which needs no markup of its own and so cannot
 * reintroduce this.
 */
const serverMarkupFor = (element: ReactElement, preference: boolean | null) => {
  mockUseReducedMotion.mockReturnValue(preference);
  return renderToString(element);
};

const assertPreferenceIndependent = (element: ReactElement) => {
  const server = serverMarkupFor(element, null);

  // The case that was broken: motion resolved `initial` to inline
  // `opacity: 0; transform: translateY(24px)` for the server's `null`, and to
  // nothing at all for a reduced-motion client.
  expect(serverMarkupFor(element, false)).toBe(server);
  expect(serverMarkupFor(element, true)).toBe(server);

  return server;
};

describe('Reveal server markup', () => {
  it('does not depend on the reduced-motion preference when in-view driven', () => {
    assertPreferenceIndependent(
      <Reveal>
        <p>content</p>
      </Reveal>,
    );
  });

  // The variant every one of the site's live `<Reveal>` call sites selects, via
  // `scrollDrivenRevealMotion` / `summerUpdateRevealMotion`. It keeps its own
  // reduced-motion check — `MotionConfig` cannot neutralise scroll-linked
  // `MotionValue`s bound to `style`, because those are not animations — so the
  // invariant has to be asserted here rather than assumed from the branch
  // above. `useHasHydrated()` is what holds it.
  it('does not depend on the reduced-motion preference when scroll linked', () => {
    assertPreferenceIndependent(
      <Reveal {...scrollDrivenRevealMotion}>
        <p>content</p>
      </Reveal>,
    );
  });

  it('still renders its children into the server markup', () => {
    expect(
      serverMarkupFor(
        <Reveal>
          <p>content</p>
        </Reveal>,
        null,
      ),
    ).toContain('content');
  });
});

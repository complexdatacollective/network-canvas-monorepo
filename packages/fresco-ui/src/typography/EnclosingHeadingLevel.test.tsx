import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  EnclosingHeadingLevel,
  headingTagBelow,
  useEnclosingHeadingLevel,
} from './EnclosingHeadingLevel';

/**
 * Reports the tag a component inside the subtree would write, which is the
 * only thing the provider is for.
 */
const Probe = () => {
  const enclosing = useEnclosingHeadingLevel();
  return (
    <p>{enclosing === null ? 'nothing stated' : headingTagBelow(enclosing)}</p>
  );
};

describe('EnclosingHeadingLevel', () => {
  /**
   * The provider is what lets a component OUTSIDE fresco-ui — a stage editor
   * writing its own heading, a host mounting one under a heading of its own —
   * say what its subtree sits under. Reached through the package name rather
   * than the relative path, because a module every consumer needs and no
   * consumer can import is the failure this export exists to fix.
   */
  it('is reachable from outside the package at its own subpath', async () => {
    const publicModule =
      await import('@codaco/fresco-ui/typography/EnclosingHeadingLevel');

    expect(publicModule.EnclosingHeadingLevel).toBe(EnclosingHeadingLevel);
    expect(publicModule.useEnclosingHeadingLevel).toBe(
      useEnclosingHeadingLevel,
    );
    expect(publicModule.headingTagBelow).toBe(headingTagBelow);
  });

  it('states nothing of its own outside any subtree', () => {
    render(<Probe />);

    expect(screen.getByText('nothing stated')).toBeInTheDocument();
  });

  it('states the level it is given', () => {
    render(
      <EnclosingHeadingLevel level="h2">
        <Probe />
      </EnclosingHeadingLevel>,
    );

    expect(screen.getByText('h3')).toBeInTheDocument();
  });

  /**
   * Composes, rather than reading only the outermost statement: each heading
   * between here and the top states its own level as it goes, so the count is
   * always from the NEAREST one. Reading the outermost made a section's own
   * alert a peer of the section's heading instead of a child of it.
   */
  it('counts from the nearest statement, not the outermost', () => {
    render(
      <EnclosingHeadingLevel level="h2">
        <EnclosingHeadingLevel level="h3">
          <Probe />
        </EnclosingHeadingLevel>
      </EnclosingHeadingLevel>,
    );

    expect(screen.getByText('h4')).toBeInTheDocument();
  });

  it('stops at the deepest level HTML has', () => {
    expect(headingTagBelow('h5')).toBe('h6');
    expect(headingTagBelow('h6')).toBe('h6');
  });
});

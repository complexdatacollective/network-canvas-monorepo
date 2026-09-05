import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert, AlertTitle } from './Alert';

describe('Alert', () => {
  it('keeps the full intent colour for the soft appearance', () => {
    render(
      <Alert variant="accent" appearance="soft">
        Key concept
      </Alert>,
    );

    const alert = screen.getByRole('status');
    expect(alert).toHaveClass('bg-accent', 'text-accent-contrast');
    expect(alert.className).not.toContain('color-mix');
  });
});

/**
 * An alert can be raised anywhere, and a heading level is only correct
 * relative to the heading above it. Fixed at `h4`, an alert under an `h2`
 * skips a level: a `heading-order` failure, and for anyone navigating by
 * headings a title that reads as belonging to a subsection that is not there.
 */
describe('AlertTitle', () => {
  it('is a level-four heading by default', () => {
    render(<AlertTitle>Something happened</AlertTitle>);

    expect(
      screen.getByRole('heading', { name: 'Something happened', level: 4 }),
    ).toBeInTheDocument();
  });

  it('takes the level the surrounding outline needs', () => {
    render(<AlertTitle headingLevel="h3">Something happened</AlertTitle>);

    expect(
      screen.getByRole('heading', { name: 'Something happened', level: 3 }),
    ).toBeInTheDocument();
  });

  /**
   * The element changes; the treatment does not. An alert's title reads as an
   * alert's title at every depth, and `Heading` ties its size to `level` — so
   * a level passed straight through would have made a nested alert's title
   * larger than one at the top of a page. `text-sm font-black` is what the
   * `h4` + `all-caps` pair resolves to, and it is the thing that must survive.
   */
  it('keeps the same treatment at every level', () => {
    const { container: fourth } = render(<AlertTitle>Title</AlertTitle>);
    const { container: third } = render(
      <AlertTitle headingLevel="h3">Title</AlertTitle>,
    );

    const classesOf = (root: HTMLElement) =>
      [...(root.firstElementChild?.classList ?? [])].toSorted();

    expect(classesOf(third)).toContain('text-sm');
    expect(classesOf(third)).toEqual(classesOf(fourth));
  });
});

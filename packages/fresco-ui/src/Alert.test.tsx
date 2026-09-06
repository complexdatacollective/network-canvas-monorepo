import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert, AlertTitle } from './Alert';
import Dialog from './dialogs/Dialog';
import Section from './Section';

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
   * Derived rather than declared. An opt-in level is a level nobody opts into:
   * every alert in the codebase was raised without one, so the dialogs that
   * warn before deleting a participant's interviews each put an `h4` under
   * their own `h2` title — the failure the prop was added to fix, still there.
   */
  it('counts down from the dialog it is raised in', () => {
    render(
      <Dialog open title="Delete participants">
        <Alert variant="destructive">
          <AlertTitle>Warning</AlertTitle>
        </Alert>
      </Dialog>,
    );

    screen.getByRole('heading', { name: 'Delete participants', level: 2 });
    const title = screen.getByRole('heading', { name: 'Warning', level: 3 });
    // The element moved; the treatment did not.
    expect(title).toHaveClass('text-sm');
  });

  /**
   * One below the NEAREST heading, not one below the outermost one. A dialog
   * that says it encloses an `h2` is only right until something inside it
   * writes a heading of its own: a section in that dialog is an `h3`, and an
   * alert raised inside that section belongs under it. Counting from the
   * dialog put the alert's title beside the section's heading instead of
   * inside it — the same `heading-order` failure, one level down.
   */
  it('counts down from the section it is raised in', () => {
    render(
      <Dialog open title="Delete participants">
        <Section title="Interviews">
          <Alert variant="destructive">
            <AlertTitle>Warning</AlertTitle>
          </Alert>
        </Section>
      </Dialog>,
    );

    screen.getByRole('heading', { name: 'Delete participants', level: 2 });
    screen.getByRole('heading', { name: 'Interviews', level: 3 });
    screen.getByRole('heading', { name: 'Warning', level: 4 });
  });

  it('counts down from a section nested in another', () => {
    render(
      <Dialog open title="Delete participants">
        <Section title="Interviews">
          <Section title="Exports">
            <Alert variant="destructive">
              <AlertTitle>Warning</AlertTitle>
            </Alert>
          </Section>
        </Section>
      </Dialog>,
    );

    screen.getByRole('heading', { name: 'Interviews', level: 3 });
    screen.getByRole('heading', { name: 'Exports', level: 4 });
    screen.getByRole('heading', { name: 'Warning', level: 5 });
  });

  it('counts down from a section on an ordinary page', () => {
    render(
      <Section title="Interviews">
        <Alert variant="destructive">
          <AlertTitle>Warning</AlertTitle>
        </Alert>
      </Section>,
    );

    screen.getByRole('heading', { name: 'Interviews', level: 3 });
    screen.getByRole('heading', { name: 'Warning', level: 4 });
  });

  it('lets a caller name a level the enclosing outline does not imply', () => {
    render(
      <Dialog open title="Delete participants">
        <Alert variant="destructive">
          <AlertTitle headingLevel="h4">Warning</AlertTitle>
        </Alert>
      </Dialog>,
    );

    screen.getByRole('heading', { name: 'Warning', level: 4 });
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

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScrollArea } from './ScrollArea';

/**
 * jsdom lays nothing out, so overflow has to be declared. These override the
 * prototype getters for the duration of a test.
 */
const stubOverflow = (scrollHeight: number, clientHeight: number) => {
  for (const [property, value] of [
    ['scrollHeight', scrollHeight],
    ['clientHeight', clientHeight],
    ['scrollWidth', 0],
    ['clientWidth', 0],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get: () => value,
    });
  }
};

afterEach(() => {
  for (const property of [
    'scrollHeight',
    'clientHeight',
    'scrollWidth',
    'clientWidth',
  ]) {
    Reflect.deleteProperty(HTMLElement.prototype, property);
  }
});

const viewport = () => screen.getByTestId('viewport');

describe('ScrollArea keyboard reachability', () => {
  it('is not a tab stop when its content fits', async () => {
    stubOverflow(100, 100);
    render(
      <ScrollArea viewportClassName="v" data-testid="viewport">
        short
      </ScrollArea>,
    );

    await waitFor(() => expect(viewport()).toHaveAttribute('tabindex', '-1'));
  });

  it('is a tab stop when its content overflows', async () => {
    // A scrollable region must stay operable by keyboard (WCAG 2.1.1).
    stubOverflow(900, 100);
    render(
      <ScrollArea viewportClassName="v" data-testid="viewport">
        long
      </ScrollArea>,
    );

    await waitFor(() => expect(viewport()).toHaveAttribute('tabindex', '0'));
  });

  it('is a tab stop when it overflows with fade turned off', async () => {
    // The overflow measurement used to live behind `if (!viewport || !fade) return;`,
    // so a `fade={false}` region — the interviewer's validation error list, the
    // data table's faceted filter — could scroll but could never be reached.
    stubOverflow(900, 100);
    render(
      <ScrollArea fade={false} viewportClassName="v" data-testid="viewport">
        long
      </ScrollArea>,
    );

    await waitFor(() => expect(viewport()).toHaveAttribute('tabindex', '0'));
  });

  it('honours an explicit tabIndex over the measurement', async () => {
    stubOverflow(100, 100);
    render(
      <ScrollArea tabIndex={0} viewportClassName="v" data-testid="viewport">
        short
      </ScrollArea>,
    );

    await waitFor(() => expect(viewport()).toHaveAttribute('tabindex', '0'));
  });
});

describe('ScrollArea naming', () => {
  it('keeps a caller’s name off the region until it is a tab stop, when asked to', async () => {
    // A named `<section>` is a `region` landmark. Naming every scroll area
    // would add one per dialog, repeating the dialog's own name in a screen
    // reader's landmark list.
    stubOverflow(100, 100);
    render(
      <ScrollArea
        nameWhenScrollableOnly
        aria-label="Edit Field"
        viewportClassName="v"
        data-testid="viewport"
      >
        short
      </ScrollArea>,
    );

    await waitFor(() => expect(viewport()).toHaveAttribute('tabindex', '-1'));
    expect(viewport()).not.toHaveAttribute('aria-label');
  });

  it('honours a caller’s name unconditionally by default', async () => {
    // A consumer that names its region wants the landmark; only a caller that
    // opts in has its name tied to the tab stop.
    stubOverflow(100, 100);
    render(
      <ScrollArea
        aria-label="Interviewer changelog"
        viewportClassName="v"
        data-testid="viewport"
      >
        short
      </ScrollArea>,
    );

    await waitFor(() => expect(viewport()).toHaveAttribute('tabindex', '-1'));
    expect(viewport()).toHaveAccessibleName('Interviewer changelog');
  });

  it('takes its name once it becomes a tab stop', async () => {
    // The name exists so a REACHABLE stop announces something instead of
    // nothing — the "unlabeled stop after Close" in the report.
    stubOverflow(900, 100);
    render(
      <ScrollArea
        nameWhenScrollableOnly
        aria-label="Edit Field"
        viewportClassName="v"
        data-testid="viewport"
      >
        long
      </ScrollArea>,
    );

    await waitFor(() => expect(viewport()).toHaveAttribute('tabindex', '0'));
    expect(viewport()).toHaveAttribute('aria-label', 'Edit Field');
    expect(viewport()).toHaveAccessibleName('Edit Field');
  });
});

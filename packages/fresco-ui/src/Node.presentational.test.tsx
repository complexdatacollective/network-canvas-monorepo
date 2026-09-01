import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installLabelMetrics,
  uninstallLabelMetrics,
} from './__tests__/labelMetrics';
import Node from './Node';

/** Longer than the smallest rung of the `md` ladder can hold. */
const CLIPPED_LABEL =
  'Alexandria Montgomery-Fitzgerald von Habsburg III of Great Britain and Ireland';

const getPopup = () =>
  document.querySelector('[data-base-ui-portal] [data-open][role="tooltip"]');

const settle = (ms: number) =>
  act(() => new Promise((resolve) => setTimeout(resolve, ms)));

/** Longer than the hold duration, so a hold that was going to fire has. */
const PAST_HOLD = 700;

beforeEach(installLabelMetrics);
afterEach(uninstallLabelMetrics);

describe('a presentational Node', () => {
  it('is not a control', async () => {
    // The rendered root, not `closest(...)` off the label: every layer inside
    // a node is a `<span>` too, so a class-shaped selector would happily
    // return one of them and assert nothing.
    const { container } = render(<Node label="person" presentational />);
    await act(async () => {});

    expect(screen.queryByRole('button')).toBeNull();
    const chip = container.firstElementChild!;
    expect(chip.tagName).toBe('SPAN');
    expect(chip).toHaveTextContent('person');
    expect(chip).not.toHaveAttribute('role');
    expect(chip).not.toHaveAttribute('tabindex');
    expect(chip).not.toHaveAttribute('aria-label');
    expect(chip).not.toHaveAttribute('aria-pressed');
    expect(chip).not.toHaveAttribute('disabled');
  });

  it('can sit inside a control without nesting one', async () => {
    render(
      <button type="button">
        <Node label="person" presentational />
      </button>,
    );
    await act(async () => {});

    const outer = screen.getByRole('button');
    // A control inside a control is invalid HTML and a second, dead target for
    // assistive technology; a <div> inside a <button> is invalid too.
    expect(
      outer.querySelectorAll('button, [role="button"], [tabindex]'),
    ).toHaveLength(0);
    expect(outer.querySelectorAll('div, p, fieldset, ul, ol, li')).toHaveLength(
      0,
    );
    // The label still reads as part of the enclosing control's name.
    expect(outer).toHaveTextContent('person');
  });

  it('takes no tab stop even when its label is clipped', async () => {
    const user = userEvent.setup();
    render(<Node label={CLIPPED_LABEL} presentational />);
    await act(async () => {});

    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it('still reveals a clipped label on press and hold', async () => {
    // Losing the tab stop is the point of `presentational`; losing the only
    // other way to read a clipped name would be a regression.
    const { container } = render(<Node label={CLIPPED_LABEL} presentational />);
    await act(async () => {});

    fireEvent.pointerDown(container.firstElementChild!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    await settle(PAST_HOLD);

    await waitFor(() => expect(getPopup()).toHaveTextContent(CLIPPED_LABEL));
  });

  it('does not activate', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <Node label="person" presentational onClick={onClick} />,
    );
    await act(async () => {});

    fireEvent.click(container.firstElementChild!);

    expect(onClick).not.toHaveBeenCalled();
  });
});

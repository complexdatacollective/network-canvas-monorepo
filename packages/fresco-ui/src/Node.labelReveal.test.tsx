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
const SHORT_LABEL = 'Ash';

const getPopup = () =>
  document.querySelector('[data-base-ui-portal] [data-open][role="tooltip"]');

const node = (name: string) => screen.getByRole('button', { name });

const settle = (ms: number) =>
  act(() => new Promise((resolve) => setTimeout(resolve, ms)));

/** Longer than the hold duration, so a hold that was going to fire has. */
const PAST_HOLD = 700;

const pressAndHold = async (element: HTMLElement) => {
  fireEvent.pointerDown(element, { button: 0, clientX: 0, clientY: 0 });
  await settle(PAST_HOLD);
};

const release = (element: HTMLElement) => {
  fireEvent.pointerUp(window);
  fireEvent.click(element);
};

beforeEach(installLabelMetrics);
afterEach(uninstallLabelMetrics);

describe('Node label reveal', () => {
  it('reveals the full label after a press and hold', async () => {
    const onLabelReveal = vi.fn();
    render(
      <Node
        label={CLIPPED_LABEL}
        onClick={vi.fn()}
        onLabelReveal={onLabelReveal}
      />,
    );

    await pressAndHold(node(CLIPPED_LABEL));

    await waitFor(() => expect(getPopup()).toHaveTextContent(CLIPPED_LABEL));
    expect(onLabelReveal).toHaveBeenCalledOnce();
  });

  it('does not select the node when a hold revealed the label', async () => {
    const onClick = vi.fn();
    render(<Node label={CLIPPED_LABEL} onClick={onClick} />);

    const button = node(CLIPPED_LABEL);
    await pressAndHold(button);
    release(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('leaves an ordinary tap alone', async () => {
    const onClick = vi.fn();
    const onLabelReveal = vi.fn();
    render(
      <Node
        label={CLIPPED_LABEL}
        onClick={onClick}
        onLabelReveal={onLabelReveal}
      />,
    );

    const button = node(CLIPPED_LABEL);
    fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
    release(button);

    expect(onClick).toHaveBeenCalledOnce();
    expect(onLabelReveal).not.toHaveBeenCalled();
    expect(getPopup()).toBeNull();
  });

  it('abandons the reveal once the pointer moves far enough to drag', async () => {
    const onClick = vi.fn();
    render(<Node label={CLIPPED_LABEL} onClick={onClick} />);

    const button = node(CLIPPED_LABEL);
    fireEvent.pointerDown(button, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100 });
    await settle(PAST_HOLD);

    expect(getPopup()).toBeNull();
  });

  it('never reveals a label that already fits', async () => {
    render(<Node label={SHORT_LABEL} onClick={vi.fn()} />);

    await pressAndHold(node(SHORT_LABEL));

    expect(getPopup()).toBeNull();
  });

  it('reveals a clipped label on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    await user.tab();
    expect(node(CLIPPED_LABEL)).toHaveFocus();

    await waitFor(() => expect(getPopup()).toHaveTextContent(CLIPPED_LABEL));
  });

  it('does not reveal an unclipped label on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<Node label={SHORT_LABEL} onClick={vi.fn()} />);

    await user.tab();
    expect(node(SHORT_LABEL)).toHaveFocus();

    await settle(200);
    expect(getPopup()).toBeNull();
  });

  it('is suppressed during a keyboard drag', async () => {
    render(
      <Node label={CLIPPED_LABEL} onClick={vi.fn()} aria-grabbed={true} />,
    );

    await pressAndHold(node(CLIPPED_LABEL));

    expect(getPopup()).toBeNull();
  });

  it('is suppressed by labelRevealDisabled', async () => {
    render(
      <Node label={CLIPPED_LABEL} onClick={vi.fn()} labelRevealDisabled />,
    );

    await pressAndHold(node(CLIPPED_LABEL));

    expect(getPopup()).toBeNull();
  });

  it('keeps the full label as the accessible name and out of the popup', async () => {
    render(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    await pressAndHold(node(CLIPPED_LABEL));
    await waitFor(() => expect(getPopup()).not.toBeNull());

    // The button is still findable by its complete name, and the popup adds
    // nothing to the accessibility tree that would repeat it.
    expect(node(CLIPPED_LABEL)).toBeInTheDocument();
    expect(getPopup()).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the popup transparent to the pointer', async () => {
    render(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    await pressAndHold(node(CLIPPED_LABEL));
    await waitFor(() => expect(getPopup()).not.toBeNull());

    expect(getPopup()!.closest('[data-base-ui-portal] > *')).toHaveClass(
      'pointer-events-none!',
    );
  });

  it('composes with an external pointer-down handler', async () => {
    const externalPointerDown = vi.fn();
    render(
      <Node
        label={CLIPPED_LABEL}
        onClick={vi.fn()}
        onPointerDown={externalPointerDown}
      />,
    );

    await pressAndHold(node(CLIPPED_LABEL));

    expect(externalPointerDown).toHaveBeenCalledOnce();
    await waitFor(() => expect(getPopup()).not.toBeNull());
  });
});

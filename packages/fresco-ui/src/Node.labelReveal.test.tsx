import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
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

/**
 * Fitting is batched into a microtask, so whether a label is clipped is known
 * just after mount — before paint, and long before anyone could press anything.
 */
const renderNode = async (ui: ReactElement) => {
  render(ui);
  await act(async () => {});
};

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

const holdIndicator = (element: HTMLElement) =>
  element.querySelector('[data-node-holding]');

beforeEach(installLabelMetrics);
afterEach(uninstallLabelMetrics);

describe('Node label reveal', () => {
  it('reveals the full label after a press and hold', async () => {
    const onLongPress = vi.fn();
    await renderNode(
      <Node
        label={CLIPPED_LABEL}
        onClick={vi.fn()}
        onLongPress={onLongPress}
      />,
    );

    await pressAndHold(node(CLIPPED_LABEL));

    await waitFor(() => expect(getPopup()).toHaveTextContent(CLIPPED_LABEL));
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it('does not select the node when a hold revealed the label', async () => {
    const onClick = vi.fn();
    await renderNode(<Node label={CLIPPED_LABEL} onClick={onClick} />);

    const button = node(CLIPPED_LABEL);
    await pressAndHold(button);
    release(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('leaves an ordinary tap alone', async () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    await renderNode(
      <Node
        label={CLIPPED_LABEL}
        onClick={onClick}
        onLongPress={onLongPress}
      />,
    );

    const button = node(CLIPPED_LABEL);
    fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
    release(button);

    expect(onClick).toHaveBeenCalledOnce();
    expect(onLongPress).not.toHaveBeenCalled();
    expect(getPopup()).toBeNull();
  });

  it('abandons the reveal once the pointer moves far enough to drag', async () => {
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    const button = node(CLIPPED_LABEL);
    fireEvent.pointerDown(button, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 100 });
    await settle(PAST_HOLD);

    expect(getPopup()).toBeNull();
  });

  it('never reveals a label that already fits', async () => {
    await renderNode(<Node label={SHORT_LABEL} onClick={vi.fn()} />);

    await pressAndHold(node(SHORT_LABEL));

    expect(getPopup()).toBeNull();
  });

  it('reveals a clipped label on keyboard focus', async () => {
    const user = userEvent.setup();
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    await user.tab();
    expect(node(CLIPPED_LABEL)).toHaveFocus();

    await waitFor(() => expect(getPopup()).toHaveTextContent(CLIPPED_LABEL));
  });

  it('does not reveal an unclipped label on keyboard focus', async () => {
    const user = userEvent.setup();
    await renderNode(<Node label={SHORT_LABEL} onClick={vi.fn()} />);

    await user.tab();
    expect(node(SHORT_LABEL)).toHaveFocus();

    await settle(200);
    expect(getPopup()).toBeNull();
  });

  it('is suppressed during a keyboard drag', async () => {
    await renderNode(
      <Node label={CLIPPED_LABEL} onClick={vi.fn()} aria-grabbed={true} />,
    );

    await pressAndHold(node(CLIPPED_LABEL));

    expect(getPopup()).toBeNull();
  });

  it('is suppressed by labelRevealDisabled', async () => {
    await renderNode(
      <Node label={CLIPPED_LABEL} onClick={vi.fn()} labelRevealDisabled />,
    );

    await pressAndHold(node(CLIPPED_LABEL));

    expect(getPopup()).toBeNull();
  });

  it('keeps the full label as the accessible name and out of the popup', async () => {
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    await pressAndHold(node(CLIPPED_LABEL));
    await waitFor(() => expect(getPopup()).not.toBeNull());

    // The button is still findable by its complete name, and the popup adds
    // nothing to the accessibility tree that would repeat it.
    expect(node(CLIPPED_LABEL)).toBeInTheDocument();
    expect(getPopup()).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the popup transparent to the pointer', async () => {
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    await pressAndHold(node(CLIPPED_LABEL));
    await waitFor(() => expect(getPopup()).not.toBeNull());

    expect(getPopup()!.closest('[data-base-ui-portal] > *')).toHaveClass(
      'pointer-events-none!',
    );
  });

  it('shows that a hold is underway before the label arrives', async () => {
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    const button = node(CLIPPED_LABEL);
    fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });

    // Feedback appears partway through the hold, ahead of the label itself.
    await settle(300);
    expect(holdIndicator(button)).toBeInTheDocument();
    expect(getPopup()).toBeNull();

    await settle(PAST_HOLD);
    await waitFor(() => expect(getPopup()).not.toBeNull());
  });

  it('withdraws the hold indicator when the gesture becomes a drag', async () => {
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    const button = node(CLIPPED_LABEL);
    fireEvent.pointerDown(button, { button: 0, clientX: 100, clientY: 100 });
    await settle(300);
    expect(holdIndicator(button)).toBeInTheDocument();

    fireEvent.pointerMove(window, { clientX: 140, clientY: 100 });
    await waitFor(() => expect(holdIndicator(button)).not.toBeInTheDocument());
  });

  it('shows no hold indicator on a node with nothing to reveal', async () => {
    await renderNode(<Node label={SHORT_LABEL} onClick={vi.fn()} />);

    const button = node(SHORT_LABEL);
    fireEvent.pointerDown(button, { button: 0, clientX: 0, clientY: 0 });
    await settle(300);

    expect(holdIndicator(button)).not.toBeInTheDocument();
  });

  it('takes an open label down when a keyboard drag starts', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Node label={CLIPPED_LABEL} onClick={vi.fn()} />,
    );
    await act(async () => {});

    await user.tab();
    await waitFor(() => expect(getPopup()).not.toBeNull());

    // Grabbing for a keyboard drag doesn't move focus, so nothing else would
    // close a popup that focus opened.
    rerender(
      <Node label={CLIPPED_LABEL} onClick={vi.fn()} aria-grabbed={true} />,
    );

    await waitFor(() => expect(getPopup()).toBeNull());
  });

  it('takes an open label down once it no longer needs revealing', async () => {
    const { rerender } = render(
      <Node label={CLIPPED_LABEL} onClick={vi.fn()} />,
    );
    await act(async () => {});

    await pressAndHold(node(CLIPPED_LABEL));
    await waitFor(() => expect(getPopup()).not.toBeNull());

    // Renamed to something that fits: there is nothing left to reveal.
    rerender(<Node label={SHORT_LABEL} onClick={vi.fn()} />);

    await waitFor(() => expect(getPopup()).toBeNull());
  });

  it('withdraws a revealed label once the gesture becomes a drag', async () => {
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    const button = node(CLIPPED_LABEL);
    fireEvent.pointerDown(button, { button: 0, clientX: 100, clientY: 100 });
    await settle(PAST_HOLD);
    await waitFor(() => expect(getPopup()).not.toBeNull());

    // A pointer drag sets no aria-grabbed, so nothing else would take the
    // label down: it would trail the node and outlast the drop.
    fireEvent.pointerMove(window, { clientX: 200, clientY: 100 });

    await waitFor(() => expect(getPopup()).toBeNull());
  });

  it('leaves a revealed label up when the pointer simply lifts', async () => {
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    const button = node(CLIPPED_LABEL);
    await pressAndHold(button);
    await waitFor(() => expect(getPopup()).not.toBeNull());

    // Releasing is not an interruption — the whole point is to read it.
    fireEvent.pointerUp(window);
    await settle(150);

    expect(getPopup()).not.toBeNull();
  });

  it('keeps a revealed label up when a second finger touches the node', async () => {
    await renderNode(<Node label={CLIPPED_LABEL} onClick={vi.fn()} />);

    const button = node(CLIPPED_LABEL);
    fireEvent.pointerDown(button, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
    await settle(PAST_HOLD);
    await waitFor(() => expect(getPopup()).not.toBeNull());

    // The hold still owns the gesture, so this is not a new press — closing
    // here would snatch the label away mid-read.
    fireEvent.pointerDown(button, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 2,
    });
    await settle(150);

    expect(getPopup()).not.toBeNull();
  });

  it('composes with an external pointer-down handler', async () => {
    const externalPointerDown = vi.fn();
    await renderNode(
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

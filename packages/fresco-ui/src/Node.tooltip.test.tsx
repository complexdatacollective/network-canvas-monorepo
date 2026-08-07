import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Node from './Node';

const LONG_LABEL = 'Alexandria Montgomery-Fitzgerald von Habsburg III';

function mockLabelOverflow() {
  Object.defineProperty(HTMLSpanElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 60,
  });
  Object.defineProperty(HTMLSpanElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 40,
  });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLSpanElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLSpanElement.prototype, 'clientHeight');
});

const getPopup = () =>
  document.querySelector('[data-base-ui-portal] [data-open][role="tooltip"]');

describe('Node truncation tooltip', () => {
  it('does not show a tooltip for an untruncated label', async () => {
    const user = userEvent.setup();
    render(<Node label="Ash" onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Ash' });
    await user.tab();
    expect(button).toHaveFocus();

    await act(async () => {});
    expect(button).not.toHaveAttribute('data-popup-open');
    expect(getPopup()).toBeNull();
  });

  it('shows the complete label on keyboard focus when truncated', async () => {
    mockLabelOverflow();
    const user = userEvent.setup();
    render(<Node label={LONG_LABEL} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: LONG_LABEL });
    await user.tab();
    expect(button).toHaveFocus();
    await waitFor(() => expect(button).toHaveAttribute('data-popup-open'));

    const popup = getPopup();
    expect(popup).toHaveAttribute('aria-hidden', 'true');
    expect(popup).toHaveTextContent(LONG_LABEL);
  });

  it('keeps the full label as the accessible name while the tooltip is open', async () => {
    mockLabelOverflow();
    const user = userEvent.setup();
    render(<Node label={LONG_LABEL} onClick={vi.fn()} />);

    await user.tab();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: LONG_LABEL })).toHaveAttribute(
        'data-popup-open',
      ),
    );
  });

  it('never opens from a click alone', async () => {
    mockLabelOverflow();
    render(<Node label={LONG_LABEL} onClick={vi.fn()} />);

    const button = screen.getByRole('button', { name: LONG_LABEL });
    fireEvent.click(button);

    await act(async () => {});
    expect(button).not.toHaveAttribute('data-popup-open');
  });

  it('closes on pointerdown, stays suppressed while held, and recovers after release', async () => {
    mockLabelOverflow();
    const user = userEvent.setup();
    const externalPointerDown = vi.fn((e: React.PointerEvent) =>
      e.stopPropagation(),
    );
    render(
      <>
        <Node
          label={LONG_LABEL}
          onClick={vi.fn()}
          onPointerDown={externalPointerDown}
        />
        <button type="button">other</button>
      </>,
    );

    const button = screen.getByRole('button', { name: LONG_LABEL });
    await user.tab();
    await waitFor(() => expect(button).toHaveAttribute('data-popup-open'));

    fireEvent.pointerDown(button);
    expect(externalPointerDown).toHaveBeenCalledOnce();
    await waitFor(() => expect(button).not.toHaveAttribute('data-popup-open'));

    await act(async () => {});
    expect(button).not.toHaveAttribute('data-popup-open');

    fireEvent.pointerUp(window);
    await user.tab();
    await user.tab({ shift: true });
    await waitFor(() => expect(button).toHaveAttribute('data-popup-open'));
  });

  it('is suppressed during a keyboard drag (aria-grabbed)', async () => {
    mockLabelOverflow();
    const user = userEvent.setup();
    render(<Node label={LONG_LABEL} onClick={vi.fn()} aria-grabbed={true} />);

    const button = screen.getByRole('button', { name: LONG_LABEL });
    await user.tab();
    expect(button).toHaveFocus();

    await act(async () => {});
    expect(button).not.toHaveAttribute('data-popup-open');
  });

  it('is suppressed by the tooltipDisabled escape hatch', async () => {
    mockLabelOverflow();
    const user = userEvent.setup();
    render(<Node label={LONG_LABEL} onClick={vi.fn()} tooltipDisabled />);

    const button = screen.getByRole('button', { name: LONG_LABEL });
    await user.tab();
    expect(button).toHaveFocus();

    await act(async () => {});
    expect(button).not.toHaveAttribute('data-popup-open');
  });

  it('renders the tooltip popup with pointer events disabled', async () => {
    mockLabelOverflow();
    const user = userEvent.setup();
    render(<Node label={LONG_LABEL} onClick={vi.fn()} />);

    await user.tab();
    await waitFor(() => expect(getPopup()).not.toBeNull());

    const positioner = getPopup()!.closest('[data-base-ui-portal] > *');
    expect(positioner).toHaveClass('pointer-events-none!');
  });

  it('wraps labels with no break opportunities inside the popup', async () => {
    mockLabelOverflow();
    const user = userEvent.setup();
    const unbrokenLabel = 'a'.repeat(48);
    render(<Node label={unbrokenLabel} onClick={vi.fn()} />);

    await user.tab();
    await waitFor(() => expect(getPopup()).not.toBeNull());

    expect(getPopup()).toHaveTextContent(unbrokenLabel);
    expect(getPopup()).toHaveClass('wrap-anywhere', 'whitespace-pre-line');
  });
});

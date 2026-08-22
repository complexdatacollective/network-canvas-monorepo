import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SyntheticSection } from '../SyntheticSection';

/**
 * The shared synthetic disclosure. What matters here is the contract every
 * surface leans on: real disclosure semantics (a native button trigger with
 * aria-expanded), collapsed-by-default with the summary always visible, and a
 * reset affordance that exists exactly while the block is authored and never
 * toggles the disclosure as a side effect.
 *
 * There is deliberately NO authored/default badge (spec revision 2, item 3):
 * the row says what a run would do, and the reset affordance is the whole of
 * what remains of "this was authored".
 */

const renderSection = (
  overrides: Partial<Parameters<typeof SyntheticSection>[0]> = {},
) =>
  render(
    <SyntheticSection
      title="Synthetic data"
      summary="count: normal(mean 8, sd 3)"
      authored={false}
      {...overrides}
    >
      <div data-testid="controls">controls</div>
    </SyntheticSection>,
  );

/** The disclosure trigger: the one button that carries aria-expanded. */
const trigger = () => {
  const disclosure = screen
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-expanded'));
  if (disclosure.length !== 1 || disclosure[0] === undefined) {
    throw new Error(
      `expected exactly one disclosure trigger, found ${disclosure.length}`,
    );
  }
  return disclosure[0];
};

describe('disclosure semantics', () => {
  it('renders a native button trigger, collapsed by default, summary visible', () => {
    renderSection();

    const button = trigger();
    // A native button is what makes the row keyboard operable (Enter/Space)
    // without any handler of ours; a div would silently lose that.
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // Visible focus comes from the shared focus-ring utility.
    expect(button.className).toContain('focusable');
    expect(screen.getByText('count: normal(mean 8, sd 3)')).toBeInTheDocument();
    expect(screen.queryByTestId('controls')).not.toBeInTheDocument();
  });

  it('expands and collapses on activation, revealing the controls', () => {
    renderSection();

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('controls')).toBeInTheDocument();

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts expanded when defaultOpen is set', () => {
    renderSection({ defaultOpen: true });

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('controls')).toBeInTheDocument();
  });

  it('reports expansion changes for the option-weights reveal', () => {
    const onOpenChange = vi.fn();
    renderSection({ onOpenChange });

    fireEvent.click(trigger());
    expect(onOpenChange).toHaveBeenCalledWith(true);
    fireEvent.click(trigger());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('supports controlled expansion', () => {
    const { rerender } = render(
      <SyntheticSection
        title="Synthetic data"
        summary="summary"
        authored={false}
        open={false}
      >
        <div data-testid="controls">controls</div>
      </SyntheticSection>,
    );
    expect(screen.queryByTestId('controls')).not.toBeInTheDocument();

    rerender(
      <SyntheticSection
        title="Synthetic data"
        summary="summary"
        authored={false}
        open
      >
        <div data-testid="controls">controls</div>
      </SyntheticSection>,
    );
    expect(screen.getByTestId('controls')).toBeInTheDocument();
  });

  it('keeps collapsed controls mounted when a consumer opts in', () => {
    renderSection({ keepMounted: true });

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    // Present in the DOM (for form registration) while hidden from view and
    // from the accessibility tree.
    expect(screen.getByTestId('controls')).not.toBeVisible();
  });
});

describe('authored state', () => {
  it('offers no reset affordance while unauthored', () => {
    renderSection({ authored: false, onReset: vi.fn() });

    expect(
      screen.queryByRole('button', { name: /Reset to default/i }),
    ).not.toBeInTheDocument();
  });

  it('carries no authored/default indicator in either state', () => {
    // The badge is gone (spec revision 2, item 3). Asserted over the trigger's
    // ACCESSIBLE NAME as well as the text, because the badge lived inside the
    // trigger and so was part of what a screen reader announced — e2e specs
    // matched on it, and a reintroduction would be silent otherwise.
    const { rerender } = renderSection({ authored: false });
    expect(trigger()).not.toHaveAccessibleName(/Authored|Default/);
    expect(screen.queryByText('Default')).not.toBeInTheDocument();

    rerender(
      <SyntheticSection
        title="Synthetic data"
        summary="count: normal(mean 8, sd 3)"
        authored
        onReset={vi.fn()}
      >
        <div data-testid="controls">controls</div>
      </SyntheticSection>,
    );
    expect(trigger()).not.toHaveAccessibleName(/Authored|Default/);
    expect(screen.queryByText('Authored')).not.toBeInTheDocument();
    // Still the summary, which is what the row is for.
    expect(trigger()).toHaveAccessibleName(/normal\(mean 8, sd 3\)/);
  });

  it('shows a reset affordance while authored', () => {
    const onReset = vi.fn();
    renderSection({ authored: true, onReset });

    const reset = screen.getByRole('button', { name: /Reset to default/i });
    // Named by its own label plus the section title, so several sections'
    // reset buttons stay distinguishable to a screen reader.
    expect(reset).toHaveAccessibleName('Reset to default Synthetic data');

    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('resetting does not toggle the disclosure', () => {
    renderSection({ authored: true, onReset: vi.fn() });

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: /Reset to default/i }));
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });
});

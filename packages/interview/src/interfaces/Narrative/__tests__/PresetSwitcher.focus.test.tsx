import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/useStageSelector', () => ({
  useStageSelector: () => ({
    categoricalOptions: undefined,
    groupValues: [],
    edges: [],
    highlightLabels: [],
  }),
}));

import PresetSwitcher from '../PresetSwitcher';

const PRESETS = [
  { label: 'First' },
  { label: 'Second' },
  { label: 'Third' },
] as unknown as React.ComponentProps<typeof PresetSwitcher>['presets'];

function renderSwitcher(activePreset: number) {
  return render(
    <PresetSwitcher
      presets={PRESETS}
      activePreset={activePreset}
      highlightIndex={0}
      showHighlighting={false}
      showEdges={false}
      showHulls={false}
      onChangePreset={vi.fn()}
      onToggleHulls={vi.fn()}
      onToggleEdges={vi.fn()}
      onChangeHighlightIndex={vi.fn()}
      onToggleHighlighting={vi.fn()}
      dragConstraints={{ current: null }}
    />,
  );
}

afterEach(() => {
  cleanup();
});

/**
 * The preset toolbar is a single tab stop, and its previous/next controls
 * disable themselves at the ends of the preset list. A control that leaves the
 * roving focus the moment it becomes unavailable takes keyboard focus with it,
 * dropping the participant at `<body>`; the next Tab then restarts from the top
 * of the document, in the middle of an interview.
 */
describe('PresetSwitcher keeps keyboard focus at the ends of the list', () => {
  it('announces the unavailable control rather than removing it from the page', () => {
    renderSwitcher(0);
    const previous = screen.getByRole('button', { name: 'Previous preset' });

    expect(previous).toHaveAttribute('aria-disabled', 'true');
    // The native attribute is what would eject focus, so its absence is the
    // mechanism this behaviour rests on — not an incidental detail.
    expect(previous).not.toBeDisabled();
  });

  it('lets a disabled preset control take keyboard focus', () => {
    renderSwitcher(PRESETS.length - 1);
    const next = screen.getByRole('button', { name: 'Next preset' });

    expect(next).toHaveAttribute('aria-disabled', 'true');
    next.focus();

    // A natively disabled button refuses focus outright, leaving it on
    // `<body>` — so this assertion fails if the control ever opts back out.
    expect(next).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('holds focus when the focused control runs out of presets', () => {
    const { rerender } = renderSwitcher(PRESETS.length - 2);
    const next = screen.getByRole('button', { name: 'Next preset' });
    next.focus();
    expect(next).toHaveFocus();

    // Advancing to the last preset disables the control the participant is
    // standing on. Focus must stay where it is.
    rerender(
      <PresetSwitcher
        presets={PRESETS}
        activePreset={PRESETS.length - 1}
        highlightIndex={0}
        showHighlighting={false}
        showEdges={false}
        showHulls={false}
        onChangePreset={vi.fn()}
        onToggleHulls={vi.fn()}
        onToggleEdges={vi.fn()}
        onChangeHighlightIndex={vi.fn()}
        onToggleHighlighting={vi.fn()}
        dragConstraints={{ current: null }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Next preset' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Next preset' })).toHaveFocus();
  });
});

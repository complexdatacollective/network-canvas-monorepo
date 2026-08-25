import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConstraintConflict } from '@codaco/protocol-utilities';
import type { SyntheticFeasibility } from '~/hooks/useSyntheticFeasibility';

import { SyntheticFeasibilityAnnouncer } from '../SyntheticFeasibilityAnnouncer';

/**
 * The verdict announcer. Its whole contract is what it does NOT say: nothing
 * for checking/invalid, nothing for a verdict already announced, and never
 * two announcements inside the throttle window — while every real verdict
 * CHANGE does reach the live region.
 *
 * The oracle is the polite live region fresco-ui's announcement hook owns
 * (`role="status"`); its internal auto-clear (1s) is part of the timeline, so
 * assertions land before it or acknowledge it.
 */

const conflictsOf = (count: number): readonly ConstraintConflict[] =>
  Array.from({ length: count }, (_unused, index) => ({
    entity: 'node' as const,
    entityType: 'person',
    variableIds: [`var-${index}`],
    variableNames: [`variable ${index}`],
    rules: ['unique'],
    reason: `reason ${index}`,
  }));

const FEASIBLE: SyntheticFeasibility = { status: 'feasible', conflicts: [] };
const CHECKING: SyntheticFeasibility = { status: 'checking', conflicts: [] };
const INVALID: SyntheticFeasibility = { status: 'invalid', conflicts: [] };
const conflicted = (count: number): SyntheticFeasibility => ({
  status: 'conflicts',
  conflicts: conflictsOf(count),
});

const liveRegion = (): HTMLElement => {
  const region = document.querySelector('[role="status"]');
  if (!(region instanceof HTMLElement)) {
    throw new Error('no polite live region rendered');
  }
  return region;
};

const renderAnnouncer = (feasibility: SyntheticFeasibility) =>
  render(<SyntheticFeasibilityAnnouncer feasibility={feasibility} />);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('what is announced', () => {
  it('announces the first resolved verdict', () => {
    const { rerender } = renderAnnouncer(CHECKING);
    expect(liveRegion().textContent).toBe('');

    rerender(<SyntheticFeasibilityAnnouncer feasibility={conflicted(2)} />);
    expect(liveRegion().textContent).toBe(
      'Synthetic data cannot be generated. 2 conflicts were found.',
    );
  });

  it('uses the singular sentence for one conflict', () => {
    renderAnnouncer(conflicted(1));
    expect(liveRegion().textContent).toBe(
      'Synthetic data cannot be generated. 1 conflict was found.',
    );
  });

  it('announces a verdict change in both directions', () => {
    const { rerender } = renderAnnouncer(conflicted(1));
    expect(liveRegion().textContent).toContain('cannot be generated');

    // Past the throttle so the change speaks immediately.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    rerender(<SyntheticFeasibilityAnnouncer feasibility={FEASIBLE} />);
    expect(liveRegion().textContent).toBe(
      'Synthetic data can be generated for this protocol.',
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    rerender(<SyntheticFeasibilityAnnouncer feasibility={conflicted(3)} />);
    expect(liveRegion().textContent).toBe(
      'Synthetic data cannot be generated. 3 conflicts were found.',
    );
  });

  it('announces a change in conflict count', () => {
    const { rerender } = renderAnnouncer(conflicted(1));
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    rerender(<SyntheticFeasibilityAnnouncer feasibility={conflicted(2)} />);
    expect(liveRegion().textContent).toBe(
      'Synthetic data cannot be generated. 2 conflicts were found.',
    );
  });
});

describe('what stays silent', () => {
  it('says nothing while checking or invalid', () => {
    const { rerender } = renderAnnouncer(CHECKING);
    expect(liveRegion().textContent).toBe('');

    rerender(<SyntheticFeasibilityAnnouncer feasibility={INVALID} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(liveRegion().textContent).toBe('');
  });

  it('does not repeat a verdict that went away and came back unchanged', () => {
    const { rerender } = renderAnnouncer(conflicted(2));
    expect(liveRegion().textContent).toContain('2 conflicts');

    // The region auto-clears after the announcement window; the throttle
    // window also fully elapses. Anything spoken after this point would be a
    // NEW announcement.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(liveRegion().textContent).toBe('');

    // checking (an edit) and back to the same verdict: silence. Asserted
    // BEFORE any timer advance — the region auto-clears itself, so a later
    // read would miss a wrongly repeated announcement.
    rerender(<SyntheticFeasibilityAnnouncer feasibility={CHECKING} />);
    rerender(<SyntheticFeasibilityAnnouncer feasibility={conflicted(2)} />);
    expect(liveRegion().textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(liveRegion().textContent).toBe('');
  });
});

describe('throttle', () => {
  it('holds a rapid follow-up change until the quiet time ends, then speaks the newest', () => {
    const { rerender } = renderAnnouncer(conflicted(1));
    expect(liveRegion().textContent).toContain('1 conflict');

    // Within the throttle window: two more changes arrive. Neither speaks
    // yet; only the newest survives to speak later.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(liveRegion().textContent).toBe(''); // the auto-clear has run
    rerender(<SyntheticFeasibilityAnnouncer feasibility={conflicted(2)} />);
    expect(liveRegion().textContent).toBe('');
    rerender(<SyntheticFeasibilityAnnouncer feasibility={FEASIBLE} />);
    expect(liveRegion().textContent).toBe('');

    // The quiet time ends: exactly one announcement, the newest verdict.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(liveRegion().textContent).toBe(
      'Synthetic data can be generated for this protocol.',
    );
  });
});

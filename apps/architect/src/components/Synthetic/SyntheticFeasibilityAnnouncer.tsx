import { useEffect, useRef } from 'react';

import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import type { SyntheticFeasibility } from '~/hooks/useSyntheticFeasibility';

/**
 * Announces live-feasibility VERDICT CHANGES to screen readers, politely
 * (spec, "Live feasibility"): feasible to conflicts and back, and changes in
 * the conflict count. Nothing else — `checking` and `invalid` are silent
 * (typing must produce no chatter, and parse errors belong to the commit
 * flow), a verdict equal to the last one announced is silent, and successive
 * announcements are throttled so a burst of edits collapses into the final
 * verdict rather than a stream.
 *
 * Renders nothing itself: the polite `role="status"` live region comes from
 * fresco-ui's `useAccessibilityAnnouncements`, the codebase's one live-region
 * implementation.
 */

/**
 * The least quiet time between two announcements. Presentation timing only —
 * long enough that a settle-and-resettle of the debounced analysis reads as
 * one change, short enough that a real verdict is never stale by the time it
 * is spoken.
 */
const FEASIBILITY_ANNOUNCEMENT_THROTTLE_MS = 3000;

const FEASIBLE_MESSAGE = 'Synthetic data can be generated for this protocol.';
const ONE_CONFLICT_MESSAGE =
  'Synthetic data cannot be generated. 1 conflict was found.';
const manyConflictsMessage = (count: number): string =>
  `Synthetic data cannot be generated. ${count} conflicts were found.`;

/** The identity of a verdict; `null` for the states that say nothing. */
const verdictKey = (feasibility: SyntheticFeasibility): string | null => {
  if (feasibility.status === 'feasible') return 'feasible';
  if (feasibility.status === 'conflicts') {
    return `conflicts:${feasibility.conflicts.length}`;
  }
  return null;
};

const verdictMessage = (feasibility: SyntheticFeasibility): string => {
  if (feasibility.status === 'conflicts') {
    return feasibility.conflicts.length === 1
      ? ONE_CONFLICT_MESSAGE
      : manyConflictsMessage(feasibility.conflicts.length);
  }
  return FEASIBLE_MESSAGE;
};

export type SyntheticFeasibilityAnnouncerProps = {
  feasibility: SyntheticFeasibility;
};

export function SyntheticFeasibilityAnnouncer({
  feasibility,
}: SyntheticFeasibilityAnnouncerProps): null {
  const { announce } = useAccessibilityAnnouncements();
  const lastAnnouncedKey = useRef<string | null>(null);
  const lastAnnouncedAt = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    const key = verdictKey(feasibility);
    // Silent states, and verdicts already announced, say nothing — including
    // a verdict that went away and came back unchanged.
    if (key === null || key === lastAnnouncedKey.current) return;

    const message = verdictMessage(feasibility);
    const speak = () => {
      lastAnnouncedKey.current = key;
      lastAnnouncedAt.current = Date.now();
      announce(message);
    };

    const wait =
      lastAnnouncedAt.current +
      FEASIBILITY_ANNOUNCEMENT_THROTTLE_MS -
      Date.now();
    if (wait <= 0) {
      speak();
      return;
    }

    // Trailing announcement: the newest verdict speaks once the quiet time
    // ends. A newer verdict before then replaces it (this cleanup runs), so
    // only the latest is ever spoken.
    const timer = setTimeout(speak, wait);
    return () => clearTimeout(timer);
  }, [feasibility, announce]);

  return null;
}

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { WalkthroughStep } from './parseWalkthrough';
import { subscribeToPage } from './useStepTarget';

const NONE: readonly number[] = [];

/**
 * The steps of `steps` on offer in the editor as it is now, by their place in
 * `steps`. A step about a section is offered only while that section is on
 * the page: some sections appear only with a setting (the built-in wording of
 * a bin that requires every node placed), and a step about one that is absent
 * would point at nothing.
 */
export function useShownSteps(
  steps: readonly WalkthroughStep[] | undefined,
): readonly number[] {
  const getSnapshot = useCallback(() => {
    if (steps === undefined) return '';
    const onPage = new Set<string>();
    for (const element of document.querySelectorAll('[data-section-key]')) {
      const key = element.getAttribute('data-section-key');
      if (key !== null) onPage.add(key);
    }
    return steps
      .flatMap((step, index) =>
        step.section === undefined || onPage.has(step.section) ? [index] : [],
      )
      .join(',');
  }, [steps]);

  const shown = useSyncExternalStore(subscribeToPage, getSnapshot, () => '');
  return useMemo(
    () => (shown === '' ? NONE : shown.split(',').map(Number)),
    [shown],
  );
}

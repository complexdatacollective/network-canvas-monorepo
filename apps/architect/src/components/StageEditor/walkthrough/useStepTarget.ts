import { useCallback, useSyncExternalStore } from 'react';

/**
 * Calls back whenever elements are added to or removed from the page, which
 * is all that can make a step's target appear or go.
 */
export function subscribeToPage(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * The element a step points at: the section whose `data-section-key` is
 * `section`, a field inside it, or a control outside the sections (such as
 * the toolbar's Preview button) by its `data-walkthrough-control`.
 */
export function useStepTarget(
  section: string | undefined,
  field: string | undefined,
  control: string | undefined,
): HTMLElement | null {
  const getSnapshot = useCallback(() => {
    if (control !== undefined) {
      return document.querySelector<HTMLElement>(
        `[data-walkthrough-control="${CSS.escape(control)}"]`,
      );
    }
    if (section === undefined) return null;
    const box = document.querySelector<HTMLElement>(
      `[data-section-key="${CSS.escape(section)}"]`,
    );
    if (box === null || field === undefined) return box;
    return (
      box.querySelector<HTMLElement>(
        `[data-field-name="${CSS.escape(field)}"]`,
      ) ?? box
    );
  }, [control, field, section]);

  return useSyncExternalStore(subscribeToPage, getSnapshot, () => null);
}

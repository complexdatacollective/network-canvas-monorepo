import { useCallback, useEffect, useRef, type RefObject } from 'react';

import {
  resolveFieldContainer,
  resolveFieldErrorTarget,
} from '@codaco/fresco-ui/form/utils/focusFirstError';

/** How long to wait for a screen's form to appear before giving up on it. */
const FIELD_WAIT_MS = 3000;

/**
 * Moves focus to a field of the stage form on screen, waiting for it.
 *
 * Opening a screen is not instant: the form is drawn once the screen has been
 * read, and its fields stay disabled until the editing lock has been granted.
 * Asked for a field before then, this watches `root` and focuses the field
 * the moment it can take focus, rather than landing on its disabled shell or
 * on nothing.
 *
 * `fieldNames` are the names to try, most specific first, resolved by the same
 * rule a failed save uses (`resolveFieldErrorTarget`), so a problem listed
 * here and a field refused on save agree about which control owns the error.
 * When the field never becomes usable (a screen another researcher is
 * editing keeps every field disabled), the field's own element takes focus
 * instead, and failing that `fallback` runs: focus must end up somewhere that
 * names the problem, never on the page body.
 */
export function useFieldFocus(root: RefObject<HTMLElement | null>) {
  const cancelPending = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => cancelPending.current?.(), []);

  return useCallback(
    (fieldNames: readonly string[], fallback: () => void) => {
      cancelPending.current?.();
      // A problem about the screen as a whole names no field to wait for.
      if (fieldNames.length === 0) {
        fallback();
        return;
      }

      const find = (acceptContainer: boolean): HTMLElement | undefined => {
        for (const name of fieldNames) {
          const control = resolveFieldErrorTarget(name, root.current);
          if (control === undefined) continue;
          if (
            acceptContainer ||
            control !== resolveFieldContainer(name, root.current)
          ) {
            return control;
          }
        }
        return undefined;
      };
      const land = (control: HTMLElement) => {
        control.focus({ preventScroll: true });
        control.scrollIntoView({ block: 'center' });
      };

      const operable = find(false);
      if (operable !== undefined) {
        land(operable);
        return;
      }

      const watcher = new MutationObserver(() => {
        const control = find(false);
        if (control === undefined) return;
        stop();
        land(control);
      });
      const timer = setTimeout(() => {
        stop();
        const control = find(true);
        if (control === undefined) fallback();
        else land(control);
      }, FIELD_WAIT_MS);
      function stop() {
        watcher.disconnect();
        clearTimeout(timer);
        cancelPending.current = undefined;
      }
      if (root.current !== null) {
        watcher.observe(root.current, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['disabled', 'aria-hidden', 'inert'],
        });
      }
      cancelPending.current = stop;
    },
    [root],
  );
}

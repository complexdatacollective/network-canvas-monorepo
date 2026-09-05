import { isEqual } from 'es-toolkit/compat';
import { useCallback, useRef, type RefObject } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { stripManagedProperties } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

type ConfirmOptions = Parameters<ReturnType<typeof useDialog>['confirm']>[0];

/**
 * Everything a caller says about its own confirm. The action is ours, and so
 * is where focus goes: a row that named its own would be a row that could
 * forget to, which is the whole failure this hook exists to make unsayable.
 */
type RowRemovalConfirm = Omit<ConfirmOptions, 'onConfirm' | 'finalFocus'>;

/**
 * Put on the control that opens a row's removal confirm — and on no other
 * control.
 *
 * It is how the confirm finds the row that takes this one's place once this
 * one is gone. Not an `aria-label` match: a row's Remove control is named for
 * the researcher, and those names differ from list to list and even from row
 * to row (`Remove option 3`), so a search by name either finds nothing or
 * finds one row.
 */
export const rowRemovalControlProps = Object.freeze({
  'data-array-row-remove': '',
});

const REMOVE_CONTROL = '[data-array-row-remove]';

/**
 * Where focus goes when the confirm closes.
 *
 * Cancel leaves the row where it was, so this answers with that row's own
 * Remove control — the element focus came from. Confirm destroys it along with
 * the row, so it answers with whichever row has taken this one's place, and
 * with the list's add button when the row removed was the last one, that being
 * the only control an emptied list still has.
 *
 * What it must never answer is `null`, which leaves focus on `<body>`; Base UI
 * resolves that to the first tabbable element in the document, sending the
 * researcher back to the page header from the middle of a form.
 */
const resolveRemovalFocus = (
  list: Element | null,
  index: number,
  getAddTrigger: () => HTMLElement | null,
): HTMLElement | null => {
  if (list?.isConnected) {
    // Scoped to THIS list: a row can hold a list of its own, and its rows'
    // Remove controls are inside this one's subtree.
    const remaining = [
      ...list.querySelectorAll<HTMLElement>(REMOVE_CONTROL),
    ].filter((control) => control.closest('[role="list"]') === list);
    const neighbour = remaining[Math.min(index, remaining.length - 1)];
    if (neighbour) return neighbour;
  }
  return getAddTrigger();
};

/**
 * Said when the row a confirm was opened on is no longer the row that control
 * names. It stays in the dialog the researcher is looking at, which is still
 * open, so the next click is theirs to make against the list as it now stands.
 */
const rowReplacedMessage = (itemLabel: string) =>
  `This ${itemLabel} was replaced while you were confirming, so nothing was removed. Check the list and remove it again if you still want to.`;

export type RowRemoval = Readonly<{
  /** The row being removed, as the list is rendering it right now. */
  item: Record<string, unknown>;
  /** Noun for the row, used in what the confirm says when it refuses. */
  itemLabel: string;
  /** The row's position, for naming the row that takes its place. */
  index: number;
  onDelete: (() => void) | undefined;
  /** From `ArrayFieldItemProps`; the one control an emptied list keeps. */
  getAddTrigger: () => HTMLElement | null;
}>;

/**
 * A row's own destructive confirm, bound to the row it was opened on and to
 * where focus goes once that row is gone.
 *
 * A confirm is a WINDOW: the researcher reads it, and the list carries on
 * moving behind it — a collaborator's insertion, an undo, a rollback after a
 * lost lease. `ArrayField` identifies a row by an internal id, and for rows
 * that carry no id of their own (an option, a sort rule) it reuses those ids
 * BY POSITION whenever the value is replaced, so an insertion above hands this
 * control's id to the row that has taken this one's place. The delete handler
 * this component was rendered with then names that row instead, and confirming
 * removes an option the researcher never looked at.
 *
 * So the confirm is answered against the row it was actually about. Its
 * content is the only identity such a row has, and content is enough here:
 * two rows the researcher cannot tell apart are two rows this dialog described
 * identically. When the row has moved on, nothing is removed and the dialog
 * says so rather than closing over a deletion that landed somewhere else —
 * `confirm` renders a throw from `onConfirm` as the dialog's own error and
 * leaves it open.
 *
 * Attach the returned `rowRef` to the row's own element and spread
 * {@link rowRemovalControlProps} onto the control that calls `confirmRemoval`;
 * between them they are how focus finds its way back into the list.
 */
export function useConfirmRowRemoval<E extends HTMLElement = HTMLDivElement>(
  removal: RowRemoval,
): Readonly<{
  rowRef: RefObject<E | null>;
  confirmRemoval: (confirmOptions: RowRemovalConfirm) => void;
}> {
  const { confirm } = useDialog();
  const { itemLabel } = removal;
  const rowRef = useRef<E | null>(null);

  // Read when the researcher answers, not when the row was drawn: the whole
  // point is that the two are different moments.
  const removalRef = useRef(removal);
  removalRef.current = removal;

  const confirmRemoval = useCallback(
    (confirmOptions: RowRemovalConfirm) => {
      // Managed properties are exactly what cannot be trusted here: the
      // internal id is the thing being reused, so it is identical either way.
      const confirmedRow = stripManagedProperties(removalRef.current.item);
      // Resolved now, while the row is still in the document: after the
      // confirm the row is gone, and `closest()` from a detached node walks a
      // detached tree. The list element itself survives.
      const list = rowRef.current?.closest('[role="list"]') ?? null;

      void confirm({
        ...confirmOptions,
        finalFocus: () =>
          resolveRemovalFocus(
            list,
            removalRef.current.index,
            removalRef.current.getAddTrigger,
          ),
        onConfirm: () => {
          if (
            !isEqual(
              stripManagedProperties(removalRef.current.item),
              confirmedRow,
            )
          ) {
            throw new Error(rowReplacedMessage(itemLabel));
          }
          removalRef.current.onDelete?.();
        },
      });
    },
    [confirm, itemLabel],
  );

  return { rowRef, confirmRemoval };
}

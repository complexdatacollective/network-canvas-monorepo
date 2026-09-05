import { isEqual } from 'es-toolkit/compat';
import { useCallback, useRef } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { stripManagedProperties } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

type ConfirmOptions = Parameters<ReturnType<typeof useDialog>['confirm']>[0];

/** Everything a caller says about its own confirm; the action is ours. */
type RowRemovalConfirm = Omit<ConfirmOptions, 'onConfirm'>;

/**
 * Said when the row a confirm was opened on is no longer the row that control
 * names. It stays in the dialog the researcher is looking at, which is still
 * open, so the next click is theirs to make against the list as it now stands.
 */
const rowReplacedMessage = (itemLabel: string) =>
  `This ${itemLabel} was replaced while you were confirming, so nothing was removed. Check the list and remove it again if you still want to.`;

/**
 * A row's own destructive confirm, bound to the row it was opened on.
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
 */
export function useConfirmRowRemoval(
  item: Record<string, unknown>,
  itemLabel: string,
  onDelete: (() => void) | undefined,
): (confirmOptions: RowRemovalConfirm) => void {
  const { confirm } = useDialog();

  // Read when the researcher answers, not when the row was drawn: the whole
  // point is that the two are different moments.
  const rowRef = useRef(item);
  rowRef.current = item;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  return useCallback(
    (confirmOptions: RowRemovalConfirm) => {
      // Managed properties are exactly what cannot be trusted here: the
      // internal id is the thing being reused, so it is identical either way.
      const confirmedRow = stripManagedProperties(rowRef.current);

      void confirm({
        ...confirmOptions,
        onConfirm: () => {
          if (!isEqual(stripManagedProperties(rowRef.current), confirmedRow)) {
            throw new Error(rowReplacedMessage(itemLabel));
          }
          onDeleteRef.current?.();
        },
      });
    },
    [confirm, itemLabel],
  );
}

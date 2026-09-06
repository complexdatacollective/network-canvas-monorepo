import { isEqual } from 'es-toolkit/compat';
import { useCallback, useRef, type RefObject } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
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
 * What a refused removal is called.
 *
 * Both cross a string-only contract: they are thrown out of `onConfirm`, which
 * `confirm` renders as the dialog's own error through `AppErrorMessage` — so
 * they are encoded here and decoded there, and the row noun travels with them
 * as a nested reference rather than as a word already resolved to whichever
 * language was current when the confirm was opened.
 */
const refusalMessages = defineMessages({
  rowReplaced: {
    id: 'protocolBuilder.arrayField.rowReplacedRefusal',
    defaultMessage:
      'This {itemLabel} was replaced while you were confirming, so nothing was removed. Check the list and remove it again if you still want to.',
    description:
      'Shown inside a removal confirmation when the row it was opened on has been replaced by a different one while the researcher was reading it, so nothing was deleted. itemLabel is the list’s own noun for one of its rows — "prompt", "option", "item" — already in the reader’s language.',
  },
  removalUnavailable: {
    id: 'protocolBuilder.arrayField.removalUnavailableRefusal',
    defaultMessage:
      'This list stopped accepting changes while you were confirming, so this {itemLabel} was not removed. Remove it again once the list can be edited.',
    description:
      'Shown inside a removal confirmation when the list stopped accepting changes while the researcher was reading it, so nothing was deleted. itemLabel is the list’s own noun for one of its rows, already in the reader’s language.',
  },
});

const refusal = (message: MessageDescriptor, itemLabel: MessageDescriptor) =>
  createMessageError(message, {
    itemLabel: { messageError: createMessageError(itemLabel) },
  });

export type RowRemoval = Readonly<{
  /** The row being removed, as the list is rendering it right now. */
  item: Record<string, unknown>;
  /**
   * Noun for the row, used in what the confirm says when it refuses. A
   * descriptor rather than a word: the refusals it goes into are read
   * somewhere else, and a caller that resolved it first would put its own
   * language's noun into the reader's sentence.
   */
  itemLabel: MessageDescriptor;
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
 * that carry no id of their own (an option, a sort rule) that id is inferred
 * from the row's content when the value is replaced, so a row the researcher
 * can still recognise keeps its own delete handler however the list moves
 * around it. What content cannot answer for is a row whose content has itself
 * changed — an edit arriving on this row — or two rows nothing can tell apart:
 * there the handler this component was rendered with names a row the dialog
 * never described, and confirming removes an option the researcher never
 * looked at.
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
          const { item, onDelete } = removalRef.current;
          // The list can stop accepting changes inside the same window the row
          // can be replaced in, and `ArrayField` says so by taking the delete
          // handler away rather than by anything this row can see. Asked
          // FIRST: a list that will not accept the removal is what determines
          // what the researcher can do next, whichever row is now here.
          if (onDelete === undefined) {
            throw new Error(
              refusal(refusalMessages.removalUnavailable, itemLabel),
            );
          }
          if (!isEqual(stripManagedProperties(item), confirmedRow)) {
            throw new Error(refusal(refusalMessages.rowReplaced, itemLabel));
          }
          onDelete();
        },
      });
    },
    [confirm, itemLabel],
  );

  return { rowRef, confirmRemoval };
}

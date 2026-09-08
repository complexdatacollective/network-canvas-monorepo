import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';

/**
 * Why a list write did not reach the document, and what each reason is called
 * on screen.
 *
 * The reasons and their wording live together because the pairing is the whole
 * guarantee: a write path that can answer "no" without saying why is a write
 * path whose silence reads as a save, and a reason nobody has authored words
 * for reaches the researcher as exactly that silence. Both halves are used by
 * every consumer of the write path — the row dialog, which shows the reason
 * above the draft it is keeping open, and the inline lists, which have no
 * dialog and report through the stage form's own error region.
 */

/**
 * Why a list write did not reach the document.
 *
 * The three are separate because they ask the researcher for different things:
 * a lease is taken back, a removed row is gone for good, and a row that cannot
 * be told from its neighbours is still there to be edited once the list is
 * looked at again.
 */
export type ArrayWriteRefusal =
  /** The session declined the commands — a read-only stage, a lost lease. */
  | 'session-refused'
  /** The row this write was addressed at is not in the array any more. */
  | 'row-removed'
  /**
   * The row could not be told apart from the array as it now stands. Rows
   * without ids of their own are matched by content, and a match that is
   * ambiguous — or a list numbered differently from the document behind it —
   * resolves to no row rather than to a guess. See `resolveRowIndex`.
   */
  | 'row-unresolved';

/**
 * The three refusals, keyed by the reason they answer.
 *
 * `itemLabel` is the list's own noun for its rows, which arrives as a
 * descriptor of its own and is resolved by whoever reads the sentence — see
 * `arrayMessages`. Each is a WHOLE sentence with the noun in it rather than a
 * stem the noun is glued onto, so a translator can put it where their language
 * wants it.
 */
const refusalMessages = defineMessages({
  rowRemoved: {
    id: 'protocolBuilder.arrayField.rowRemovedRefusal',
    defaultMessage:
      'This {itemLabel} was removed while your changes were being saved, so there is nothing left to save them to. Copy anything you want to keep, then cancel and add a new {itemLabel}.',
    description:
      'Shown to a researcher whose edit to one row of a list was saved after that row had already been deleted. itemLabel is the list’s own noun for one of its rows — "prompt", "option", "item" — already in the reader’s language.',
  },
  readOnly: {
    id: 'protocolBuilder.arrayField.readOnlyRefusal',
    defaultMessage:
      'This stage is read-only, so this {itemLabel} was not saved. Take over editing and try again.',
    description:
      'Shown to a researcher whose edit to one row of a list was refused because they no longer hold the right to edit the stage (one step of an interview). itemLabel is the list’s own noun for one of its rows, already in the reader’s language. Taking over editing is an action offered elsewhere in the host application.',
  },
  rowUnresolved: {
    id: 'protocolBuilder.arrayField.rowUnresolvedRefusal',
    defaultMessage:
      'This list changed while you were editing, so this {itemLabel} could not be matched to a row in it and nothing was saved. Copy anything you want to keep, then check the list and make the change again.',
    description:
      'Shown to a researcher whose edit could not be matched to any one row of the list, because the list moved while they were editing. itemLabel is the list’s own noun for one of its rows, already in the reader’s language.',
  },
});

/**
 * The noun this sentence is about, as a value the sentence can carry across a
 * string-only contract: a nested reference resolved in the reader's language
 * at the moment the sentence is rendered, rather than a word resolved here in
 * whatever language happened to be current when the write was refused.
 */
const itemLabelValue = (itemLabel: MessageDescriptor) => ({
  itemLabel: { messageError: createMessageError(itemLabel) },
});

/**
 * The researcher-facing account of a save that landed after its row was gone.
 * This is an authoring tool, so it says what happened and what to do next
 * rather than reporting a failure.
 */
export const rowRemovedMessage = (itemLabel: MessageDescriptor) =>
  createMessageError(refusalMessages.rowRemoved, itemLabelValue(itemLabel));

/**
 * Said when the stage stopped accepting writes while the edit was being made.
 * It echoes the stage form's own read-only wording, because it is the same
 * lease that has gone: the researcher's next move is to take editing back, and
 * anything still on screen stays there meanwhile.
 */
export const readOnlyMessage = (itemLabel: MessageDescriptor) =>
  createMessageError(refusalMessages.readOnly, itemLabelValue(itemLabel));

/**
 * Said when the commit resolved to no row at all.
 *
 * The row has not necessarily gone: a row carrying no id of its own is found
 * by its content, and only while exactly one row matches — two rows the
 * researcher cannot tell apart are two rows this save describes identically,
 * and writing to either would be a guess that lands the edit on a row they
 * never opened. So the list is what has to be looked at, not the row.
 */
const rowUnresolvedMessage = (itemLabel: MessageDescriptor) =>
  createMessageError(refusalMessages.rowUnresolved, itemLabelValue(itemLabel));

/**
 * What a refused list write is called on screen.
 *
 * Exhaustive over the reasons the write path can give, in one place, so a
 * reason added there has to be answered here rather than reaching the
 * researcher as silence — or as the wrong thing to do about it.
 */
const WRITE_REFUSAL_MESSAGES: Readonly<
  Record<ArrayWriteRefusal, (itemLabel: MessageDescriptor) => string>
> = Object.freeze({
  'session-refused': readOnlyMessage,
  'row-removed': rowRemovedMessage,
  'row-unresolved': rowUnresolvedMessage,
});

export const writeRefusalMessage = (
  reason: ArrayWriteRefusal,
  itemLabel: MessageDescriptor,
) => WRITE_REFUSAL_MESSAGES[reason](itemLabel);

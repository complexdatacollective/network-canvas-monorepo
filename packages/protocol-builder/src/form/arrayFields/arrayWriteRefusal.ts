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
 * The researcher-facing account of a save that landed after its row was gone.
 * This is an authoring tool, so it says what happened and what to do next
 * rather than reporting a failure.
 */
export const rowRemovedMessage = (itemLabel: string) =>
  `This ${itemLabel} was removed while your changes were being saved, so there is nothing left to save them to. Copy anything you want to keep, then cancel and add a new ${itemLabel}.`;

/**
 * Said when the stage stopped accepting writes while the edit was being made.
 * It echoes the stage form's own read-only wording, because it is the same
 * lease that has gone: the researcher's next move is to take editing back, and
 * anything still on screen stays there meanwhile.
 */
export const readOnlyMessage = (itemLabel: string) =>
  `This stage is read-only, so this ${itemLabel} was not saved. Take over editing and try again.`;

/**
 * Said when the commit resolved to no row at all.
 *
 * The row has not necessarily gone: a row carrying no id of its own is found
 * by its content, and only while exactly one row matches — two rows the
 * researcher cannot tell apart are two rows this save describes identically,
 * and writing to either would be a guess that lands the edit on a row they
 * never opened. So the list is what has to be looked at, not the row.
 */
const rowUnresolvedMessage = (itemLabel: string) =>
  `This list changed while you were editing, so this ${itemLabel} could not be matched to a row in it and nothing was saved. Copy anything you want to keep, then check the list and make the change again.`;

/**
 * What a refused list write is called on screen.
 *
 * Exhaustive over the reasons the write path can give, in one place, so a
 * reason added there has to be answered here rather than reaching the
 * researcher as silence — or as the wrong thing to do about it.
 */
const WRITE_REFUSAL_MESSAGES: Readonly<
  Record<ArrayWriteRefusal, (itemLabel: string) => string>
> = Object.freeze({
  'session-refused': readOnlyMessage,
  'row-removed': rowRemovedMessage,
  'row-unresolved': rowUnresolvedMessage,
});

export const writeRefusalMessage = (
  reason: ArrayWriteRefusal,
  itemLabel: string,
) => WRITE_REFUSAL_MESSAGES[reason](itemLabel);

/**
 * What a list calls its rows when its caller has not said. Every list that
 * edits rows one dialog at a time names them (`prompt`, `option`), and the
 * always-editing inline lists are the ones that do not: they are generic by
 * construction — the same `MultiSelect` is a sort rule here and a display
 * property there — so the noun is generic too rather than guessed at.
 */
export const DEFAULT_ITEM_LABEL = 'item';

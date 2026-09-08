import { defineMessage } from '@codaco/app-i18n/messages';

/**
 * The array-field copy that more than one module renders.
 *
 * A message id may be declared in exactly one file — `extractMessages` throws
 * on a second declaration — so a message several of these modules say lives
 * here rather than in whichever of them happened to need it first.
 *
 * Only the generic row noun qualifies today. It is the word three separate
 * sentences are built around — a refused write (`arrayWriteRefusal`), a
 * refused removal (`useConfirmRowRemoval`) and a row's own affordances
 * (`DialogArrayField`) — and it reaches all three the same way: as the
 * descriptor a list hands over for its rows, never as a translated word a
 * caller has already resolved.
 */

/**
 * What a list calls its rows when its caller has not said. Every list that
 * edits rows one dialog at a time names them (`prompt`, `option`), and the
 * always-editing inline lists are the ones that do not: they are generic by
 * construction — the same `MultiSelect` is a sort rule here and a display
 * property there — so the noun is generic too rather than guessed at.
 *
 * A DESCRIPTOR rather than a word, because every sentence it goes into is
 * either formatted where it is read or encoded for a reader further on. A
 * caller that resolved it to English first would put an English noun in a
 * Spanish sentence.
 */
export const DEFAULT_ITEM_LABEL = defineMessage({
  id: 'protocolBuilder.arrayField.itemNoun',
  defaultMessage: 'item',
  description:
    'Generic noun for one row of an editable list in a stage editor, used where the list has no more specific word for its rows. Interpolated mid-sentence into things said ABOUT a row ("Remove this item?", "This item was not saved."), so it is lower case and singular.',
});

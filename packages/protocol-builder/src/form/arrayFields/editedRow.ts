import { createContext } from 'react';

/**
 * The row a dialog has open, and where it will be written.
 *
 * A row editor's controls belong to the DIALOG's form store, not the stage's:
 * the row reaches the stage only when the dialog saves. Anything that has to
 * reason about the stage as the next save would leave it — "is anything else
 * using this resource?" is the one that matters — therefore cannot read the
 * stage form alone, because the row on screen is not in it yet.
 *
 * Provided by `DialogArrayField`'s editor, which is the only thing that knows
 * both halves: `listPath` comes from the list's own document binding, and
 * `read` is the same merge the save commits, so the two cannot answer
 * differently about the same draft.
 *
 * Absent outside a row dialog, and for a list that has no place in the stage
 * document of its own — a list nested inside another row, whose rows reach the
 * stage through the dialog around IT.
 */
export type EditedRowScope = Readonly<{
  /** Where the list holding this row lives in the stage document. */
  listPath: readonly string[];
  /** The row's place in that list, or `undefined` while it is a new row. */
  index: number | undefined;
  /**
   * The row as a save would commit it, read at the moment it is asked rather
   * than closed over: the dialog stays open for as long as the researcher
   * takes, and its store is live behind whatever asks.
   */
  read: () => Record<string, unknown>;
}>;

export const EditedRowContext = createContext<EditedRowScope | null>(null);

import { isEqual } from 'es-toolkit/compat';
import { useCallback, useState } from 'react';

const NO_CELLS: ReadonlySet<string> = new Set();

/**
 * Which cells of one row the researcher has actually changed.
 *
 * A row of an inline list is not made of registered fields — the whole list is
 * one field value — so no cell has the form's own "don't complain about a
 * control nobody has touched" behaviour. This is that behaviour, held for the
 * row rather than for the cell, because a cell that held its own would have to
 * be a component, and a package component standing where a `<Field>` goes is
 * the wrapper the rework removed.
 *
 * Per CELL and not per row: a researcher filling in an option's label has not
 * yet said anything about its value, and telling them the value is missing
 * while they are still typing the label is an error about a box they have not
 * reached.
 */
export function useEditedCells(): Readonly<{
  hasEdited: (cell: string) => boolean;
  /**
   * Record an edit unless the value is unchanged. Some controls (the rich-text
   * editor an option label is typed into) emit a change as they mount, and
   * counting that as an edit shows "Required" on a row nobody has touched.
   */
  markEdited: (cell: string, next: unknown, current: unknown) => void;
}> {
  const [edited, setEdited] = useState(NO_CELLS);

  const markEdited = useCallback(
    (cell: string, next: unknown, current: unknown) => {
      if (isEqual(next, current)) return;
      setEdited((cells) =>
        cells.has(cell) ? cells : new Set(cells).add(cell),
      );
    },
    [],
  );

  const hasEdited = useCallback((cell: string) => edited.has(cell), [edited]);

  return { hasEdited, markEdited };
}

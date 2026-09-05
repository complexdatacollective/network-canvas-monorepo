import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

import type { ArrayFieldOperation } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import type { Command } from '@codaco/studio-sync/apply';

import { useStageEditorForm } from '../stageEditorContext.ts';
import {
  type ArrayRow,
  type ArrayRowIdentity,
  commandsForDetachedRow,
  commandsForOperation,
  readRows,
  reseatEditedRow,
} from './arrayFieldCommands.ts';

/**
 * Which key of the stage document a list editor is bound to, or `undefined`
 * when it is not bound to one at all.
 *
 * A list nested inside a row — `additionalAttributes` on a prompt — has no key
 * of its own: the command vocabulary addresses a top-level document key, and
 * the row it lives in is edited as a whole by the dialog around it. Such a
 * list stays an ordinary form value and commits with its dialog, which is why
 * this is an option rather than a requirement.
 */
export type ArrayFieldBinding = Readonly<{ documentKey: string | undefined }>;

export const ArrayFieldBindingContext = createContext<ArrayFieldBinding | null>(
  null,
);

/**
 * The array a list editor resolves its operations against, and the write that
 * has to go in front of them for the document to actually hold it.
 */
type BoundArray = Readonly<{
  current: unknown[];
  /** Empty unless the key holds something that is not a list. */
  repair: readonly Command[];
}>;

/**
 * What a bound list finds at its key, and the rule for a value that is not a
 * list.
 *
 * A list editor is a field component like any other: it renders whatever the
 * stage document holds at its key, and an import, a migration or a legacy
 * protocol can leave that as an object, a string, anything. Every reader in
 * this package answers that with the empty list (`readRows` here,
 * `AssignAttributes`' own `rows`, `ArrayField`'s render tolerance), because
 * refusing it would throw out of a render and the corrective effect a render
 * that never commits would have run never runs — fresco-ui's render-tolerance
 * contract, #1433.
 *
 * So the researcher is shown an empty list WITH a working Add button, and the
 * rule for the write behind that button follows from it:
 *
 *   an array field that finds a non-array value REPLACES it — a `set` of the
 *   array the operation was resolved against, as the form's own write and in
 *   the same batch as the operation — so that the item command applies to the
 *   list the researcher was looking at.
 *
 * Without the replacement the command is addressed at the foreign value and
 * `apply`'s `asList` throws `ApplyError("Field … is not a list")` out of a
 * click handler, where nothing catches it: the shell re-throws everything that
 * is not a `SessionReadOnlyError`, so an Add takes the editor down instead of
 * adding a row.
 *
 * Two things the rule deliberately does NOT do:
 *
 * - salvage rows out of the foreign value. The replacement is the empty list
 *   the editor rendered and nothing else; a row recovered from a shape no
 *   reader could render is a row the researcher never saw and did not ask to
 *   keep, and it would also move the indices the operation was resolved
 *   against.
 * - repair on its own. It rides with an operation, so a list that is only
 *   LOOKED at is never rewritten, and a refused operation (see
 *   `resolveRowIndex` — a remove or a move naming a row the value has not got
 *   issues no command) discards nothing. In the same batch it is also one
 *   history entry, so undoing the add puts the value back as it was.
 *
 * Nullish is not foreign: an absent key is the empty list to `asList` exactly
 * as it is to every reader here, so it needs no repair.
 */
const readArray = (key: string, value: unknown): BoundArray => {
  if (Array.isArray(value)) return { current: [...value], repair: [] };
  if (value === undefined || value === null) return { current: [], repair: [] };
  return { current: [], repair: [{ op: 'set', key, value: [] }] };
};

/**
 * Whether a command needs the field to already hold a list. A whole-key `set`
 * replaces the foreign value itself, and a repair in front of one would make
 * two history entries out of a single edit.
 */
const addressesAList = (command: Command) =>
  command.op === 'insertItem' ||
  command.op === 'removeItem' ||
  command.op === 'moveItem';

export type ArrayFieldCommands<T extends ArrayRow> = Readonly<{
  /**
   * Hand to fresco-ui's `ArrayField`. `undefined` for an unbound list, which
   * then commits through the plain value-level `onChange` instead.
   */
  onOperation: ((operation: ArrayFieldOperation<T>) => void) | undefined;
  /**
   * Commits a row addressed by its own id — the save that outlived the editing
   * session it was made in. `false` when that row has left the list.
   *
   * `base` is the row the edit was computed from, so what the edit decided can
   * be told apart from what it merely carried over and re-seated on the row as
   * it stands now.
   */
  commitDetachedRow: (
    row: T,
    id: string | undefined,
    isNewRow: boolean,
    base?: ArrayRow,
  ) => boolean;
  /**
   * Whether the session REFUSED this list's last write, read once and
   * forgotten.
   *
   * For the one caller that cannot see the answer any other way: a row dialog
   * commits through `ArrayField`'s own save handler, which returns nothing, so
   * by the time control comes back the only record of the refusal is here. It
   * is read-and-clear because it describes one write, and a refusal left
   * standing would be spent on some later save that was never refused.
   */
  takeWriteRefusal: () => boolean;
}>;

/**
 * Turns a list editor's committed operations into stage-document commands.
 *
 * Every mutation is resolved against the array the SESSION holds at the moment
 * it is committed, keyed by each row's own identity — never by replaying the
 * index the editor rendered with. That index is a revision behind as soon as
 * anything else touches the list, and replaying it is exactly what silently
 * edits, deletes or reorders the wrong row.
 *
 * The list's form value is then brought level with what the session ended up
 * holding, so a row that arrived from elsewhere appears in the control rather
 * than being written back out of existence by the next save.
 */
export function useArrayFieldCommands<T extends ArrayRow>(
  rendered: readonly T[],
  onChange?: (next: T[]) => void,
  getId?: ArrayRowIdentity<T>,
): ArrayFieldCommands<T> {
  const { applyOwnCommands } = useStageEditorForm();
  const documentKey = useContext(ArrayFieldBindingContext)?.documentKey;

  // Read at commit time rather than closed over. A dialog's save can land
  // after the list has moved on, and the values it should be judged against
  // are the ones in force then.
  const renderedRef = useRef(rendered);
  renderedRef.current = rendered;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const getIdRef = useRef(getId);
  getIdRef.current = getId;

  const readCurrent = useCallback(
    (key: string) => readArray(key, applyOwnCommands([]).draft[key]),
    [applyOwnCommands],
  );

  /** Whether the session refused the write this list made most recently. */
  const refusedRef = useRef(false);

  const commit = useCallback(
    (key: string, bound: BoundArray, commands: readonly Command[]) => {
      // Written for every attempt, so that a refusal cannot outlive the write
      // it describes and be read as the verdict on a later one.
      refusedRef.current = false;
      if (commands.length === 0) return false;
      const { draft, refused } = applyOwnCommands(
        bound.repair.length > 0 && commands.some(addressesAList)
          ? [...bound.repair, ...commands]
          : commands,
      );
      if (refused) {
        refusedRef.current = true;
        return false;
      }
      onChangeRef.current?.(readRows(draft[key]) as T[]);
      return true;
    },
    [applyOwnCommands],
  );

  const takeWriteRefusal = useCallback(() => {
    const refused = refusedRef.current;
    refusedRef.current = false;
    return refused;
  }, []);

  const handleOperation = useCallback(
    (operation: ArrayFieldOperation<T>) => {
      if (documentKey === undefined) return;
      const bound = readCurrent(documentKey);
      commit(
        documentKey,
        bound,
        commandsForOperation(
          documentKey,
          bound.current,
          renderedRef.current,
          operation,
          getIdRef.current,
        ),
      );
    },
    [commit, documentKey, readCurrent],
  );

  const commitDetachedRow = useCallback(
    (
      row: T,
      id: string | undefined,
      isNewRow: boolean,
      base?: ArrayRow,
    ): boolean => {
      if (documentKey === undefined) {
        const committed = renderedRef.current;
        const index =
          id === undefined
            ? -1
            : committed.findIndex(
                (candidate) => getIdRef.current?.(candidate) === id,
              );
        if (index !== -1) {
          const next = [...committed];
          next[index] = reseatEditedRow(base, row, committed[index]) as T;
          onChangeRef.current?.(next);
          return true;
        }
        if (!isNewRow) return false;
        onChangeRef.current?.([...committed, row]);
        return true;
      }

      const bound = readCurrent(documentKey);
      return commit(
        documentKey,
        bound,
        commandsForDetachedRow(
          documentKey,
          bound.current,
          row,
          id,
          isNewRow,
          getIdRef.current,
          base,
        ),
      );
    },
    [commit, documentKey, readCurrent],
  );

  return useMemo(
    () => ({
      onOperation: documentKey === undefined ? undefined : handleOperation,
      commitDetachedRow,
      takeWriteRefusal,
    }),
    [commitDetachedRow, documentKey, handleOperation, takeWriteRefusal],
  );
}

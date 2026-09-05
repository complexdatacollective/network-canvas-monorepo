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

const readArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? [...value] : [];

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
    (key: string) => readArray(applyOwnCommands([]).draft[key]),
    [applyOwnCommands],
  );

  /** Whether the session refused the write this list made most recently. */
  const refusedRef = useRef(false);

  const commit = useCallback(
    (key: string, commands: readonly Command[]) => {
      // Written for every attempt, so that a refusal cannot outlive the write
      // it describes and be read as the verdict on a later one.
      refusedRef.current = false;
      if (commands.length === 0) return false;
      const { draft, refused } = applyOwnCommands(commands);
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
      commit(
        documentKey,
        commandsForOperation(
          documentKey,
          readCurrent(documentKey),
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

      return commit(
        documentKey,
        commandsForDetachedRow(
          documentKey,
          readCurrent(documentKey),
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

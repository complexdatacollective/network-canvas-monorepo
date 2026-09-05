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
 *
 * Neither is a LIST WITH A HOLE IN IT — `[null, { … }]`, an entry an import or
 * a migration left as something that is not a row. `asList` takes it, so no
 * command addressed at it can throw, and the entries beside the hole are real
 * rows the researcher authored. Replacing it would delete those for an edit
 * that only asked to add one, and would move the indices the operation was
 * resolved against — both of them the very things the rule above refuses to
 * do. A hole is a document row the editor does not render, and it is answered
 * where that matters, at the index resolver: see `renderedRows` in
 * `arrayFieldCommands`.
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
 * What became of a list write.
 *
 * Deliberately not a boolean, and deliberately not a boolean beside a separate
 * "was it refused" flag. The caller that matters is a row dialog, which closes
 * itself over the researcher's draft on any save it believes succeeded, and
 * `ArrayField`'s own save handler answers nothing — so a write path that can
 * answer "no" without saying why is a write path whose silence reads as a
 * save. Every route out of this hook that writes nothing has to name a reason,
 * and the type is what makes forgetting one impossible rather than a comment
 * asking the next fix to remember.
 */
export type ArrayWriteOutcome =
  | Readonly<{ kind: 'written' }>
  | Readonly<{ kind: 'refused'; reason: ArrayWriteRefusal }>;

const WRITTEN: ArrayWriteOutcome = Object.freeze({ kind: 'written' });

const refused = (reason: ArrayWriteRefusal): ArrayWriteOutcome =>
  Object.freeze({ kind: 'refused', reason });

export type ArrayFieldCommands<T extends ArrayRow> = Readonly<{
  /**
   * Hand to fresco-ui's `ArrayField`. `undefined` for an unbound list, which
   * then commits through the plain value-level `onChange` instead.
   */
  onOperation: ((operation: ArrayFieldOperation<T>) => void) | undefined;
  /**
   * Commits a row addressed by its own id — the save that outlived the editing
   * session it was made in.
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
  ) => ArrayWriteOutcome;
  /**
   * Runs a dispatch that commits through fresco-ui's `ArrayField` — its own
   * save handler — and answers what this list wrote while it ran.
   *
   * For the one caller that cannot see the answer any other way: `ArrayField`'s
   * save handler returns nothing, so by the time control comes back the write
   * it caused is the only record of what happened. Scoped to the dispatch
   * rather than read afterwards, so an outcome belonging to some earlier write
   * can never be spent here as the verdict on this one.
   */
  writeThrough: (dispatch: () => void) => ArrayWriteOutcome;
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

  /**
   * What this list's most recent write did, or `undefined` when it has made
   * none since anybody last asked.
   *
   * Only `writeThrough` reads it, and only across a dispatch it scopes itself,
   * so the two states it can be in are "this dispatch wrote" and "this dispatch
   * did not". Nothing here is a flag a caller has to remember to consult.
   */
  const lastWriteRef = useRef<ArrayWriteOutcome | undefined>(undefined);

  /**
   * The write itself. Every route out of it names an outcome, which is what
   * `commit` below then records — one recording site, so no branch added later
   * can leave the list silent about what it did.
   *
   * `nothingToWrite` is what an empty command list MEANS to the caller that
   * built it: `commandsForDetachedRow` issues none for a row that has left the
   * array, `commandsForOperation` for one it could not resolve at all. Both are
   * writes that reached nothing; they are not the same thing to tell the
   * researcher.
   */
  const applyCommit = useCallback(
    (
      key: string,
      bound: BoundArray,
      commands: readonly Command[],
      nothingToWrite: ArrayWriteRefusal,
    ): ArrayWriteOutcome => {
      if (commands.length === 0) return refused(nothingToWrite);
      const { draft, refused: sessionRefused } = applyOwnCommands(
        bound.repair.length > 0 && commands.some(addressesAList)
          ? [...bound.repair, ...commands]
          : commands,
      );
      if (sessionRefused) return refused('session-refused');
      // The rows the researcher can SEE, which is the forgiving read: a hole
      // the document keeps is dropped from the form value, so the list comes
      // back on screen instead of the whole thing staying blank because of one
      // entry nobody can edit. The document and the control are then numbered
      // differently, which is exactly why nothing downstream replays a
      // position — see `renderedRows` in `arrayFieldCommands`.
      onChangeRef.current?.(readRows(draft[key]) as T[]);
      return WRITTEN;
    },
    [applyOwnCommands],
  );

  const commit = useCallback(
    (
      key: string,
      bound: BoundArray,
      commands: readonly Command[],
      nothingToWrite: ArrayWriteRefusal,
    ): ArrayWriteOutcome => {
      const outcome = applyCommit(key, bound, commands, nothingToWrite);
      // Written for every attempt, so that an outcome cannot outlive the write
      // it describes and be read as the verdict on a later one.
      lastWriteRef.current = outcome;
      return outcome;
    },
    [applyCommit],
  );

  const writeThrough = useCallback(
    (dispatch: () => void): ArrayWriteOutcome => {
      lastWriteRef.current = undefined;
      dispatch();
      const outcome = lastWriteRef.current;
      lastWriteRef.current = undefined;
      if (outcome !== undefined) return outcome;

      // The handler ran and this list wrote nothing at all.
      //
      // For an UNBOUND list that is the ordinary case, and not a refusal: it
      // has no document key to address, so its rows commit through the form
      // value the handler was handed and the dispatch itself IS the write.
      //
      // For a bound list it is a refusal. Every route through the handler ends
      // in a command, so one that issued none is one that is no longer editing
      // the row — `ArrayField` drops its editing state the moment the row
      // leaves the value it renders, and its handler is silent about that.
      return documentKey === undefined ? WRITTEN : refused('row-removed');
    },
    [documentKey],
  );

  const handleOperation = useCallback(
    (key: string, operation: ArrayFieldOperation<T>) => {
      const bound = readCurrent(key);
      commit(
        key,
        bound,
        commandsForOperation(
          key,
          bound.current,
          renderedRef.current,
          operation,
          getIdRef.current,
        ),
        'row-unresolved',
      );
    },
    [commit, readCurrent],
  );

  // Built here rather than guarded inside the handler, so that "this list has
  // no key to address" is a route that does not exist instead of a branch that
  // has to remember to say something.
  const onOperation = useMemo(
    () =>
      documentKey === undefined
        ? undefined
        : (operation: ArrayFieldOperation<T>) => {
            handleOperation(documentKey, operation);
          },
    [documentKey, handleOperation],
  );

  const commitDetachedRow = useCallback(
    (
      row: T,
      id: string | undefined,
      isNewRow: boolean,
      base?: ArrayRow,
    ): ArrayWriteOutcome => {
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
          return WRITTEN;
        }
        // There is nothing left to commit the edit to, and appending it would
        // add back a row the researcher deleted. A row being ADDED is the
        // exception: it was never in the list to begin with.
        if (!isNewRow) return refused('row-removed');
        onChangeRef.current?.([...committed, row]);
        return WRITTEN;
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
        'row-removed',
      );
    },
    [commit, documentKey, readCurrent],
  );

  return useMemo(
    () => ({ onOperation, commitDetachedRow, writeThrough }),
    [commitDetachedRow, onOperation, writeThrough],
  );
}

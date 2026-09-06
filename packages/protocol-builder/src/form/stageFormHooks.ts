import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import {
  type FieldNameMode,
  resolveFieldPath,
  useFieldNamespacePath,
} from '@codaco/fresco-ui/form/FieldNamespace';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import {
  formatObjectPath,
  getValue,
  type ObjectPath,
  omitValue,
} from '@codaco/fresco-ui/form/utils/objectPath';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import {
  canonicalize,
  type Command,
  commandTarget,
} from '@codaco/studio-sync/apply';

import { commandsFromDraftChange, type StageFormDraft } from '../session.ts';
import { withoutValueAt } from './absentValues.ts';
import {
  type StageFormStoreApi,
  useStageEditorForm,
} from './stageEditorContext.ts';

/** fresco-ui does not publish its store type, so it is recovered from the api. */
type FormStoreState = ReturnType<StageFormStoreApi['getState']>;

/**
 * Where a field actually lives, and what the committed draft holds there.
 *
 * A field's name is not always its path: an enclosing `FieldNamespace`
 * prefixes it, and `nameMode="opaque"` makes a name containing dots a single
 * segment rather than a route through the document. Both are resolved here
 * exactly as Fresco's `Field` resolves them, so the name the outline asks the
 * store about and the path the committed value is read from are the ones the
 * field is really registered under.
 *
 * The committed draft is the only account of what a path holds, and it is
 * enough because everything that throws a value away tells the SESSION. A
 * capability the researcher switches off is unset there before the form is
 * emptied (`useDiscardStageValues`), so a control arriving under that path
 * afterwards — a list behind a collapsed group, say — reads the same absence
 * every other reader does, without a second record of the decision to consult.
 *
 * The value is memoised because `initialValue` is a dependency of the effect
 * that registers a field: an unstable one re-registers it on every render.
 */
export function useResolvedFieldIdentity(
  name: string,
  nameMode: FieldNameMode = 'legacy',
): Readonly<{ registeredName: string; committedValue: unknown }> {
  const { committedFields } = useStageEditorForm();
  const namespace = useFieldNamespacePath();

  return useMemo(() => {
    const path = resolveFieldPath(namespace, name, nameMode);
    return {
      registeredName: formatObjectPath(path),
      committedValue: getValue(committedFields, path),
    };
  }, [committedFields, name, nameMode, namespace]);
}

/**
 * The value that caused a discard, and where it lives in the stage draft.
 *
 * A capability is sometimes emptied by a change somewhere ELSE — a roster's
 * card details name columns of a data file, so choosing a different file makes
 * every one of them a reference to something that may not be there. That
 * change is the discard's cause, and it has to be in the same batch as the
 * discard itself; see {@link useDiscardStageValues}.
 *
 * The value is what the FORM holds at `path` now, not a decision this caller
 * is making: the researcher already chose it, and the batch is where it stops
 * being form-local.
 */
export type DiscardCause = Readonly<{ path: string; value: unknown }>;

/**
 * Throws everything at these paths away, for good — with, when something else
 * caused it, the change that did.
 *
 * What switching a capability off means, and the one place that decides it.
 * The session is told first, in ONE batch, and the form is emptied afterwards
 * so the controls on screen do not wait for a re-seed that is never coming —
 * the session write is the form's own, so nothing is written back over the
 * researcher.
 *
 * **A discard travels with its cause.** An ordinary field waits for the submit
 * that flushes it, so a discard caused by one — a roster's card details
 * emptied because the data file changed — would otherwise reach the session,
 * and a live-applying host, entirely alone: the host would hold a stage
 * describing the OLD file with the details of it gone, which is a stage nobody
 * authored. Carrying the cause in the same batch is what stops that, and it is
 * the rule `useResetStageOnSubjectChange` already follows for the same reason
 * (its batch writes the new subject beside the values it resets, so an undo
 * cannot restore a configuration without the type it describes).
 *
 * The session decides what a live-applying host may be given, and it decides
 * from the draft — so the cause has to be IN the draft, in the batch being
 * judged. A cause naming a resource this session has staged makes that whole
 * batch unsendable (`withholdsFromHost`), and the session's hold is a suffix:
 * every later edit made against the staged file waits with it, reaches the
 * host in the finish apply that promotes the file, and is dropped by a cancel.
 * Without the cause the clears travel and the file does not.
 *
 * Nothing is written for a cause the draft already holds, so the second and
 * third sections resetting on the same file add no command of their own.
 *
 * The session rather than the form alone, because the form is not where the
 * stage lives. A bound list resolves every insertion, removal and reorder
 * against the draft the session holds right now, `useResolvedFieldIdentity`
 * seeds every field that mounts from it, and validation judges it — so a
 * decision recorded only in the form is a decision three of its readers never
 * hear, and the next row a researcher adds to a cleared list is resolved
 * against the rows the switch-off was supposed to have thrown away. Teaching
 * each of them to read the form's records instead cannot close that: a record
 * only exists where a field once was, and a capability's controls need not
 * have been on screen at all. One notion of what a path holds, and it is the
 * session's.
 *
 * So a switched-off capability is an edit like any other: it travels with the
 * batches, it is undone by the session's own undo — which brings the values
 * back, and with them the switch — and `rebaseCommand` keeps its `unset` as it
 * stands wherever it lands, because the researcher has decided. A collaborator
 * writing under the path AFTER that decision reaches the protocol is
 * authoritative and shows up as any other arrival does; one whose write is
 * still being reconciled against a clear the host has not applied yet loses it
 * to the clear, exactly as any other pending local edit would win over it.
 *
 * The container the removal empties goes too — `withoutValueAt`'s rule — so
 * the paths this unsets are the paths the save would have had to unset anyway.
 *
 * **A discard that finds nothing to discard is not a discard.** The draft held
 * nothing at any of these paths, so there is no clear to strand and therefore
 * no reason for the cause to travel early: it goes on waiting for the submit
 * that flushes it, like the ordinary field it is. Without this the reset a
 * researcher makes on an empty capability writes its cause alone — a batch
 * spending a step of the session's history on a change nothing was thrown away
 * for. What is "nothing" is the draft's own answer and no second notion of it:
 * whatever `withoutValueAt` would remove. A capability holding an empty list is
 * holding something, and its removal is the edit the save would have made
 * anyway.
 *
 * The FORM is emptied either way. A value typed into a capability and not yet
 * flushed is on screen and in no draft, so a reset that left it there would
 * write it back on the next save under a cause it no longer describes.
 */
export function useDiscardStageValues(): (
  paths: readonly string[],
  cause?: DiscardCause,
) => void {
  const { applyOwnCommands } = useStageEditorForm();
  const clearStageValue = useClearStageValue();

  return useCallback(
    (paths: readonly string[], cause?: DiscardCause) => {
      // `applyOwnCommands([])` is how anything here reads the draft the session
      // holds NOW, rather than the snapshot this callback was built against.
      // An empty batch writes nothing, so it can never be refused.
      const { draft: current } = applyOwnCommands([]);
      let next = current;
      for (const path of paths) {
        const target = safePath(path);
        if (target === null || target.length === 0) continue;
        next = withoutValueAt(next, target);
      }
      const discards = commandsFromDraftChange(current, next);
      // The cause first, so the batch reads as what happened: this changed, and
      // therefore these were thrown away. No discards, no batch at all — see
      // above.
      if (discards.length > 0) {
        applyOwnCommands([...causeCommands(current, cause), ...discards]);
      }

      // The FORM only, and only the discarded paths: the cause is already on
      // screen — the researcher chose it — and it is the draft that was behind.
      for (const path of paths) clearStageValue(path);
    },
    [applyOwnCommands, clearStageValue],
  );
}

/**
 * The command that puts a discard's cause into the draft, or nothing at all.
 *
 * Nothing when the draft already agrees, which is the ordinary case for every
 * section after the first: they all read the same file, and the first one to
 * reset writes it. Nothing either for a path a command cannot address — a
 * command's segments are keys rather than indices — because a capability
 * resetting on a row of a list is a section describing itself wrongly, and
 * writing at the wrong address would be worse than not writing.
 */
function causeCommands(
  current: StageFormDraft,
  cause: DiscardCause | undefined,
): readonly Command[] {
  if (cause === undefined) return [];
  const target = safePath(cause.path);
  if (target === null || target.length === 0) return [];
  if (target.some((segment) => typeof segment !== 'string')) return [];
  const key = commandTarget(target.map(String));
  const held = getValue(current, target);
  if (canonicalize(held) === canonicalize(cause.value)) return [];
  return cause.value === undefined
    ? [{ op: 'unset', key }]
    : [{ op: 'set', key, value: cause.value }];
}

/**
 * Empties a path in the stage form, and everything that reaches it.
 *
 * The FORM only. Its caller has already told the session what it decided —
 * `useDiscardStageValues` with an unset, `useResetStageOnSubjectChange` with a
 * batch that also carries the template defaults it is resetting to — and this
 * brings the controls on screen level with that, immediately, rather than
 * leaving them showing values the draft no longer has.
 *
 * Confirming a deletion has to leave nothing holding the value anywhere, or
 * some later reader finds it again and the deletion undoes itself. Three
 * places can hold it, so all three are cleared:
 *
 * - the path itself and everything beneath it, which is what Fresco's
 *   structural `clearValue` does;
 * - the registered fields ABOVE it, which `clearValue` drops the sub-path out
 *   of for the reason its own comment gives — a container still holding a
 *   sub-path shows nothing while the inner fields are mounted, and surfaces it
 *   again once they are not;
 * - the DORMANT fields above it, which `clearValue` does not reach. Exactly
 *   the same staleness, one map over: a compound control hidden behind
 *   progressive disclosure keeps its whole object, and replays the cleared
 *   value back into the stage on save.
 *
 * Addressed structurally throughout. A capability may own a path whose name is
 * opaque — a protocol-authored variable id containing a dot, or a key with a
 * space — and the string API would read that as a route rather than a name.
 */
export function useClearStageValue(): (path: string) => void {
  const { storeApi } = useStageEditorForm();
  return useCallback(
    (path: string) => {
      const state = storeApi.getState();
      const target = safePath(path);
      const pathOperations = state.pathOperations;
      if (target === null || pathOperations === undefined) {
        state.clearValue(path);
        return;
      }

      pathOperations.clearValue(target);

      // Both maps: `clearValue` rewrites a REGISTERED ancestor to `{}` and
      // leaves it there, and never reaches a dormant one at all. Either way an
      // ancestor the clear emptied has to go, or the tombstone beneath it
      // removes nothing and the empty container reaches the saved stage.
      for (const [name, field] of [...state.fields, ...state.dormantValues]) {
        const ancestor = field.path ?? safePath(name);
        if (
          ancestor === null ||
          ancestor.length >= target.length ||
          !ancestor.every((segment, index) => target[index] === segment)
        ) {
          continue;
        }
        const relative = target.slice(ancestor.length);
        const cleared = withoutValueAt(field.value, relative);
        // Identity is `omitValue` reporting that it held nothing there.
        if (cleared === field.value) continue;
        // An ancestor the clear emptied goes too, rather than being parked as
        // `{}`. An empty object is not "no capability" to the protocol schema,
        // and parking one would also stop the tombstone beneath it from
        // removing anything — leaving the empty container in the saved stage.
        //
        // Unless it is a ROW. Removing an array index leaves a hole rather
        // than closing the gap, so an emptied row stays an empty row; taking
        // one out is a deliberate array operation.
        const emptied =
          isEmptyDictionary(cleared) && typeof ancestor.at(-1) !== 'number';
        pathOperations.setFieldValue(
          ancestor,
          emptied ? undefined : (cleared as FieldValue),
        );
      }
    },
    [storeApi],
  );
}

/**
 * What the stage draft currently holds at one path.
 *
 * The one way anything in this package reads a draft value it does not own a
 * field for: a filter checking the prompts it might contradict, a proposed
 * name reading the stage's subject. Sections address values by path and
 * nothing else — no stage path handed down from a host, no selector, no store
 * of the host's own.
 *
 * Resolution is the form store's own, through `hasValue`/`getValue`: a field
 * registered AT the path, the values assembled from fields registered above or
 * below it, then a field parked at it by progressive disclosure. Only when the
 * form holds none of those does the committed draft answer — before a
 * section's fields have registered, the draft is the only place the value is,
 * and a section that has not been opened yet would otherwise read every value
 * inside it as empty.
 *
 * Deliberately not built on `useStageHasAnyValue`'s machinery, which answers a
 * different question: whether a path holds an ANSWER, where an empty string,
 * an empty list and a container of blanks are all "nothing". That distinction
 * decides whether a capability is switched on. This one reports the value as
 * it is.
 *
 * Addressed structurally, so a protocol-authored key containing a dot or a
 * space is read as one name rather than as a route through the document. Reads
 * the stage form specifically, so it keeps working inside a dialog that has
 * mounted a form store of its own.
 *
 * No path is an answer in its own right — `undefined`, "there is no such
 * value" — so a caller whose path is itself optional can still ask
 * unconditionally, which a hook has to be able to do.
 */
export function useStageValue(path: string | undefined): unknown {
  const { storeApi, committedFields } = useStageEditorForm();

  const subscribe = useCallback(
    (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
    [storeApi],
  );

  const getSnapshot = useCallback((): unknown => {
    if (path === undefined) return undefined;
    const target = safePath(path);
    if (target === null) return undefined;

    const state = storeApi.getState();
    const pathOperations = state.pathOperations;
    if (pathOperations === undefined) {
      return state.hasValue(path)
        ? state.getValue(path)
        : getValue(committedFields, target);
    }
    return pathOperations.hasValue(target)
      ? pathOperations.getValue(target)
      : getValue(committedFields, target);
  }, [committedFields, path, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * How many times the stage form has been written to from an authoritative
 * draft.
 *
 * The form-owned record of `reseedStageForm` having run — a count Fresco's own
 * `Section` already watches to reapply `defaultOpen`. Anything in the editor
 * holding state OF ITS OWN about the draft has the same problem the panel does
 * (it was decided from a draft that has since been replaced beneath it) and so
 * needs the same signal, or the two disagree about the same capability.
 *
 * Deliberately not the session's own generation: what matters is not that the
 * draft moved but that the CONTROLS were rewritten from it, and only the form
 * knows when that happened.
 */
export function useFormRestoreVersion(): number {
  const { storeApi } = useStageEditorForm();

  const subscribe = useCallback(
    (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
    [storeApi],
  );
  const getSnapshot = useCallback(
    () => storeApi.getState().formRestoreVersion,
    [storeApi],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Whether any of these paths currently holds a value.
 *
 * How an optional capability decides whether it is already switched on. It
 * takes the whole set at once because the paths a capability owns are read
 * together — skip logic is present if any of its three parts is — and because
 * a section cannot call a hook once per path in a list it computes.
 *
 * Each path is resolved in three steps, and each earns its place:
 *
 * 1. the field's own state — registered, or dormant because its section is
 *    collapsed. This is what lets a switched-off capability come back when
 *    undo restores the value it owned.
 * 2. the assembled form values, by path — for a container such as `skipLogic`
 *    whose parts register as `skipLogic.action` and friends.
 * 3. the committed draft, by path — the field has never registered at all.
 *    Without this a capability could never open on entry: its fields cannot
 *    register while it is closed, so nothing would put the committed value
 *    within reach.
 *
 * Reads the stage form specifically, so it keeps working inside a dialog that
 * has mounted a form store of its own.
 */
export function useStageHasAnyValue(paths: readonly string[]): boolean {
  const { storeApi, committedFields } = useStageEditorForm();
  // The paths themselves are the dependency, not the array carrying them: a
  // section that spells its list inline hands over a new array every render.
  // Serialised as JSON rather than joined, because a path may legally contain
  // whatever separator a join would pick — `["prompt text"]` contains a space.
  const key = JSON.stringify(paths);
  const latestPaths = useRef(paths);
  latestPaths.current = paths;

  const subscribe = useCallback(
    (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
    [storeApi],
  );

  const getSnapshot = useCallback(() => {
    const state = storeApi.getState();
    return latestPaths.current.some((path) =>
      pathHasAnswer(state, committedFields, path),
    );
  }, [committedFields, key, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Whether anything has actually been entered at this value.
 *
 * A capability may own a CONTAINER path while its controls register the leaves
 * inside it, and merely mounting those controls assembles an object —
 * `{ action: undefined, destination: undefined }` — which is not an answer to
 * anything. Asking the question of the leaves instead is what stops an
 * untouched capability from reporting itself as configured, and then offering
 * to delete content nobody entered.
 */
function hasAnswer(value: unknown): boolean {
  if (isUnanswered(value)) return false;
  if (Array.isArray(value)) return value.some(hasAnswer);
  // `isUnanswered` already ruled out null, so anything left of object type is
  // a real container.
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasAnswer);
  }
  return true;
}

/**
 * Whether anything has been entered at this path.
 *
 * The form's knowledge outranks the draft it was opened from, path by path,
 * because the form is where the researcher has been working:
 *
 * 1. Anything the form holds AT, BENEATH, or — through a compound control
 *    registered above it — ABOVE this path counts as an answer. All three are
 *    asked before any of them can veto, because clearing a capability parks a
 *    tombstone at its own path, and content entered afterwards reaches this
 *    path from the other two directions, where that tombstone has no standing
 *    to speak for it.
 * 2. A record at the path holding nothing, with nothing beneath it, means
 *    empty and stops there. A field the researcher emptied by hand holds `''`,
 *    which is not an answer, while the draft it was opened with still holds
 *    the sentence they deleted — and falling through would report the
 *    capability configured from a value nothing on screen has any more.
 * 3. Whatever the committed draft holds, minus every sub-path the form has
 *    since emptied. Without this a capability could never open on entry, and
 *    one whose controls all sit behind a collapsed group would read as empty
 *    while the stage was configured — so switching it off would skip the
 *    confirmation and leave the capability quietly active in the saved stage.
 */
function pathHasAnswer(
  state: FormStoreState,
  committedFields: StageFormDraft,
  path: string,
): boolean {
  const target = safePath(path);
  if (target === null) return false;

  const records = formRecords(state);
  const exact = records.find((record) => samePath(record.path, target));
  if (exact && hasAnswer(exact.value)) return true;

  const below = records.filter((record) => isBelow(record.path, target));
  if (below.some((record) => hasAnswer(record.value))) return true;

  // A compound control registered ABOVE this path carries what sits at it —
  // one field owning `settings` answers for `settings.enabled`. The assembled
  // values cover the mounted ones; the records cover the parked ones.
  if (hasAnswer(getValue(state.getFormValues(), target))) return true;
  if (
    records.some(
      (record) =>
        isAbove(record.path, target) &&
        hasAnswer(readInside(record.value, target.slice(record.path.length))),
    )
  ) {
    return true;
  }

  // A record at exactly this path holding nothing, with nothing above or below
  // it holding anything either. That is the form saying the path is empty, and
  // it outranks whatever the draft was opened with — otherwise a field the
  // researcher emptied by hand would be answered from the sentence they
  // deleted, which the draft still remembers until the next save.
  if (exact) return false;

  // Every remaining known path is one the form knows is empty, so the draft's
  // memory of it is out of date.
  let committed = getValue(committedFields, target);
  for (const record of below) {
    committed = omitValue(committed, record.path.slice(target.length));
  }
  return hasAnswer(committed);
}

function readInside(value: unknown, relative: ObjectPath): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  // Every node reachable inside a container field's value is itself a value.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return getValue(value as Record<string, unknown>, relative);
}

function isEmptyDictionary(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

/**
 * A capability's path, read as a path.
 *
 * Canonical parsing rather than legacy, so a name is not mistaken for a route
 * through the document: `["prompt text"]` is one protocol-authored key
 * containing a space, and `skipLogic.action` is two segments. Both are what
 * `formatObjectPath` produces, which is how every other path here is spelled.
 */
function safePath(
  name: string,
  mode: FieldNameMode = 'path',
): ObjectPath | null {
  try {
    return resolveFieldPath([], name, mode);
  } catch {
    return null;
  }
}

/** Every field the form holds, mounted or parked, addressed structurally. */
function formRecords(
  state: FormStoreState,
): { path: ObjectPath; value: unknown }[] {
  const records: { path: ObjectPath; value: unknown }[] = [];
  for (const source of [state.fields, state.dormantValues]) {
    for (const [name, field] of source) {
      // A stored path is authoritative; a name without one is a plain field
      // whose own name is its path.
      const path = field.path ?? safePath(name, 'legacy');
      if (path !== null) records.push({ path, value: field.value });
    }
  }
  return records;
}

const samePath = (a: ObjectPath, b: ObjectPath) =>
  a.length === b.length && a.every((segment, index) => b[index] === segment);

const isBelow = (candidate: ObjectPath, path: ObjectPath) =>
  candidate.length > path.length &&
  path.every((segment, index) => candidate[index] === segment);

const isAbove = (candidate: ObjectPath, path: ObjectPath) =>
  candidate.length < path.length &&
  candidate.every((segment, index) => path[index] === segment);

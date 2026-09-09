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
  applyCommands,
  canonicalize,
  type Command,
  commandTarget,
  targetPath,
} from '@codaco/studio-sync/apply';

import {
  commandsFromDraftChange,
  type StageFormDraft,
} from '../stageDocument.ts';
import { withoutValueAt } from './absentValues.ts';
import { mountedPathsOf } from './stageDraftFromSubmission.ts';
import {
  type StageFormStoreApi,
  useStageEditorForm,
} from './stageEditorContext.ts';

/** fresco-ui does not publish its store type, so it is recovered from the api. */
type FormStoreState = ReturnType<StageFormStoreApi['getState']>;

/**
 * Where a field actually lives, and what it should start out holding.
 *
 * A field's name is not always its path: an enclosing `FieldNamespace`
 * prefixes it, and `nameMode="opaque"` makes a name containing dots a single
 * segment rather than a route through the document. Both are resolved here
 * exactly as Fresco's `Field` resolves them, so the name the outline asks the
 * store about and the path the value is read from are the ones the field is
 * really registered under.
 *
 * **The document the editor opened on is the account of what a path holds once
 * saved.** That is enough on its own because everything that throws a value
 * away writes the document first: a capability the researcher switches off is
 * unset there before the form is emptied (`useDiscardStageValues`), so a
 * control arriving under that path afterwards — a list behind a collapsed
 * group, say — reads the same absence every other reader does.
 *
 * **The live form is the account of an edit that has not been saved yet**, and
 * only for as long as something is mounted to hold it. A field registered at a
 * CONTAINER carries everything beneath it, so a leaf mounting later under one
 * — a group of advanced options opened for the first time — has an account of
 * its path already on screen, and it is newer than the draft. Seeded from the
 * committed draft instead, such a leaf showed the value the researcher had
 * just replaced, and then wrote it back over their edit on the next save:
 * `stageDraftFromSubmission` replays the deeper field after the container
 * above it, so the stale reading won.
 *
 * Beneath a mounted ancestor the form is asked and answers for the whole path,
 * absence included — a container the researcher has emptied says there is
 * nothing there, and the committed draft must not put it back. With no
 * mounted ancestor the form holds no account of the path at all (a value
 * PARKED by an unmounted field is deliberately not one: the submit drops a
 * parked write a mounted field overlaps), and the committed draft answers.
 *
 * The value is memoised because `initialValue` is a dependency of the effect
 * that registers a field: an unstable one re-registers it on every render.
 */
export function useResolvedFieldIdentity(
  name: string,
  nameMode: FieldNameMode = 'legacy',
): Readonly<{ registeredName: string; seedValue: unknown }> {
  const { committedFields, storeApi } = useStageEditorForm();
  const namespace = useFieldNamespacePath();

  return useMemo(() => {
    const path = resolveFieldPath(namespace, name, nameMode);
    const live = liveValueBeneathAMountedAncestor(storeApi, path);
    return {
      registeredName: formatObjectPath(path),
      seedValue: live.mounted ? live.value : getValue(committedFields, path),
    };
  }, [committedFields, name, nameMode, namespace, storeApi]);
}

/**
 * What the form holds at `path`, and whether anything mounted is holding it.
 *
 * The two answers have to be separable: a container that does not hold the key
 * and a path no mounted field reaches are both `undefined` to a plain read,
 * and they mean opposite things — the first is the researcher's own emptiness,
 * the second is nothing to say.
 *
 * Only a STRICT ancestor counts. A field registered at the path itself is the
 * field being seeded remounting into its own dormant value, which the form
 * store restores by itself.
 */
function liveValueBeneathAMountedAncestor(
  storeApi: StageFormStoreApi,
  path: ObjectPath,
): Readonly<{ mounted: boolean; value: unknown }> {
  if (path.length < 2) return { mounted: false, value: undefined };
  const state = storeApi.getState();
  const mounted = mountedPathsOf(storeApi).some(
    (candidate) =>
      candidate.length < path.length &&
      candidate.every((segment, index) => path[index] === segment),
  );
  return mounted
    ? { mounted: true, value: getValue(state.getFormValues(), path) }
    : { mounted: false, value: undefined };
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
 * The document is written first, in ONE batch, and the form is emptied
 * afterwards.
 *
 * **A discard travels with its cause.** A capability cleared because the data
 * file it described was replaced is only intelligible beside the replacement:
 * written on its own, the document passes through a state describing the old
 * file with everything about it gone, which is a stage nobody authored. The
 * cause is also part of the state the discards are read against — an
 * exclusive-variant container travels whole, so a discard inside one is a
 * single `set` of the container, and a container assembled without the cause
 * would put back the value the researcher has just changed.
 *
 * Nothing is written for a cause the document already holds, so the second and
 * third sections resetting on the same file add no command of their own.
 *
 * **The cause travels whether or not anything was thrown away.** A capability
 * that happened to hold nothing changes what the batch discards and nothing
 * else: the file was still replaced. So the batch is built first and dispatched
 * on ITS length rather than on the discards': a lone cause travels, and a reset
 * with nothing whatever to say writes nothing at all.
 *
 * The FORM is emptied either way. A value typed into a capability and not yet
 * flushed is on screen and in no document, so a reset that left it there would
 * write it back on the next save under a cause it no longer describes —
 * **unless the write was refused**, which is what happens when the editor is
 * read-only. Nothing was thrown away then, so nothing may be emptied either,
 * and the caller is told so it can leave its own switch where the researcher
 * left it.
 */
export function useDiscardStageValues(): (
  paths: readonly string[],
  cause?: DiscardCause,
) => boolean {
  const { applyOwnCommands } = useStageEditorForm();
  const clearStageValue = useClearStageValue();

  return useCallback(
    (paths: readonly string[], cause?: DiscardCause) => {
      // `applyOwnCommands([])` is how anything here reads the document as it
      // stands NOW, rather than the render this callback was built against. An
      // empty batch writes nothing, so it can never be refused.
      const { draft: current } = applyOwnCommands([]);
      const causeBatch = causeCommands(current, cause);
      /**
       * The document the discards are read against, WITH the cause already in
       * it. See above for why the cause cannot be left out of it.
       */
      const withCause = applyCommands(current, [...causeBatch]);
      let next = withCause;
      for (const path of paths) {
        const target = safePath(path);
        if (target === null || target.length === 0) continue;
        next = withoutValueAt(next, target);
      }
      const discards = commandsFromDraftChange(withCause, next);
      // The cause first, so the batch reads as what happened: this changed, and
      // therefore these were thrown away.
      const batch = [
        ...causeBatch.filter((command) => !carriedBy(discards, command)),
        ...discards,
      ];
      if (batch.length > 0 && applyOwnCommands(batch).refused) return false;

      // The FORM only, and only the discarded paths: the cause is already on
      // screen, because the researcher chose it.
      for (const path of paths) clearStageValue(path);
      return true;
    },
    [applyOwnCommands, clearStageValue],
  );
}

/**
 * Whether a discard already writes the cause's own value on its way past.
 *
 * Only one shape produces this: a discard inside an exclusive-variant
 * container is a single `set` of the whole container, and because the cause
 * was written into the draft that `set` was diffed FROM, the container it
 * carries already holds it. Sending the cause separately as well would be a
 * command saying what the next one says again — and a reader of the log would
 * have to work out that the two do not disagree.
 *
 * Asked of the commands rather than of the schema, so it answers for whatever
 * reason a container comes to travel whole rather than only for the reason
 * there is today.
 */
function carriedBy(discards: readonly Command[], cause: Command): boolean {
  const causePath = targetPath(cause.key);
  return discards.some(
    (command) =>
      command.op === 'set' && covers(targetPath(command.key), causePath),
  );
}

/** Whether writing at `ancestor` writes whatever is at `path`. */
const covers = (
  ancestor: readonly string[],
  path: readonly string[],
): boolean =>
  ancestor.length <= path.length &&
  ancestor.every((segment, index) => segment === path[index]);

/**
 * The command that puts a discard's cause into the draft, or nothing at all.
 *
 * Nothing when the draft already agrees, which is the ordinary case for every
 * section after the first: they all read the same file, and the first one to
 * reset writes it.
 *
 * **A cause no command can address is refused out loud.** A `CommandTarget`
 * names keys and never positions — `commandTarget` takes strings, and
 * positional addressing is what it exists to rule out — so a reset path with an
 * index in it, or one that is not a path at all, has no command that could
 * carry it. That is a section describing itself wrongly: `resetOn` is
 * documented as the path a single FIELD owns. Answering with no command would
 * be the worst of the three outcomes, because the discards would then be
 * written without the change that explains them — the whole defect the cause
 * exists to prevent. So it throws, at the first reset, where the path is a
 * constant of the section and every test of it says so.
 */
function causeCommands(
  current: StageFormDraft,
  cause: DiscardCause | undefined,
): readonly Command[] {
  if (cause === undefined) return [];
  const target = safePath(cause.path);
  const keys = (target ?? []).filter(
    (segment): segment is string => typeof segment === 'string',
  );
  if (target === null || keys.length === 0 || keys.length !== target.length) {
    throw new Error(
      `A section resets on "${cause.path}", which no command can address. A reset must name the path one field owns, spelled with keys and no list positions.`,
    );
  }
  const key = commandTarget(keys);
  const held = getValue(current, target);
  if (canonicalize(held) === canonicalize(cause.value)) return [];
  return cause.value === undefined
    ? [{ op: 'unset', key }]
    : [{ op: 'set', key, value: cause.value }];
}

/**
 * Empties a path in the stage form, and everything that reaches it.
 *
 * The FORM only. Its caller has already written what it decided into the
 * document — `useDiscardStageValues` with an unset, `useResetStageOnSubjectChange`
 * with a batch that also carries the template defaults it is resetting to — and
 * this brings the controls on screen level with that, immediately, rather than
 * leaving them showing values the document no longer has.
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
 * What an agreed stage draft holds at one path.
 *
 * The one way a draft is read by path outside the form store, so that two
 * readers asking about the same path can never be asking about two different
 * values. `useStageValue` falls back to it when the form knows nothing, and
 * `useOnResearcherChange` reads the agreed draft through it beside that — and
 * the whole point of THAT pair is comparing them, which is worth nothing if
 * they resolve the path differently.
 *
 * Canonically parsed, like every other path in this package: `a.b` is a route
 * through the document and `["a.b"]` is one protocol-authored key that happens
 * to contain a dot. A general-purpose `get` decides between those two readings
 * by whether the object it is holding happens to have such a key, which makes
 * the meaning of a section's `resetOn` depend on the content of the stage.
 *
 * A path that is no path at all reports `undefined` rather than throwing: this
 * is a read, and every caller already has to handle a path holding nothing.
 */
export function stageDraftValue(
  fields: StageFormDraft,
  path: string | undefined,
): unknown {
  if (path === undefined) return undefined;
  const target = safePath(path);
  return target === null ? undefined : getValue(fields, target);
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
        : stageDraftValue(committedFields, path);
    }
    return pathOperations.hasValue(target)
      ? pathOperations.getValue(target)
      : stageDraftValue(committedFields, path);
  }, [committedFields, path, storeApi]);

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
 * The same question, asked at the moment it matters rather than watched.
 *
 * For a caller whose paths are not known until something happens — a subject
 * change, which invalidates whatever the stage happens to be carrying at the
 * time. Watching them would mean recomputing the set on every render to hand
 * it to a hook, for an answer nobody has asked for yet.
 *
 * The same `pathHasAnswer` either way, deliberately: a capability's switch-off
 * and a subject change both decide whether to warn the researcher that
 * something will be lost, and two judgements of "holds something" would let
 * one of them warn where the other did not.
 */
export function useAskStageHasAnyValue(): (
  paths: readonly string[],
) => boolean {
  const { storeApi, committedFields } = useStageEditorForm();
  return useCallback(
    (paths) =>
      paths.some((path) =>
        pathHasAnswer(storeApi.getState(), committedFields, path),
      ),
    [committedFields, storeApi],
  );
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

import {
  type ObjectPath,
  omitValue,
} from '@codaco/fresco-ui/form/utils/objectPath';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';

/**
 * A row as the researcher left it, with everything they did not answer gone.
 *
 * Every "absent" a form can produce is spelled the same way in the protocol
 * schema: the key is not there. A cleared control submits an empty string or
 * the spaces around what was deleted, a number input mid-entry reports `NaN`,
 * a picker that was never used can hand back `null`, and a group of controls
 * whose every part is empty assembles an object of nothing — and none of those
 * are values the schema accepts where it accepts a value at all. Left in, they
 * reach a save as `"negativeLabel": ""` and are refused in the schema's own
 * words against a path, rather than simply not being there.
 *
 * Empty ARRAYS survive. A list the researcher emptied is a list they emptied,
 * and the rules that decide whether that is allowed belong to the field that
 * owns the list, not here.
 */
export function withoutAbsentValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAbsentValues);
  if (typeof value !== 'object' || value === null) return value;

  const kept: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const cleaned = withoutAbsentValues(entry);
    if (isAbsentValue(cleaned)) continue;
    kept[key] = cleaned;
  }
  return kept;
}

/**
 * Whether a value, once cleaned, says nothing at all.
 *
 * **A control holds nothing exactly when the form says it does.** That
 * judgement is fresco-ui's `isUnanswered`, and it is the one the researcher
 * was shown: an optional control holding only whitespace raised no error, and
 * neither did a number input halfway through being emptied — which reports the
 * `NaN` a partial entry produces. Answering differently here saves what the
 * form told the researcher was not there: `negativeLabel: "  "` written into
 * the stage as a label, and `NaN` handed to a schema that refuses it against a
 * path the form said nothing about. One predicate is what stops the two from
 * drifting; `useStageHasAnyValue` already asks it, so a capability this kept
 * would also be reported as holding nothing.
 *
 * Exported because the reading and the judgement belong together: a caller
 * that cleans a submitted value has to ask the same question of what comes
 * back — a control cleared to `''` and a group of controls that cleaned down
 * to `{}` are both "this field holds nothing", and the caller's answer to that
 * is to remove the key rather than to write anything at it.
 *
 * Two answers are this package's own, and both are about CONTAINERS rather
 * than about what a control holds. An empty ARRAY is deliberately not
 * emptiness, so the shared predicate is never asked about one: a list the
 * researcher emptied is a list they emptied, and whether that is allowed
 * belongs to the field that owns it. An empty OBJECT is emptiness, which the
 * shared predicate says nothing about: it is what a group of unanswered
 * controls assembles into, and never a value in its own right.
 *
 * `false` and `0` are answers, there and here.
 */
export function isAbsentValue(value: unknown): boolean {
  if (Array.isArray(value)) return false;
  if (isUnanswered(value)) return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 0
  );
}

/**
 * A copy of `container` with `path` removed, and with anything that removal
 * emptied removed as well.
 *
 * The one rule for taking something out, wherever anything takes something
 * out: a submit dropping a field the researcher discarded, a capability's
 * switch-off emptying the container it owns, and that same switch-off reaching
 * inside a compound field registered above it. Removing the three parts of
 * `skipLogic` has to remove `skipLogic` itself — a `{}` left behind is not "no
 * skip logic" to the schema, it is a skip logic missing its required members —
 * so the rule cannot differ between the places that apply it.
 *
 * Only containers this removal emptied are dropped: an object that was already
 * empty is left exactly as the author left it.
 *
 * An emptied ROW stays. `omitValue` turns an omitted array index into a hole
 * rather than renumbering the entries around it, so pruning there would punch a
 * gap in a list of prompts or items — and taking a row out is a deliberate
 * array operation rather than a consequence of clearing one of its settings.
 *
 * The container itself is never removed, only what is inside it. A caller
 * holding one field's value has nowhere to put an absence, and a caller holding
 * the draft is removing a key from the stage rather than the stage.
 *
 * Returns `container` itself when there was nothing there to remove, which is
 * how `omitValue` reports it and what callers read as "this held nothing".
 */
export function withoutValueAt<T>(container: T, path: ObjectPath): T {
  const removed = omitValue(container, path);
  if (removed === container) return container;

  let next = removed;
  for (let depth = path.length - 1; depth >= 1; depth -= 1) {
    const ancestor = path.slice(0, depth);
    if (!isEmptyDictionary(readValueAt(next, ancestor))) break;
    if (typeof ancestor.at(-1) === 'number') break;
    next = omitValue(next, ancestor);
  }
  // `omitValue` copies the containers it walks and replaces nothing else, so
  // what comes back is the same shape it was handed. The one assertion is here
  // rather than at each call site, which is the point of there being one rule.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return next as T;
}

/**
 * Arrays are excluded on purpose: `omitValue` leaves a hole rather than
 * renumbering an array's surviving entries, so an emptied array is not
 * evidence that the array itself should go.
 */
function isEmptyDictionary(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

/** What sits at a path inside a value that need not be a container at all. */
function readValueAt(value: unknown, path: ObjectPath): unknown {
  let cursor: unknown = value;
  for (const segment of path) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    if (!Object.hasOwn(cursor, segment)) return undefined;
    cursor = Object.getOwnPropertyDescriptor(cursor, segment)?.value;
  }
  return cursor;
}

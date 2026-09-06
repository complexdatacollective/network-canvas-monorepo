import { get, isEqual } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';

/**
 * Runs `onChange` when the RESEARCHER changes the value at `path`, and not
 * when the draft moves beneath the form.
 *
 * Everything that resets on a value someone else owns needs this same
 * distinction, and needs it to be the same distinction: a stage resetting its
 * configuration when the subject changes, a pedigree emptying its slots when
 * the node type changes, a capability switching itself off when the thing it
 * describes is replaced. All three are watching a value they do not own for a
 * choice, and all three are wrong to act on the value merely MOVING.
 *
 * An observer rather than an `onChange` handler on the field itself, because a
 * caller's `onChange` on a Fresco field REPLACES the store's own write rather
 * than running beside it — a side effect has to watch the value instead. And
 * watching is what creates the problem this solves: an undo, a redo, a
 * collaborator's change and the atomic edit that creates a type and selects it
 * all move the same value, and each arrives carrying the configuration that
 * belongs to the value it brings with it. Resetting there wipes the half of
 * the change the researcher was reaching for — an undo that restores a type
 * AND its attributes would lose the attributes again on the spot.
 *
 * They are told apart by watching the AGREED draft as well as the form. When
 * the agreed value moves, the form's controls are about to be re-seeded with
 * it, and the form's own value arriving there is that re-seed rather than a
 * choice. Deliberately not "did both move in the same render": the re-seed
 * happens in the shell's effect, which runs after this one, so the two are a
 * render apart and in an order no caller controls.
 *
 * The first value a path is given is not a change. There was no previous one
 * for anything to have been configured against, so a stage that has just been
 * handed its subject has nothing to reset — and a section resetting there
 * would empty something the researcher has not touched.
 *
 * `path` is optional so a caller whose reset is itself optional can still ask
 * unconditionally, which a hook has to be able to do. A path nobody named
 * never changes.
 */
export function useOnResearcherChange(
  path: string | undefined,
  onChange: (value: unknown) => void,
): void {
  const { committedFields } = useStageEditorForm();
  const value = useStageValue(path);
  // Read the way the two resets that came before this read it. The paths a
  // section resets on are the ones a single field owns — `subject`,
  // `dataSource`, `nodeConfig.type` — and none of them is a protocol-authored
  // name that a dotted read could mistake for a route.
  const committed: unknown =
    path === undefined ? undefined : get(committedFields, path);

  // Held in a ref rather than depended on: a caller spells its reset inline,
  // so the callback is a new function every render and depending on it would
  // run this effect on every one of them. The effect runs on the VALUES, and
  // uses whichever callback the latest render gave it.
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  const seen = useRef(value);
  const seenCommitted = useRef(committed);
  /**
   * The value the form is expected to be re-seeded with, once the agreed draft
   * has moved to one the controls have not caught up with.
   *
   * Cleared by whichever change arrives next, including a change to something
   * else entirely — a foreign arrival landing in the middle of a researcher's
   * own pick is genuinely ambiguous, and acting on it is the recoverable side
   * of that.
   */
  const awaitingReseedTo = useRef<{ value: unknown } | null>(null);

  useEffect(() => {
    const previous = seen.current;
    seen.current = value;
    const previousCommitted = seenCommitted.current;
    seenCommitted.current = committed;

    if (!isEqual(previousCommitted, committed)) {
      awaitingReseedTo.current = { value: committed };
    }

    if (previous === undefined || isEqual(previous, value)) return;

    const expected = awaitingReseedTo.current;
    awaitingReseedTo.current = null;
    if (expected !== null && isEqual(expected.value, value)) return;

    latestOnChange.current(value);
  }, [committed, value]);
}

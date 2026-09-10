import { isEqual } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { stageDraftValue, useStageValue } from '../form/stageFormHooks.ts';

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
 * watching is what creates the problem this solves: a value can move for
 * reasons that are not a choice — the create dialog selecting the type it has
 * just made, a refused pick being put back — and each of those arrives
 * carrying the configuration that belongs to the value it brings with it.
 * Resetting there wipes the half of the change the researcher was reaching for.
 *
 * They are told apart by watching the AGREED document as well as the form.
 * When the agreed value moves, the form's controls are about to be brought
 * level with it, and the form's own value arriving there is that rather than a
 * choice. Deliberately not "did both move in the same render": the two are a
 * render apart, in an order no caller controls.
 *
 * The FIRST OBSERVATION is not a change, and nothing else is exempt. There was
 * no previous value for anything to have been configured against, so a section
 * mounting over a stage that already carries its subject has nothing to reset,
 * and resetting there would empty something the researcher has not touched.
 *
 * Every reading after that one is a transition, INCLUDING the transition out of
 * `undefined`. A path that starts absent is exactly the path a researcher is
 * about to fill in for the first time, and that first selection is a choice
 * like any other: the stale values beside a prerequisite that was missing are
 * the ones it invalidates, and the choice is the cause the discard's batch
 * carries. Treating it as another initial observation swallowed both — the
 * values survived into the save, and a data file staged in this session
 * reached no batch at all, so every later edit made against it went to a
 * live-applying host ahead of the file and outlived this session's cancel.
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
  // The same resolution `useStageValue` uses, and it has to be: the only thing
  // these two reads are for is being compared, and a path one of them reads as
  // a route while the other reads it as a single key gives two values from two
  // places. They would then move independently — an arrival that changed one
  // and not the other would read as a researcher's own choice, and the section
  // would reset on it.
  const committed = stageDraftValue(committedFields, path);

  // Held in a ref rather than depended on: a caller spells its reset inline,
  // so the callback is a new function every render and depending on it would
  // run this effect on every one of them. The effect runs on the VALUES, and
  // uses whichever callback the latest render gave it.
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  /**
   * The last reading, and whether there has been one at all.
   *
   * A box rather than the value itself, because `undefined` is a value this
   * path really holds: an unobserved path and one the researcher has emptied
   * are the same reading, and only "has this effect run yet" tells them apart.
   * Started empty rather than at the first render's value so the two answers
   * come from one place — the effect that records a reading is the effect that
   * decides whether there was one before it.
   */
  const seen = useRef<{ value: unknown } | null>(null);
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
    seen.current = { value };
    const previousCommitted = seenCommitted.current;
    seenCommitted.current = committed;

    if (!isEqual(previousCommitted, committed)) {
      awaitingReseedTo.current = { value: committed };
    }

    // Nothing to compare against, or nothing moved.
    if (previous === null || isEqual(previous.value, value)) return;

    const expected = awaitingReseedTo.current;
    awaitingReseedTo.current = null;
    if (expected !== null && isEqual(expected.value, value)) return;

    latestOnChange.current(value);
  }, [committed, value]);
}

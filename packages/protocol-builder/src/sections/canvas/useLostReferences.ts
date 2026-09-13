import { useRef } from 'react';

const NOTHING_LOST: readonly string[] = Object.freeze([]);

/**
 * The ids a tick list NAMES that its options no longer offer.
 *
 * A tick list renders its boxes from the codebook and its ticks from the
 * value, so a type or an attribute a collaborator deletes simply stops being a
 * box while the id stays in the value, where the protocol schema still refuses
 * it. With no box to untick, the only way out was deleting whatever holds the
 * id — the whole prompt, or the whole stage. It is kept and shown instead, for
 * the reason `VariablePickerField` keeps a deleted attribute: the reference the
 * researcher has to resolve must be the one thing they can see.
 *
 * `named` is what the list names — the value it arrived with AND the value the
 * researcher is building — rather than the committed value alone. An id ticked
 * a moment ago and deleted by a collaborator now is lost the same way, and read
 * from the committed value alone it would leave the tick list while the id
 * stayed in the field: an invisible dangling reference, saved.
 *
 * Accumulated rather than derived, and that is the point: an id stops being
 * named the moment the researcher unticks it, and a box that disappeared as it
 * was unticked would take with it the only evidence of what the list had been
 * holding. So an id enters when the list names it and the options do not offer
 * it, and leaves only when they offer it again.
 *
 * The same array is answered with while its contents do not change, for the
 * reason `useStableIdList` exists.
 */
export function useLostReferences(
  named: readonly string[],
  offered: ReadonlySet<string>,
): readonly string[] {
  const held = useRef<readonly string[]>(NOTHING_LOST);
  const current = held.current;
  const next = current.filter((id) => !offered.has(id));
  for (const id of named) {
    if (!offered.has(id) && !next.includes(id)) next.push(id);
  }
  const unchanged =
    next.length === current.length &&
    next.every((entry, index) => entry === current[index]);
  if (!unchanged) held.current = next;
  return held.current;
}

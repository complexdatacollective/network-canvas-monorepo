import { useRef } from 'react';

const NO_LOST_EDGE_TYPES: readonly string[] = Object.freeze([]);

/**
 * The connection types a stage names and the codebook no longer defines.
 *
 * A canvas section renders its tick list from the CODEBOOK and its ticks from
 * the value, so a type a collaborator deletes simply stops being a choice —
 * while the id stays in the stage, where the schema still refuses it. With no
 * tick box to untick, the only way out was deleting whatever holds the id: the
 * whole prompt, or the whole stage. It is kept and shown instead, for the
 * reason `VariablePicker` keeps a deleted attribute: the reference the
 * researcher has to resolve must be the one thing they can see.
 *
 * `named` is what the surface NAMES — the value it arrived with and the one
 * the researcher is building — rather than the committed value alone. A type
 * ticked a moment ago and deleted by a collaborator now is lost in exactly the
 * same way, and read only from the committed value it would leave the tick
 * list while the id stayed in the field: an invisible dangling reference,
 * saved.
 *
 * Accumulated rather than derived, and that is the point: an id stops being
 * NAMED the moment the researcher unticks it, and a choice that disappeared as
 * it was unticked would take with it the only evidence of what the surface had
 * been holding. So an id enters this list when the surface names it and the
 * codebook does not have it, and leaves only when the codebook has it again.
 *
 * The same array is answered with for as long as its contents do not change,
 * for the reason `useStableIdList` exists: the options a control registers with
 * are part of that registration, and a fresh array on every tick re-registers
 * the field — which supersedes a running submit's validation and refuses the
 * save with nothing on screen to say why.
 *
 * Shared by the sociogram's prompt editor and the network composer's
 * connection list, which lose a type the same way and have to say so in the
 * same words.
 */
export function useLostEdgeTypes(
  named: readonly string[],
  known: ReadonlySet<string>,
): readonly string[] {
  const held = useRef<readonly string[]>(NO_LOST_EDGE_TYPES);
  const current = held.current;
  const next = current.filter((id) => !known.has(id));
  for (const id of named) {
    if (!known.has(id) && !next.includes(id)) next.push(id);
  }
  const unchanged =
    next.length === current.length &&
    next.every((entry, index) => entry === current[index]);
  if (!unchanged) held.current = next;
  return held.current;
}

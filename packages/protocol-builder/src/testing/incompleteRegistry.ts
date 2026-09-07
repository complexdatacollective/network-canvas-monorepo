import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorRegistry } from '../stage-editor-contract.ts';
import { STAGE_TYPES } from '../stage-types.ts';

/**
 * Thrown when a stage is dispatched through a registry that does not claim it.
 *
 * A TESTING CONCEPT, WHICH IS WHY IT LIVES HERE. `StageEditor` takes a whole
 * `StageEditorRegistry`, and `stageEditorRegistry`'s own annotation proves the
 * package composes one, so no host can put a researcher in front of an
 * interface nothing renders — the compiler refuses to describe that registry
 * at all. What a test can still do, and needs to, is dispatch through ONE
 * FAMILY'S PART: "opening a categorical bin reaches this family's editor" is
 * only worth asserting if the family not claiming that interface would make it
 * fail, and a part completed from the package's own registry would answer for
 * every interface whatever the family claimed.
 *
 * So the harness completes a part with these instead, and the refusal names
 * the interface — a family test that opens a stage its part does not claim
 * fails saying which one, rather than rendering some other family's editor and
 * failing on a section that is missing for a reason nobody can see.
 */
export class UnregisteredStageTypeError extends Error {
  readonly stageType: StageType;

  constructor(stageType: StageType) {
    super(
      `No stage editor is registered for the "${stageType}" interface, so it cannot be edited here.`,
    );
    this.stageType = stageType;
    this.name = 'UnregisteredStageTypeError';
  }
}

/**
 * A part, as a whole registry: every interface it does not claim refuses.
 *
 * Filled with refusals rather than with the package's own editors, for the
 * reason above — and the refusal throws when it is RENDERED rather than when
 * the registry is built, because which interface a test reaches is decided by
 * the stage it opens, and a registry that threw on composition could not be
 * handed a part at all.
 */
export function dispatchThroughPart(
  part: Partial<StageEditorRegistry>,
): StageEditorRegistry {
  const refusals: Partial<StageEditorRegistry> = {};
  for (const stageType of STAGE_TYPES) {
    if (part[stageType] !== undefined) continue;
    // Assigned under a computed key so the entry's component type follows the
    // key it is filed under. Written out, each would have to be a component
    // for the whole `StageType` union, and a component's props are
    // contravariant: no such component is assignable to any one entry.
    Object.assign(refusals, {
      [stageType]: () => {
        throw new UnregisteredStageTypeError(stageType);
      },
    });
  }
  // Every stage type now holds something: what the part claims, or a refusal.
  // `STAGE_TYPES` is the schema's own key set — see `stage-types.ts` — which
  // is what makes that true rather than merely intended.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { ...refusals, ...part } as StageEditorRegistry;
}

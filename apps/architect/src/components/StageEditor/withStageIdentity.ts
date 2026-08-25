import { omit } from 'es-toolkit/compat';

import type { Stage } from '@codaco/protocol-validation';

/**
 * The stage a set of form values stands for: what a save would commit, what a
 * preview would launch, and what a live analysis has to describe.
 *
 * One home for it, because the three must agree. `getFormValues()` reports
 * REGISTERED fields, so absence there means one of exactly two things, and
 * this is where they are told apart:
 *
 *  - a key the researcher REMOVED (a section toggled off) — dropped, which is
 *    why every consumer overwrites rather than merges the committed stage back
 *    in. A surface that merged would go on describing a stage the save will
 *    never produce, and a live feasibility verdict about a protocol nobody can
 *    save is worse than none;
 *  - a key no field on this interface could carry — the identity, and
 *    `skipLogic`/`synthetic` on an interface rendering no such section. Those
 *    are carried through from the committed stage, since the form had no way
 *    to hold them in the first place.
 */

export type StageFormCarries = {
  /** Whether this interface renders the SkipLogic section. */
  skipLogic: boolean;
  /** Whether this interface renders the Synthetic data section. */
  synthetic: boolean;
};

export const withStageIdentity = (
  values: Stage,
  committedStage: Stage | null,
  carries: StageFormCarries,
): Stage =>
  ({
    id: committedStage?.id,
    type: committedStage?.type,
    // No field owns either key, so `values` cannot carry them — dropping them
    // keeps that explicit, and keeps the committed identity authoritative if a
    // future field ever does register one.
    ...omit(values as unknown as Record<string, unknown>, ['id', 'type']),
    // A committed `skipLogic` on an interface that renders no SkipLogic
    // section structurally cannot be carried by `values`; without this merge
    // the overwrite save would silently delete it on the first Finished
    // Editing. Interfaces that DO render the section are excluded on purpose:
    // there an absent key means the researcher toggled skip logic off, and
    // restoring it would resurrect exactly what they removed.
    ...(!carries.skipLogic && committedStage?.skipLogic !== undefined
      ? { skipLogic: committedStage.skipLogic }
      : {}),
    // A committed `synthetic` — the stage's generation parameters, which the
    // schema allows on every stage type — is carried the same way, and gated
    // for the same reason. The Synthetic data section authors the key on every
    // interface that renders it, so there an absent key means the researcher
    // RESET it and restoring the committed value would resurrect exactly what
    // they removed. The carry survives for an interface that renders no such
    // section, where the key still has no field it could travel in.
    //
    // Costs nothing for a stage that never had one: no interface template
    // seeds the key (see `interfaces.skipLogic.test.ts`, which holds the
    // templates to it), so `committedStage.synthetic` is `undefined` on a
    // fresh stage, and both `prune` boundaries — the commit reducer and
    // `buildProtocolWithStage` — strip an `undefined` value anyway.
    ...(!carries.synthetic && committedStage?.synthetic !== undefined
      ? { synthetic: committedStage.synthetic }
      : {}),
  }) as unknown as Stage;

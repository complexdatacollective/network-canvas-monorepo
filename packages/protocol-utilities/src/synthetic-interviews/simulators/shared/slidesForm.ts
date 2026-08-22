import type { Variables } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import type { GenerationContext } from '../../constraints/context';
import type { EntityScopeRef } from '../../constraints/generateEntityAttributes';
import type { EntityConstraints } from '../../constraints/types';
import type { AttributePatch } from '../../session-engine/actions';
import { resolveFormValues } from './formValues';

/**
 * Simulate a participant working through a deck of form slides — one per
 * entity, the same questions on each.
 *
 * Shared by AlterForm and AlterEdgeForm, which render the SAME `SlidesForm`
 * component and differ only in what they put on the slides (nodes or edges)
 * and which primitive records the answers. Everything a participant does with
 * the deck is one behaviour, and writing it twice would let the two drift.
 *
 * Nothing here elicits anything: the deck is built from what the network
 * already holds, so a stage reaching an empty one has no slides to show and
 * writes nothing. That is the interface's own empty-items short-circuit, which
 * leaves the stage immediately.
 *
 * A slide is submitted even where every answer on it was given earlier. The
 * form pre-fills each field from the entity's current attributes and submits
 * what it was shown, so the participant confirms rather than re-answers — and
 * an entity that already holds a value keeps it, because a re-drawn answer
 * would report somebody who changed their mind between two screens and would
 * ask the unique registry for a second value where the session only ever held
 * one. What they already hold is still handed over as `existing`, so a rule
 * relating one field to another resolves against the real session.
 *
 * Slides come in the order the deck lists them, which is the order the caller
 * resolved: the network's own, filtered to what the stage shows.
 */
export const simulateSlidesForm = ({
  items,
  fields,
  variables,
  constraints,
  generation,
  scope,
  write,
}: {
  items: readonly (NcNode | NcEdge)[];
  /** The variable ids the form collects, in the order it declares them. */
  fields: readonly string[];
  variables: Variables | undefined;
  constraints: EntityConstraints;
  generation: GenerationContext;
  scope: EntityScopeRef;
  /** The engine primitive this interface records a submitted slide with. */
  write: (entityId: string, attributePatch: AttributePatch) => void;
}): void => {
  const collected = new Set(fields);

  items.forEach((item, index) => {
    const answered = item[entityAttributesProperty];
    const unanswered = new Set(
      [...collected].filter((id) => answered[id] === undefined),
    );

    write(item[entityPrimaryKeyProperty], {
      set: resolveFormValues({
        variables,
        fields: unanswered,
        constraints,
        generation,
        scope,
        // The slide's position in the deck sequences one entity's draws
        // against its neighbours', which is what lets a `unique` variable hand
        // out a different value on every slide.
        index,
        existing: answered,
      }),
      // A field left blank is ABSENT from the patch rather than unset. The
      // runtime submits it as an unset, and the two land in the same place:
      // the only fields this leaves blank are ones the entity was not
      // carrying, so the unset would delete a key that is not there. Modelling
      // a participant who CLEARS an answer they already gave is what would
      // make the difference visible, and no interface asks them to.
      unset: [],
    });
  });
};

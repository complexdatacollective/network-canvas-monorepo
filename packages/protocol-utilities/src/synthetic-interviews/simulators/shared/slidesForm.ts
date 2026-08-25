import type { Variables } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import type { GenerationContext } from '../../constraints/context';
import { ownRuleBroken } from '../../constraints/fixedValueRules';
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
 * derives: the network's own, filtered to what the stage shows. The deck is
 * DERIVED LIVE, because the runtime's is: `useStageSelector` re-runs the
 * stage filter after every submitted update, while the slide position is a
 * bare local index whose forward test reads the length of the list captured
 * BEFORE the submission (`SlidesForm.tsx` `beforeNext` closes over the
 * pre-submit `items`). So when the stage's filter reacts to a field this form
 * collects, submitting a slide shifts the remainder of the deck under a
 * stationary index — the runtime genuinely skips the entity that slides into
 * the submitted position — and this walk steps through exactly the same
 * sequence rather than a snapshot the participant never saw. A stage without
 * a filter derives the same deck every time, and walks it unchanged.
 */
export const simulateSlidesForm = ({
  deriveItems,
  live,
  fields,
  variables,
  constraints,
  generation,
  scope,
  write,
}: {
  /** The deck as the interface would derive it from the network right now. */
  deriveItems: () => readonly (NcNode | NcEdge)[];
  /** Whether this stage's own writes can change what `deriveItems` returns. */
  live: boolean;
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
  let deck = deriveItems();
  let submitted = 0;

  for (let activeIndex = 0; ; activeIndex += 1) {
    if (deck.length === 0) break;
    const item = deck[activeIndex];
    // A deck that shrank past the index renders an empty slide with nothing
    // to submit; the forward test below still decides whether the stage ends.
    if (item !== undefined) {
      submitSlide(item, submitted);
      submitted += 1;
    }

    // The runtime's forward test reads the PRE-submit deck's length, so the
    // decision to leave is taken against the list the participant was just
    // shown; only the next slide itself comes off the refreshed one.
    if (activeIndex >= deck.length - 1) break;
    if (live) deck = deriveItems();
  }

  function submitSlide(item: NcNode | NcEdge, index: number): void {
    const answered = item[entityAttributesProperty];
    // A field is generated where the entity holds no value — and where the
    // value it holds is one the form's own validators reject. The form
    // pre-fills each field and refuses to advance while one fails validation
    // (an empty required name off a roster row, a number below `minValue`),
    // so a participant reaching such a slide is MADE to correct it; keeping
    // the invalid value would return a completed session the real form
    // rejects. Judged by each variable's own effective rules — the same set
    // the replacement is drawn against — while rules SPANNING two variables
    // stay with the draw's comparator folding, which already resolves them
    // against `existing`. The redraw's release-before-draw hands a displaced
    // `unique` value back through the same path every regeneration uses.
    const unanswered = new Set(
      [...collected].filter((id) => {
        const held = answered[id];
        if (held === undefined) return true;
        const variable = constraints.get(id);
        return (
          variable !== undefined && ownRuleBroken(variable, held) !== undefined
        );
      }),
    );

    const set = resolveFormValues({
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
    });

    // A field the entity was NOT carrying and the draw left blank is absent
    // from the patch rather than unset: the runtime submits it as an unset,
    // and the two land in the same place, because the unset would delete a key
    // that is not there.
    //
    // A field whose value the form REJECTED is the other case, and it does
    // need the unset. The participant is made to correct that field before the
    // slide will advance, and where the correction the descriptor draws is
    // itself blank — an optional field its `missingProbability` leaves
    // unanswered — what they did was clear it. The runtime's own submit unsets
    // every mounted field it was handed empty (`formValuesToAttributePatch`),
    // so leaving it out here would hand back a session still carrying the
    // value the form refused to advance over.
    const cleared = [...unanswered].filter(
      (id) => answered[id] !== undefined && !(id in set),
    );

    write(item[entityPrimaryKeyProperty], { set, unset: cleared });
  }
};

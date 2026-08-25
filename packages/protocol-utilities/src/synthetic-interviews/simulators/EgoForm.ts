import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { invariant } from '../utils/invariant';
import { resolveFormValues } from './shared/formValues';
import { generationFor } from './shared/stageContext';
import type { StageSimulator } from './types';

type EgoFormStage = Extract<Stage, { type: 'EgoForm' }>;

/**
 * The entity index every ego draw uses.
 *
 * The index is what sequences one entity's draws against its siblings' — the
 * fifth person named gets the fifth position in a `unique` variable's
 * sequence. There is exactly one ego in a session, however many stages ask it
 * questions, so every ego draw is that same first position.
 */
const EGO_INDEX = 0;

/**
 * Simulate a participant answering an ego form.
 *
 * The stage asks the participant about THEMSELVES, so everything it collects
 * is written onto the ego that has existed since the interview began — no
 * entity is created here. One `updateEgo` patch covers exactly the fields this
 * form names: an ego variable the codebook defines but no form asks for stays
 * unanswered, exactly as it would in a real session.
 *
 * An unanswered field is ABSENT from the patch rather than unset. The
 * interface pre-fills every field from the ego's current attributes
 * (`initialValues` in EgoForm.tsx) and submits what it was shown, so a form
 * that leaves a question blank submits the blank it was given — it does not
 * erase an answer the participant already made. That is also why a field the
 * ego has ALREADY answered keeps its value rather than being drawn again:
 * re-drawing would report a participant who changed their age between two
 * screens, and would ask the unique registry for a second value where the
 * session only ever held one.
 *
 * What the ego already holds is still handed to the engine as `existing`, so
 * the rules that relate one answer to another resolve against the real
 * session: a `retired` that must exceed an `age` is drawn against the `age`
 * the participant gave earlier, not against a fresh one.
 *
 * `missingProbability` applies here, unlike a quick-add name generator's one
 * field: a form field the participant leaves blank is a question that went
 * unanswered, which is a state this interface can genuinely produce.
 */
export const simulateEgoForm: StageSimulator<EgoFormStage> = (
  stage,
  context,
  promptBound,
) => {
  const egoVariables = context.protocol.codebook.ego?.variables;

  invariant(
    egoVariables,
    `stage "${stage.id}" asks the participant about themselves, but the codebook defines no ego variables`,
  );

  // A form has no prompts, so a `stopAt` bound of zero is a participant who
  // reached the screen and submitted nothing.
  if (promptBound === 0) return;

  const constraints = context.entityConstraints.forScope({ entity: 'ego' });
  const answered = context.engine.draft.network.ego[entityAttributesProperty];

  // What this form actually asks anew: the fields it names, less anything the
  // participant has already told an earlier stage.
  const unanswered = new Set(
    stage.form.fields
      .map((field) => String(field.variable))
      .filter((id) => answered[id] === undefined),
  );

  const values = resolveFormValues({
    variables: egoVariables,
    fields: unanswered,
    constraints,
    generation: generationFor(context),
    scope: { entity: 'ego' },
    index: EGO_INDEX,
    existing: answered,
  });

  // Dispatched even where it carries nothing: submitting a form whose answers
  // were all given earlier is still a submit, and the session's last-updated
  // stamp is what records that the participant was here.
  context.engine.updateEgo({ attributePatch: { set: values, unset: [] } });
};

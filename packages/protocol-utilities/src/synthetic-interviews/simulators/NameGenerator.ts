import type { Stage } from '@codaco/protocol-validation';

import { invariant } from '../utils/invariant';
import { resolveFormValues } from './shared/formValues';
import { simulateNameGeneratorNominations } from './shared/nameGeneratorNominations';
import { generationFor } from './shared/stageContext';
import type { StageSimulator } from './types';

type NameGeneratorStage = Extract<Stage, { type: 'NameGenerator' }>;

/**
 * Text variables a name generator's form collects that stand for the person
 * themselves, and so should draw a real name rather than filler words.
 *
 * A name generator's form is how a participant records who they have just
 * named, and the node renders one of its values as its label. Which field that
 * is cannot be read off the protocol — unlike a quick-add stage, which names
 * its one field outright — so this falls back to the naming convention the
 * value generator already uses, applied to the fields this form actually
 * collects.
 */
const personLabelFields = (
  stage: NameGeneratorStage,
  variables: Record<string, { name: string; type: string }>,
): ReadonlySet<string> =>
  new Set(
    stage.form.fields
      .map((field) => String(field.variable))
      .filter((id) => {
        const variable = variables[id];
        return variable?.type === 'text' && /name/i.test(variable.name);
      }),
  );

/**
 * Simulate a participant working through a name generator.
 *
 * The interface asks a whole form of each person the participant names, so a
 * newly named node carries away every field that form collects — and only
 * those. Variables the codebook defines but this form does not ask for stay
 * unanswered until a stage that does ask for them runs.
 *
 * Values come from the constraint engine, so the codebook's rules hold across
 * the form: lengths, uniqueness, and the comparator rules that relate one
 * field to another (a `retired` that must exceed an `age` is drawn against the
 * `age` this same person was given).
 *
 * Everything about nominating — roster panels, existing-network panels, and
 * how the stage's count is shared between them — is shared with
 * NameGeneratorQuickAdd in `simulateNameGeneratorNominations`.
 */
export const simulateNameGenerator: StageSimulator<NameGeneratorStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" collects node type "${stage.subject.type}", which the codebook does not define`,
  );

  // Read from the session's cache: the analysis depends only on the codebook,
  // the session date and the protocol's interface-implied rules, so it is the
  // same answer the pre-walk reservation pass already asked for.
  const constraints = context.entityConstraints.forScope({
    entity: 'node',
    type: stage.subject.type,
  });
  const generation = generationFor(context);

  const collects = stage.form.fields.map((field) => String(field.variable));
  const asPersonLabel = personLabelFields(stage, nodeType.variables ?? {});

  simulateNameGeneratorNominations({
    stage,
    context,
    promptBound,
    attributesForNewNode: (index, fixed) =>
      resolveFormValues({
        variables: nodeType.variables,
        // A field the prompt already fixed is not drawn: the fixed value is
        // handed over as `existing` instead, so a rule spanning it and a drawn
        // field holds on the finished node rather than being overwritten after
        // the fact.
        fields: new Set(collects.filter((id) => !(id in fixed))),
        constraints,
        generation,
        scope: { entity: 'node', type: stage.subject.type },
        index,
        ...(Object.keys(fixed).length > 0 ? { existing: { ...fixed } } : {}),
        preferRealisticNameVariables: asPersonLabel,
      }),
  });
};

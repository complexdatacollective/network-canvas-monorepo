import type { Stage } from '@codaco/protocol-validation';

import { invariant } from '../utils/invariant';
import { resolveFormValues } from './shared/formValues';
import { simulateNameGeneratorNominations } from './shared/nameGeneratorNominations';
import { generationFor } from './shared/stageContext';
import type { StageSimulator } from './types';

type QuickAddStage = Extract<Stage, { type: 'NameGeneratorQuickAdd' }>;

/**
 * Simulate a participant working through a quick-add name generator.
 *
 * The interface asks one thing of a person the participant types in — the text
 * in the quick-add field — so that is all a newly named node carries away from
 * this stage. Its other codebook variables stay unanswered until a stage that
 * asks for them runs; inventing values here would report data the participant
 * never gave. `fields` is what holds generation to that.
 *
 * The value itself comes from the constraint engine rather than a bare faker
 * call, so the codebook's own rules hold: a `maxLength` is respected, and a
 * `unique` name is not issued twice across the whole session. The quick-add
 * variable is also declared a person label whatever it is called — this
 * interface exists to collect a name, and the value it collects is what the
 * node renders as — so a variable named `alias` still draws a real name rather
 * than filler words.
 *
 * Everything else about nominating — roster panels, existing-network panels,
 * and how the stage's count is shared between them — is behaviour this stage
 * has in common with the full name generator, and lives in
 * `simulateNameGeneratorNominations`.
 */
export const simulateNameGeneratorQuickAdd: StageSimulator<QuickAddStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" collects node type "${stage.subject.type}", which the codebook does not define`,
  );

  const quickAddVariable = nodeType.variables?.[stage.quickAdd];

  invariant(
    quickAddVariable?.type === 'text',
    `stage "${stage.id}" quick-adds "${stage.quickAdd}", which is not a text variable on node type "${stage.subject.type}"`,
  );

  const constraints = context.entityConstraints.forScope({
    entity: 'node',
    type: stage.subject.type,
  });
  const generation = generationFor(context);

  const quickAdd = String(stage.quickAdd);
  const asPersonLabel = new Set([quickAdd]);

  simulateNameGeneratorNominations({
    stage,
    context,
    promptBound,
    // `missingProbability` cannot apply here, and the schema is what makes that
    // true rather than this call site: the quick-add field is one of the
    // interface-implied rules `collectInterfaceImpliedRules` collects, so the
    // resolved descriptor for this variable already carries a probability of
    // zero. It said otherwise here for a while and was simply wrong — an
    // authored 0.9 produced nameless nodes, which is a node no participant
    // could have created.
    attributesForNewNode: (index, fixed) =>
      resolveFormValues({
        variables: nodeType.variables,
        fields: new Set(quickAdd in fixed ? [] : [quickAdd]),
        constraints,
        generation,
        scope: { entity: 'node', type: stage.subject.type },
        index,
        ...(Object.keys(fixed).length > 0 ? { existing: { ...fixed } } : {}),
        preferRealisticNameVariables: asPersonLabel,
      }),
  });
};

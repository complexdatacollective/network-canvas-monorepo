import type { Stage } from '@codaco/protocol-validation';

import { nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { binConstraints, binValueFor } from './shared/binValues';
import { assignBinValue } from './shared/binWrites';
import {
  currentStepOf,
  generationFor,
  promptsWorked,
  stageFilterOf,
} from './shared/stageContext';
import type { StageSimulator } from './types';

type CategoricalBinStage = Extract<Stage, { type: 'CategoricalBin' }>;

/**
 * Simulate a participant sorting alters into a categorical variable's bins.
 *
 * A bin drop writes a SINGLE-element array — `[bin.value]` — not a multi-select
 * list: an alter sits in one bin at a time, however many options the variable
 * offers. That is the interface's own write (see CategoricalBin.tsx), and it
 * is why this does not use the multi-select draw a categorical FORM field
 * needs.
 *
 * Where the prompt offers an "other" bin, the pair moves together in BOTH
 * directions: an alter dropped in the other bin gets free text in
 * `otherVariable` with the categorical UNSET, and an alter dropped back into a
 * regular bin gets the category with `otherVariable` UNSET. The pair is how the
 * interface distinguishes "none of these categories" from "not yet sorted", so
 * a node holding both describes a state it cannot produce — which is exactly
 * what leaving the reverse write out would produce for an alter a later prompt
 * moved out of the other bin (plan decision 16).
 *
 * Values are drawn through the constraint engine like every other attribute,
 * with the rules stripped from variables only a bin assigns — see
 * `binConstraints`.
 */
export const simulateCategoricalBin: StageSimulator<CategoricalBinStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" sorts node type "${stage.subject.type}", which the codebook does not define`,
  );

  const { engine, streams } = context;
  const currentStep = currentStepOf(context, stage);
  const scope = { entity: 'node' as const, type: stage.subject.type };
  // The stage's own filter, or nothing when the run ignores filtering.
  const stageFilter = stageFilterOf(context, stage.filter);

  const constraints = binConstraints({
    variables: nodeType.variables,
    stages: context.protocol.stages,
    subjectType: stage.subject.type,
    today: context.today,
    interfaceRules: context.interfaceRules,
  });
  const declared = context.entityConstraints.forScope(scope);
  const generation = generationFor(context);

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    const variable = nodeType.variables?.[prompt.variable];

    invariant(
      variable?.type === 'categorical',
      `stage "${stage.id}" bins by "${prompt.variable}", which is not a categorical variable on node type "${stage.subject.type}"`,
    );

    const otherVariable = prompt.otherVariable
      ? nodeType.variables?.[prompt.otherVariable]
      : undefined;
    const offersOtherBin =
      prompt.otherVariable !== undefined && otherVariable?.type === 'text';

    // Re-derived per prompt, like every sibling multi-prompt simulator: the
    // runtime's selector re-runs on every render, so a filter reading a
    // variable an earlier prompt wrote no longer shows the alters it removed.
    const eligible = nodesForStage(
      engine.draft.network,
      stage.subject.type,
      stageFilter,
    );

    eligible.forEach((node, index) => {
      // The other bin, where the prompt offers one: free text in its own
      // variable, and the categorical left unset.
      //
      // The odds come from the prompt, because a prompt is a question: how
      // well a list of categories covers the people a participant names is a
      // property of that list, and a stage binning by two of them has no
      // single answer to give. The schema resolves the field onto exactly the
      // prompts that set `otherVariable` and refuses it on the rest, so the
      // `otherVariable` test above is also what proves the odds are there —
      // no fallback of our own.
      if (
        offersOtherBin &&
        prompt.otherVariable !== undefined &&
        streams.draw('coins') < prompt.synthetic.otherBinProbability
      ) {
        const other = binValueFor({
          constraints,
          generation,
          scope,
          variableId: prompt.otherVariable,
          index,
          node,
        });
        // A descriptor that leaves the free text unanswered is still an alter
        // IN the other bin: the dialog's field is genuinely optional unless
        // the codebook says otherwise, and a blank submission stores '' with
        // the categorical unset (CategoricalBin.tsx `handleOtherSubmit`, and
        // its otherValidation tests). Abandoning the drop instead would make
        // an authored `otherBinProbability` of 1 produce no other-bin answers
        // at all.
        assignBinValue({
          engine,
          node,
          scope,
          currentStep,
          uniqueRegistry: context.uniqueRegistry,
          constraints: declared,
          set: { [prompt.otherVariable]: other.value ?? '' },
          unset: [prompt.variable],
          ...(other.issued ? { issued: new Set([prompt.otherVariable]) } : {}),
        });
        return;
      }

      const { value, issued } = binValueFor({
        constraints,
        generation,
        scope,
        variableId: prompt.variable,
        index,
        node,
      });
      // Undefined is the alter left in the bucket, which holds no value at all.
      if (value === undefined) return;

      // A categorical value IS a selection: the engine returns an array for
      // every categorical, and this prompt's variable is one (asserted above).
      // Stated as an assertion rather than tested for, because a fallback here
      // could only describe a value the engine has no way to produce.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const selection = value as (string | number | boolean)[];

      // The DESCRIPTOR decides how many values a bin prompt draws, not this
      // simulator: the `maxSelected: 1` this interface imposes is resolved into
      // the variable's effective rules, so the engine has already drawn at most
      // one. Asserted rather than truncated. Truncating enforces the rule a
      // second time, in a second place free to disagree with the first — and it
      // would turn a resolution that had stopped applying into a
      // plausible-looking bin assignment rather than a failure, which is the
      // silent-override shape this whole area exists to remove.
      invariant(
        selection.length <= 1,
        `stage "${stage.id}" drew ${selection.length} values for "${prompt.variable}", but a bin drop places an alter in exactly one bin`,
      );

      // An empty selection is the alter never dropped into a bin, which an
      // author's own `selectionCount` of 0 still draws.
      if (selection.length === 0) return;

      assignBinValue({
        engine,
        node,
        scope,
        currentStep,
        uniqueRegistry: context.uniqueRegistry,
        constraints: declared,
        set: { [prompt.variable]: selection },
        // Decision 16: a regular bin drop is also how the interface takes an
        // alter back OUT of the other bin, and it clears the free text on the
        // way.
        unset:
          offersOtherBin && prompt.otherVariable ? [prompt.otherVariable] : [],
        ...(issued ? { issued: new Set([prompt.variable]) } : {}),
      });
    });
  });
};

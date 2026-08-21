import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  claimFixedValues,
  releaseRosterValues,
} from '../constraints/reservations';
import { nominateFromRoster } from '../utils/panels';
import { countUniform, sampleCount } from '../utils/sampleCount';
import {
  promptAttributes,
  shareForPrompt,
} from './shared/nameGeneratorNominations';
import { currentStepOf, promptsWorked } from './shared/stageContext';
import type { StageSimulator } from './types';

type NameGeneratorRosterStage = Extract<Stage, { type: 'NameGeneratorRoster' }>;

/**
 * Simulate a participant nominating people from a roster.
 *
 * The interface shows a list the researcher supplied and the participant drags
 * rows out of it, so this stage cannot invent anybody: everything it adds is a
 * row that was on the list. That is the whole difference from the other two
 * name generators, and it is why an unresolved roster produces an empty stage
 * rather than fabricated people. A pool too small for the stage's
 * `behaviours.minNodes` is a protocol that would strand a real participant on
 * this screen, and is refused before the seed is consulted by the pre-walk
 * feasibility gate — never here, where a refusal would be seed-dependent
 * (spec rule 5, decision 18).
 *
 * Rows are reached UNIFORMLY rather than in list order, which is what
 * separates this from a name generator's roster panel. There the roster sits
 * beside a text field and gets worked down; here the roster is the whole
 * interface — searchable, sortable, displayed in whatever order the
 * participant asked for — so nothing privileges the rows the file happens to
 * list first. Which rows they pick has no observable structure worth imitating
 * beyond that: the count distribution is the whole model, and attribute-biased
 * selection is deliberately excluded (spec, roster nomination).
 *
 * A drawn row arrives whole: its own `_uid`, which is what lets the interface
 * stop offering that person once they are in the network, and its own columns
 * verbatim — including ones the codebook never declared, which the runtime
 * admits through `allowUnknownAttributes`. Nothing is drawn for them, because
 * nothing was asked: the roster already answered.
 *
 * The prompt's `additionalAttributes` are written underneath rather than over
 * the row, which is the order the runtime's own `handleAddNode` uses. Where a
 * roster column and a prompt name the same variable, the roster is the
 * researcher's own data about that person and the prompt is a fact about the
 * question — and the interface hands the participant the former.
 */
export const simulateNameGeneratorRoster: StageSimulator<
  NameGeneratorRosterStage
> = (stage, context, promptBound) => {
  const { engine, streams, assetData } = context;
  const currentStep = currentStepOf(context, stage);
  const scope = { entity: 'node' as const, type: stage.subject.type };
  const handles = {
    entityConstraints: context.entityConstraints,
    uniqueRegistry: context.uniqueRegistry,
  };

  // How many people this stage elicits, before the roster gets a say. A pool
  // with fewer rows than that supplies fewer people; it never makes any up.
  const budget = sampleCount(stage.synthetic.count, countUniform(streams));
  const promptCount = stage.prompts.length;

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    // The stage is entered at its first prompt, so only moving ON is a
    // navigation the interview would dispatch.
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    const shared = promptAttributes(prompt);

    nominateFromRoster({
      stageId: stage.id,
      assetData,
      network: engine.draft.network,
      wanted: shareForPrompt(budget, promptCount, promptIndex),
      chooseIndex: (remaining) => streams.int('coins', 0, remaining.length - 1),
      nominate: (row) => {
        const fixed: Record<string, VariableValue> = {
          ...shared,
          ...row[entityAttributesProperty],
        };
        // Taken VERBATIM, `unique` collisions included: the runtime's roster
        // add path validates no values (dedupe is by _uid alone), so a
        // researcher-supplied duplicate is a row the participant can add and
        // the session must be able to hold. Skipping it instead would leave
        // the completed stage below its own min-nodes gate — a state no real
        // interview can end in.
        engine.addNode({
          nodeType: stage.subject.type,
          uid: row[entityPrimaryKeyProperty],
          attributeData: fixed,
          allowUnknownAttributes: true,
          currentStep,
        });
        // Nothing issued these values, so nothing gives them back — but they
        // are in the network now, and a later draw handed one would be the
        // duplicate `unique` forbids. Claimed as WRITTEN, prompt values
        // included: where a roster column beat the prompt to a key, nothing
        // holds the prompt's value and claiming it would strand a value
        // nobody is using.
        claimFixedValues(handles, scope, fixed);
        return true;
      },
    });
  });

  // The stage has had its chance to draw, so the rows it never reached are
  // people nobody is waiting for.
  releaseRosterValues(handles, stage, assetData);
};

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  claimFixedValues,
  releaseRosterValues,
} from '../../constraints/reservations';
import {
  nominateFromRoster,
  nominationsFromExistingPanels,
  splitNominationBudget,
} from '../../utils/panels';
import { countUniform, sampleCount } from '../../utils/sampleCount';
import type { SimulationContext } from '../types';
import { currentStepOf, promptsWorked } from './stageContext';

type NameGeneratorStage = Extract<
  Stage,
  { type: 'NameGenerator' | 'NameGeneratorQuickAdd' }
>;

/** Any stage whose prompts elicit people, roster-only ones included. */
type NominatingStage = Extract<
  Stage,
  {
    type: 'NameGenerator' | 'NameGeneratorQuickAdd' | 'NameGeneratorRoster';
  }
>;

/**
 * One prompt's share of `total`, split across `prompts` prompts in prompt
 * order, as evenly as the total allows, with the remainder falling to the
 * earliest prompts.
 *
 * This is plan decision 15 in one line: `floor(total / prompts)` is at least
 * one whenever the total reaches the prompt count, so every prompt nominates
 * somebody the moment the count allows it, and below that the remainder walks
 * the earliest prompts — a participant asked three questions and naming one
 * person answers the first.
 *
 * Answered per prompt rather than built as an array the caller indexes: the
 * caller is already walking the prompts, and an array read by position needs a
 * fallback for a lookup that cannot miss — a branch describing nothing.
 */
export const shareForPrompt = (
  total: number,
  prompts: number,
  index: number,
): number => Math.floor(total / prompts) + (index < total % prompts ? 1 : 0);

/**
 * The attributes the interview writes onto a node when a prompt elicits it,
 * independent of how the node arrived.
 */
export const promptAttributes = (
  prompt: NominatingStage['prompts'][number],
): Record<string, boolean> =>
  Object.fromEntries(
    (prompt.additionalAttributes ?? []).map(({ variable, value }) => [
      String(variable),
      value,
    ]),
  );

/**
 * Simulate a participant working through a name generator's prompts and
 * panels, in the order the interface offers them.
 *
 * Shared by NameGenerator and NameGeneratorQuickAdd, which differ only in what
 * a NEWLY named person is asked for — a form, or a single quick-add field —
 * supplied here as `attributesForNewNode`. Everything else about nominating is
 * the same interface behaviour, and reproducing it twice would let the two
 * drift.
 *
 * Each prompt draws from three places, mirroring what a participant can do:
 *
 * 1. People taken from a ROSTER panel, which the interface hides once they are
 *    in the network. Their roster row supplies their attributes, and they keep
 *    the roster's own `_uid` — which is what makes that hiding work.
 * 2. People the participant TYPES IN, fabricated here.
 * 3. People already in the network that an EXISTING-network panel offers back,
 *    who are added to this prompt rather than created again.
 *
 * The first two share the stage's count between them; the third is not drawn
 * from that budget, because re-nominating someone already named is a decision
 * the panel invites per person rather than an act of naming a new one.
 *
 * Every write goes through the engine, and the engine stamps a node's
 * `promptIDs` from ITS OWN prompt index — which is why the walk through the
 * prompts moves that index rather than passing a prompt id around. That is
 * also what the interview does, and a captured trace needs those moves to
 * replay.
 */
export const simulateNameGeneratorNominations = ({
  stage,
  context,
  promptBound,
  attributesForNewNode,
}: {
  stage: NameGeneratorStage;
  context: SimulationContext;
  promptBound: number | undefined;
  /**
   * The attributes a person the participant TYPES IN carries away, given how
   * many this stage has already produced and the values the prompt has already
   * settled for them. The index feeds the constraint engine's per-entity
   * sequencing, which is what lets it hand out distinct values for a `unique`
   * variable; the fixed values are handed over rather than overwritten
   * afterwards, so a rule spanning a fixed and a drawn field is satisfied on
   * the finished node.
   */
  attributesForNewNode: (
    index: number,
    fixed: Readonly<Record<string, VariableValue>>,
  ) => Record<string, VariableValue>;
}): void => {
  const { engine, streams, assetData } = context;
  const currentStep = currentStepOf(context, stage);
  const scope = { entity: 'node' as const, type: stage.subject.type };
  const handles = {
    entityConstraints: context.entityConstraints,
    uniqueRegistry: context.uniqueRegistry,
  };

  // How many people this stage elicits. Re-nominations are not counted: they
  // are already in the network and do not spend the stage's budget.
  const budget = sampleCount(stage.synthetic.count, countUniform(streams));

  // Split the budget between people taken from the roster and people typed in.
  const { fromRoster } = splitNominationBudget(
    budget,
    stage,
    assetData,
    engine.draft.network,
    streams,
  );

  // Counts every person this stage fabricates, across prompts, so the
  // constraint engine sees a distinct index per entity.
  let created = 0;
  const promptCount = stage.prompts.length;

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    // The stage is entered at its first prompt — a fresh session and every
    // `transitionStage` leave the index at zero — so only moving ON is a
    // navigation the interview would dispatch.
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    const shared = promptAttributes(prompt);
    const hasShared = Object.keys(shared).length > 0;
    // Decision 15 governs the prompt's WHOLE share; the roster's own even
    // split decides how much of that share the roster supplies, and the rest
    // is typed in. Splitting roster and typed-in people independently would
    // leave a prompt with nothing to do while the stage's count comfortably
    // covered every prompt.
    const share = shareForPrompt(budget, promptCount, promptIndex);
    const rosterHere = shareForPrompt(fromRoster, promptCount, promptIndex);

    // Roster first: the panel is worked down in the order it lists people,
    // and the list is what the participant can still see — everyone already
    // in the network is gone from it.
    const fromRosterHere = nominateFromRoster({
      stageId: stage.id,
      assetData,
      network: engine.draft.network,
      wanted: rosterHere,
      chooseIndex: () => 0,
      nominate: (row) => {
        const fixed: Record<string, VariableValue> = {
          ...row[entityAttributesProperty],
          ...shared,
        };
        // Taken VERBATIM, `unique` collisions included — the runtime's
        // roster add path validates no values, so a duplicate row is one the
        // participant can add and the session must hold (see
        // NameGeneratorRoster.ts for the full reasoning).
        engine.addNode({
          nodeType: stage.subject.type,
          // A roster row keeps its own id, which is what lets the interface
          // stop offering it once the person is in the network.
          uid: row[entityPrimaryKeyProperty],
          attributeData: fixed,
          // A roster carries whatever columns the researcher gave it,
          // including ones the codebook does not declare; the runtime admits
          // them through the same flag.
          allowUnknownAttributes: true,
          currentStep,
        });
        // Nothing issued these values, so nothing gives them back — but they
        // are in the network now, and a later draw handed one would be the
        // duplicate `unique` forbids.
        claimFixedValues(handles, scope, fixed);
        return true;
      },
    });

    // A row passed over for a value the network already holds leaves the
    // stage's count to be met by somebody the participant types in, exactly as
    // the G2 engine fell back to fabrication.
    const newHere = share - fromRosterHere;

    for (let index = 0; index < newHere; index += 1) {
      const entityIndex = created;
      created += 1;
      engine.addNode({
        nodeType: stage.subject.type,
        uid: streams.uuid(),
        attributeData: {
          ...attributesForNewNode(entityIndex, shared),
          ...shared,
        },
        currentStep,
      });
      if (hasShared) claimFixedValues(handles, scope, shared);
    }

    // Nodes added from the existing network.
    for (const node of nominationsFromExistingPanels(
      stage,
      engine.draft.network,
      prompt.id,
      streams,
    )) {
      engine.addNodeToPrompt({
        nodeId: node[entityPrimaryKeyProperty],
        promptAttributes: shared,
        currentStep,
      });
      if (hasShared) claimFixedValues(handles, scope, shared);
    }
  });

  // The stage has had its chance to draw, so the rows it never reached are
  // people nobody is waiting for.
  releaseRosterValues(handles, stage, assetData);
};

export type { NameGeneratorStage, NcNode };

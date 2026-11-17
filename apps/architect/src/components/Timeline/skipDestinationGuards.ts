import { defineMessages, createMessageError } from '@codaco/app-i18n/messages';
import type { SkipLogicDestination, Stage } from '@codaco/protocol-validation';
import {
  getInvalidSkipDestinationReferences,
  getSkipDestinationDependentStages,
} from '~/ducks/modules/protocol/stages';
const utilityMessages = defineMessages({
  unknownStage: {
    id: 'architect.utility.timeline.skipDestinationGuards.unknownStage',
    defaultMessage: 'Unknown stage ({value1})',
    description:
      "Reference to a stage inside a skip-logic warning when that stage cannot be found in the timeline. value1 is the stage's internal identifier.",
  },
  stage: {
    id: 'architect.utility.timeline.skipDestinationGuards.stage',
    defaultMessage: 'Stage {value1, number} — {value2}',
    description:
      "Reference to a stage inside a skip-logic warning, for example Stage 3 followed by a dash and its title. value1 is the stage's number in the timeline; value2 is its title.",
  },
  cannotDeleteStage: {
    id: 'architect.utility.timeline.skipDestinationGuards.cannotDeleteStage',
    defaultMessage: 'Cannot delete stage',
    description:
      "Title of the warning dialog shown when the researcher tries to delete a stage that other stages' skip logic jumps to.",
  },
  isTheSkipDestinationFor: {
    id: 'architect.utility.timeline.skipDestinationGuards.isTheSkipDestinationFor',
    defaultMessage:
      '{destinationReference} is the skip destination for {dependentReferences}. Choose a different destination on those stages before deleting it.',
    description:
      'Body of the Cannot delete stage dialog. destinationReference is the stage to be deleted; dependentReferences is the list of stages whose skip logic jumps to it, which must be pointed elsewhere first.',
  },
  cannotMoveStage: {
    id: 'architect.utility.timeline.skipDestinationGuards.cannotMoveStage',
    defaultMessage: 'Cannot move stage',
    description:
      'Title of the warning dialog shown when dragging a stage to a new position on the timeline would put it before a stage that skips to it.',
  },
  mustRemainLaterThan: {
    id: 'architect.utility.timeline.skipDestinationGuards.mustRemainLaterThan',
    defaultMessage:
      '{destinationReference} must remain later than {sourceReference}, which routes to it when skipped. Choose a different destination before changing this order.',
    description:
      'Body of the Cannot move stage dialog. destinationReference is the stage that skip logic jumps to; sourceReference is the stage whose skip logic jumps to it, so the destination must stay later.',
  },
});
const finalMessages = defineMessages({
  untitledStage: {
    id: 'architect.final.components.Timeline.skipDestinationGuards.untitledStage',
    defaultMessage: 'Untitled stage',
    description:
      'Name used for a stage with no title when it is mentioned in a skip-logic warning.',
  },
});

// `label` is the display text, already resolved from the stage's localized
// label (see `getStageList`).
type TimelineStage = Pick<Stage, 'id' | 'type'> & {
  label: string;
  skipLogic?: {
    destination?: SkipLogicDestination;
  };
};

type TimelineWarning = {
  title: string;
  description: string;
};

const formatStageReference = <T extends TimelineStage>(
  stages: T[],
  stage: Pick<T, 'id' | 'label'>,
) => {
  const stageIndex = stages.findIndex((candidate) => candidate.id === stage.id);

  if (stageIndex === -1) {
    return {
      messageError: createMessageError(utilityMessages.unknownStage, {
        value1: stage.id,
      }),
    };
  }

  return {
    messageError: createMessageError(utilityMessages.stage, {
      value1: stageIndex + 1,
      value2: stage.label || {
        messageError: createMessageError(finalMessages.untitledStage),
      },
    }),
  };
};

export const getSkipDestinationDeleteWarning = (
  stages: TimelineStage[],
  stageId: string,
): TimelineWarning | null => {
  const destinationStage = stages.find((stage) => stage.id === stageId);
  const dependentStages = getSkipDestinationDependentStages(stages, stageId);

  if (!destinationStage || dependentStages.length === 0) {
    return null;
  }

  const destinationReference = formatStageReference(stages, destinationStage);
  const dependentReferences = {
    list: dependentStages.map((stage) => formatStageReference(stages, stage)),
  };

  return {
    title: createMessageError(utilityMessages.cannotDeleteStage),
    description: createMessageError(utilityMessages.isTheSkipDestinationFor, {
      destinationReference: destinationReference,
      dependentReferences: dependentReferences,
    }),
  };
};

type ReorderGuard<T extends TimelineStage> =
  | { allowed: true }
  | {
      allowed: false;
      restoredStages: T[];
      warning: TimelineWarning;
    };

export const getSkipDestinationReorderGuard = <T extends TimelineStage>(
  committedStages: T[],
  proposedStages: T[],
): ReorderGuard<T> => {
  const [violation] = getInvalidSkipDestinationReferences(proposedStages);

  if (!violation) {
    return { allowed: true };
  }

  const sourceReference = formatStageReference(
    committedStages,
    violation.sourceStage,
  );
  const destinationReference = violation.destinationStage
    ? formatStageReference(committedStages, violation.destinationStage)
    : {
        messageError: createMessageError(utilityMessages.unknownStage, {
          value1: violation.destinationStageId,
        }),
      };

  return {
    allowed: false,
    restoredStages: committedStages,
    warning: {
      title: createMessageError(utilityMessages.cannotMoveStage),
      description: createMessageError(utilityMessages.mustRemainLaterThan, {
        destinationReference: destinationReference,
        sourceReference: sourceReference,
      }),
    },
  };
};

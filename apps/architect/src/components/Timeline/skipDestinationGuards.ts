import { defineMessages, createMessageError } from '@codaco/app-i18n/messages';
import type { SkipLogicDestination, Stage } from '@codaco/protocol-validation';
import {
  getInvalidPedigreeSourceReferences,
  getInvalidSkipDestinationReferences,
  getSkipDestinationDependentStages,
} from '~/ducks/modules/protocol/stages';
const utilityMessages = defineMessages({
  unknownStage: {
    id: 'architect.utility.timeline.skipDestinationGuards.unknownStage',
    defaultMessage: 'Unknown stage ({value1})',
    description:
      'Researcher-facing explanatory text in components / Timeline / skipDestinationGuards.',
  },
  stage: {
    id: 'architect.utility.timeline.skipDestinationGuards.stage',
    defaultMessage: 'Stage {value1, number} — {value2}',
    description:
      'Researcher-facing explanatory text in components / Timeline / skipDestinationGuards.',
  },
  cannotDeleteStage: {
    id: 'architect.utility.timeline.skipDestinationGuards.cannotDeleteStage',
    defaultMessage: 'Cannot delete stage',
    description:
      'The title text in components / Timeline / skipDestinationGuards.',
  },
  isTheSkipDestinationFor: {
    id: 'architect.utility.timeline.skipDestinationGuards.isTheSkipDestinationFor',
    defaultMessage:
      '{destinationReference} is the skip destination for {dependentReferences}. Choose a different destination on those stages before deleting it.',
    description:
      'The description text in components / Timeline / skipDestinationGuards.',
  },
  cannotMoveStage: {
    id: 'architect.utility.timeline.skipDestinationGuards.cannotMoveStage',
    defaultMessage: 'Cannot move stage',
    description:
      'The title text in components / Timeline / skipDestinationGuards.',
  },
  mustRemainLaterThan: {
    id: 'architect.utility.timeline.skipDestinationGuards.mustRemainLaterThan',
    defaultMessage:
      '{destinationReference} must remain later than {sourceReference}, which routes to it when skipped. Choose a different destination before changing this order.',
    description:
      'The description text in components / Timeline / skipDestinationGuards.',
  },
  mustRemainEarlierThan: {
    id: 'architect.utility.timeline.skipDestinationGuards.mustRemainEarlierThan',
    defaultMessage:
      '{sourceReference} must remain earlier than {readingReference}, which shows the family it collects. Choose a different source stage before changing this order.',
    description:
      'The description text in components / Timeline / skipDestinationGuards. sourceReference is a Family Pedigree stage; readingReference is the Narrative Pedigree stage that draws the family tree collected by it.',
  },
});
const finalMessages = defineMessages({
  untitledStage: {
    id: 'architect.final.components.Timeline.skipDestinationGuards.untitledStage',
    defaultMessage: 'Untitled stage',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

type TimelineStage = Pick<Stage, 'id' | 'label' | 'type'> & {
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

export const getSkipDestinationDeleteWarning = <T extends TimelineStage>(
  stages: T[],
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

// The `stages` a Timeline holds are pruned of stage-type fields, so the caller
// resolves each NarrativePedigree's source from the full protocol.
export const getPedigreeSourceReorderGuard = <T extends TimelineStage>(
  committedStages: T[],
  proposedStages: T[],
  getSourceStageId: (stageId: string) => string | undefined,
): ReorderGuard<T> => {
  const [violation] = getInvalidPedigreeSourceReferences(
    proposedStages.map((stage) => ({
      id: stage.id,
      label: stage.label,
      type: stage.type,
      sourceStageId: getSourceStageId(stage.id),
    })),
  );

  if (!violation) {
    return { allowed: true };
  }

  return {
    allowed: false,
    restoredStages: committedStages,
    warning: {
      title: createMessageError(utilityMessages.cannotMoveStage),
      description: createMessageError(utilityMessages.mustRemainEarlierThan, {
        sourceReference: formatStageReference(
          committedStages,
          violation.sourceStage,
        ),
        readingReference: formatStageReference(
          committedStages,
          violation.readingStage,
        ),
      }),
    },
  };
};

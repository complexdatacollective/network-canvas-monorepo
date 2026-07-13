import type { SkipLogicDestination, Stage } from '@codaco/protocol-validation';
import {
  getInvalidSkipDestinationReferences,
  getSkipDestinationDependentStages,
} from '~/ducks/modules/protocol/stages';

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
    return `Unknown stage (${stage.id})`;
  }

  return `Stage ${stageIndex + 1} — ${stage.label || 'Untitled stage'}`;
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
  const dependentReferences = dependentStages
    .map((stage) => formatStageReference(stages, stage))
    .join(', ');

  return {
    title: 'Cannot delete stage',
    description: `${destinationReference} is the skip destination for ${dependentReferences}. Choose a different destination on those stages before deleting it.`,
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
    : `Unknown stage (${violation.destinationStageId})`;

  return {
    allowed: false,
    restoredStages: committedStages,
    warning: {
      title: 'Cannot move stage',
      description: `${destinationReference} must remain later than ${sourceReference}, which routes to it when skipped. Choose a different destination before changing this order.`,
    },
  };
};

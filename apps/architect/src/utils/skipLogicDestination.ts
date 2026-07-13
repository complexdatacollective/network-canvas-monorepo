import type { SkipLogicDestination } from '@codaco/protocol-validation';

type StageReference = {
  id: string;
  label: string;
};

export const getSkipLogicDestinationLabel = (
  stages: StageReference[],
  destination?: SkipLogicDestination,
) => {
  if (!destination) {
    return 'Next available stage';
  }

  if (destination.type === 'finish') {
    return 'End interview';
  }

  const targetIndex = stages.findIndex(
    (stage) => stage.id === destination.stageId,
  );
  const target = stages[targetIndex];

  if (!target) {
    return 'Unknown stage';
  }

  return `Stage ${targetIndex + 1} — ${target.label || 'Untitled stage'}`;
};

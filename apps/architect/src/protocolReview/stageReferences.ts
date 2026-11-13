import type { CurrentProtocol } from '@codaco/protocol-validation';

const STAGE_REFERENCE = /(\p{L}+\s+)?(?<![\p{L}\p{N}])(\d+)(\s·\s)/gu;

export const currentStageReferences = (
  text: string,
  reviewedStageIds: readonly string[] | undefined,
  protocol: CurrentProtocol,
): string => {
  if (!reviewedStageIds) return text;
  return text.replace(
    STAGE_REFERENCE,
    (match, word: string | undefined, number: string, separator: string) => {
      const stageId = reviewedStageIds[Number(number) - 1];
      if (stageId === undefined) return match;
      const index = protocol.stages.findIndex((stage) => stage.id === stageId);
      if (index === -1) return '';
      return `${word ?? ''}${index + 1}${separator}`;
    },
  );
};

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  findTimelineStructureProblems,
  type Stage,
} from '@codaco/protocol-validation';
import { isLastFinishStage } from '~/ducks/modules/protocol/stages';

const messages = defineMessages({
  cannotDeleteStage: {
    id: 'architect.timeline.finishStageGuards.cannotDeleteStage',
    defaultMessage: 'Cannot delete stage',
    description:
      'Title of the notice shown when a researcher tries to delete the stage that ends the interview.',
  },
  finishStageCannotBeDeleted: {
    id: 'architect.timeline.finishStageGuards.finishStageCannotBeDeleted',
    defaultMessage:
      'This stage ends the interview, and every protocol needs one, so it cannot be deleted. You can change its text and outcome instead.',
    description:
      'Explanation shown when a researcher tries to delete the stage that ends the interview (the finish screen).',
  },
  cannotMoveStage: {
    id: 'architect.timeline.finishStageGuards.cannotMoveStage',
    defaultMessage: 'Cannot move stage',
    description:
      'Title of the notice shown when a move would put a stage after a stage that ends the interview.',
  },
  finishStagesStayLast: {
    id: 'architect.timeline.finishStageGuards.finishStagesStayLast',
    defaultMessage:
      'Stages that end the interview have to stay together at the end of the protocol. No participant could reach a stage placed after them.',
    description:
      'Explanation shown when a researcher tries to move a stage that ends the interview above another kind of stage, or to move another kind of stage below one. Stages that end the interview can still change places with each other.',
  },
});

type TimelineStage = Pick<Stage, 'id' | 'type'>;

type TimelineWarning = {
  title: string;
  description: string;
};

/** Why the stage that ends the interview cannot be deleted, when it cannot. */
export const getFinishStageDeleteWarning = (
  stages: readonly TimelineStage[],
  stageId: string,
): TimelineWarning | null =>
  isLastFinishStage(stages, stageId)
    ? {
        title: createMessageError(messages.cannotDeleteStage),
        description: createMessageError(messages.finishStageCannotBeDeleted),
      }
    : null;

/**
 * Why a proposed order is refused, when it would leave a stage after the first
 * stage that ends the interview, or have the interview end anywhere else.
 * Stages that end the interview may change places among themselves. An order
 * is only refused for problems it adds.
 */
export const getFinishStageReorderWarning = (
  committedStages: readonly TimelineStage[],
  proposedStages: readonly TimelineStage[],
): TimelineWarning | null =>
  findTimelineStructureProblems(proposedStages).length >
  findTimelineStructureProblems(committedStages).length
    ? {
        title: createMessageError(messages.cannotMoveStage),
        description: createMessageError(messages.finishStagesStayLast),
      }
    : null;

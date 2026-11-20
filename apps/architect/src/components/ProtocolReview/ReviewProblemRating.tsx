import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { type ReactNode, useId } from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import { useAppDispatch } from '~/ducks/hooks';
import {
  type DecisionRefusal,
  rateFinding,
  type ReviewFindingView,
} from '~/ducks/modules/protocolReview';
import {
  FEEDBACK_RATINGS,
  FEEDBACK_REASONS,
  type FeedbackRating,
  type FeedbackReason,
} from '~/protocolReview/reviewFeedback';

const messages = defineMessages({
  ratingQuestion: {
    id: 'architect.protocolReview.problem.ratingQuestion',
    defaultMessage: 'Was this useful?',
    description:
      'Question under a problem found by the automated protocol review, asking whether being told about the problem was useful. Two icon buttons, a thumbs up named Useful and a thumbs down named Not useful, answer it.',
  },
  ratingUseful: {
    id: 'architect.protocolReview.problem.ratingUseful',
    defaultMessage: 'Useful',
    description:
      'Name and tooltip of the thumbs-up icon button that rates a problem found by the automated protocol review as useful. Pressing it again takes the rating back.',
  },
  ratingNotUseful: {
    id: 'architect.protocolReview.problem.ratingNotUseful',
    defaultMessage: 'Not useful',
    description:
      'Name and tooltip of the thumbs-down icon button that rates a problem found by the automated protocol review as not useful. Pressing it again takes the rating back.',
  },
  ratingReason: {
    id: 'architect.protocolReview.problem.ratingReason',
    defaultMessage: 'Why not? (optional)',
    description:
      'Label of the choices shown after the researcher rates a problem as not useful, asking why it was not useful. Answering is optional.',
  },
  reasonWrong: {
    id: 'architect.protocolReview.problem.reasonWrong',
    defaultMessage: 'It is wrong about my protocol',
    description:
      'A reason a problem found by the automated protocol review was not useful: what it says about the protocol is not true.',
  },
  reasonNotRelevant: {
    id: 'architect.protocolReview.problem.reasonNotRelevant',
    defaultMessage: 'It does not matter for my study',
    description:
      'A reason a problem found by the automated protocol review was not useful: it may be true, but it is not relevant to this study.',
  },
  reasonFixWouldNotWork: {
    id: 'architect.protocolReview.problem.reasonFixWouldNotWork',
    defaultMessage: 'The suggested fix would not work',
    description:
      'A reason a problem found by the automated protocol review was not useful: the problem may be real, but the fix suggested for it would not solve it.',
  },
});

const ratingControls: Record<
  FeedbackRating,
  { name: MessageDescriptor; icon: ReactNode; announcement: string }
> = {
  useful: {
    name: messages.ratingUseful,
    icon: <ThumbsUp aria-hidden />,
    announcement: 'Rated useful.',
  },
  not_useful: {
    name: messages.ratingNotUseful,
    icon: <ThumbsDown aria-hidden />,
    announcement: 'Rated not useful.',
  },
};

const reasonMessages: Record<FeedbackReason, MessageDescriptor> = {
  wrong: messages.reasonWrong,
  not_relevant: messages.reasonNotRelevant,
  fix_would_not_work: messages.reasonFixWouldNotWork,
};

type ReviewProblemRatingProps = {
  finding: Pick<ReviewFindingView, 'id' | 'rating' | 'ratingReason'>;
  /** Told why a rating was refused, and null as the next one is tried. */
  onRefusal: (reason: DecisionRefusal | null) => void;
  announce: (message: string) => void;
};

/**
 * Asks whether a problem was useful to be told about, and why not when it
 * was not. Pressing the rating a problem already has takes it back.
 */
const ReviewProblemRating = ({
  finding,
  onRefusal,
  announce,
}: ReviewProblemRatingProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const ratingId = useId();
  const reasonId = useId();

  const save = async (
    rating: FeedbackRating | null,
    reason: FeedbackReason | null,
    announcement: string,
  ) => {
    onRefusal(null);
    const result = await dispatch(rateFinding(finding.id, rating, reason));
    if (!result.ok) {
      onRefusal(result.reason);
      return;
    }
    announce(announcement);
  };

  const toggle = (rating: FeedbackRating) =>
    finding.rating === rating
      ? save(null, null, 'Rating removed.')
      : save(rating, null, ratingControls[rating].announcement);

  return (
    <section className="flex flex-col gap-3">
      <div
        role="group"
        aria-labelledby={ratingId}
        className="flex flex-wrap items-center gap-2"
      >
        <span id={ratingId} className="me-1">
          {intl.formatMessage(messages.ratingQuestion)}
        </span>
        {FEEDBACK_RATINGS.map((rating) => {
          const control = ratingControls[rating];
          return (
            <Tooltip key={rating}>
              <TooltipTrigger
                render={
                  <IconButton
                    size="sm"
                    aria-label={intl.formatMessage(control.name)}
                    aria-pressed={finding.rating === rating}
                    icon={control.icon}
                    onClick={() => void toggle(rating)}
                  />
                }
              />
              <TooltipContent side="bottom">
                {intl.formatMessage(control.name)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {finding.rating === 'not_useful' && (
        <div className="flex flex-col gap-2">
          <span id={reasonId}>{intl.formatMessage(messages.ratingReason)}</span>
          <RadioGroupField
            size="sm"
            aria-labelledby={reasonId}
            options={FEEDBACK_REASONS.map((reason) => ({
              value: reason,
              label: intl.formatMessage(reasonMessages[reason]),
            }))}
            value={finding.ratingReason ?? ''}
            onChange={(value) => {
              const reason = FEEDBACK_REASONS.find(
                (candidate) => candidate === value,
              );
              if (reason) {
                void save(
                  'not_useful',
                  reason,
                  ratingControls.not_useful.announcement,
                );
              }
            }}
          />
        </div>
      )}
    </section>
  );
};

export default ReviewProblemRating;

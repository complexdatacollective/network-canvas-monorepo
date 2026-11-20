import {
  FINDING_SEVERITIES,
  type Finding,
  type FindingCategory,
  type FindingSeverity,
  type ReviewErrorCode,
  type ReviewProvider,
} from '@codaco/protocol-review-worker/contract';
import { posthog } from '~/analytics';

import type {
  FeedbackRating,
  FeedbackReason,
  FindingFeedback,
} from './reviewFeedback';
import type { FindingDecision } from './reviewStore';

/**
 * The protocol review's analytics events. Each payload is built here from
 * fixed codes, numbers and booleans only: nothing from the protocol, the
 * findings' text or the study details, and no ids, may be sent. The types
 * below are what make that so; keep every property one of them. The feedback
 * surveys at the end are the one exception, and say what they carry.
 */

type CompletedPayload = {
  finding_count: number;
  serious_count: number;
  worth_fixing_count: number;
  suggestion_count: number;
  duration_ms: number;
};

export const completedPayload = (
  findings: readonly Pick<Finding, 'severity'>[],
  durationMs: number,
): CompletedPayload => {
  const count = (severity: FindingSeverity) =>
    findings.filter((finding) => finding.severity === severity).length;
  const [serious, worthFixing, suggestion] = FINDING_SEVERITIES.map(count);
  return {
    finding_count: findings.length,
    serious_count: serious ?? 0,
    worth_fixing_count: worthFixing ?? 0,
    suggestion_count: suggestion ?? 0,
    duration_ms: Math.max(0, Math.round(durationMs)),
  };
};

type DecisionPayload = {
  decision: FindingDecision;
  severity: FindingSeverity;
  category: FindingCategory;
};

export const decisionPayload = (
  decision: FindingDecision,
  finding: Pick<Finding, 'severity' | 'category'>,
): DecisionPayload => ({
  decision,
  severity: finding.severity,
  category: finding.category,
});

type StartedPayload = { share: boolean; provider: ReviewProvider };

export const captureReviewStarted = (payload: StartedPayload) => {
  posthog.capture('protocol_review_started', payload);
};

export const captureReviewCompleted = (
  payload: CompletedPayload,
  provider: ReviewProvider,
) => {
  posthog.capture('protocol_review_completed', { ...payload, provider });
};

export const captureReviewFailed = (
  code: ReviewErrorCode,
  provider: ReviewProvider,
) => {
  posthog.capture('protocol_review_failed', { error_code: code, provider });
};

export const captureReviewDecision = (payload: DecisionPayload) => {
  posthog.capture('protocol_review_decision', payload);
};

/**
 * Feedback goes to two PostHog surveys of type API, which Architect answers
 * with its own controls. Unlike the events above, these carry the review's id
 * (only for a review that was shared, so it matches the copy the service
 * keeps), each problem's id within it, and whatever the researcher writes;
 * never the review's own text. The ids are the surveys' and
 * their questions' in PostHog; each answer is sent as the English choice text
 * the survey holds, so the two must change together.
 */
const PROBLEM_SURVEY = {
  id: '01a1f560-e7a6-0000-197a-8a38fee548d1',
  ratingQuestion: '666eab72-38ca-41d0-96f1-e8a5160624c7',
  reasonQuestion: '14e70b7d-7f2f-42b0-a4da-d51a2617fca6',
};

const REVIEW_SURVEY = {
  id: '01a1f560-e8cb-0000-f278-9ef6ad9f3bb7',
  commentQuestion: 'd1404b0d-14be-4a2f-befe-577bd0afedee',
};

const RATING_CHOICES: Record<FeedbackRating, string> = {
  useful: 'Useful',
  not_useful: 'Not useful',
};

const REASON_CHOICES: Record<FeedbackReason, string> = {
  wrong: 'It is wrong about my protocol',
  not_relevant: 'It does not matter for my study',
  fix_would_not_work: 'The suggested fix would not work',
};

type FindingFeedbackPayload = {
  reviewId: string;
  shared: boolean;
  provider: ReviewProvider | undefined;
  finding: Pick<Finding, 'id' | 'severity' | 'category'>;
  feedback: FindingFeedback;
};

/**
 * One problem of a review: what became of it, and the rating when there is
 * one. Sent again under the same submission whenever it changes, so
 * PostHog holds one response per problem; one without a rating is an
 * incomplete response.
 */
export const captureFindingFeedback = ({
  reviewId,
  shared,
  provider,
  finding,
  feedback,
}: FindingFeedbackPayload) => {
  const { rating, reason } = feedback;
  posthog.capture('survey sent', {
    $survey_id: PROBLEM_SURVEY.id,
    $survey_submission_id: `${reviewId}:${finding.id}`,
    $survey_completed: rating !== null,
    ...(rating !== null && {
      [`$survey_response_${PROBLEM_SURVEY.ratingQuestion}`]:
        RATING_CHOICES[rating],
    }),
    ...(reason !== null && {
      [`$survey_response_${PROBLEM_SURVEY.reasonQuestion}`]:
        REASON_CHOICES[reason],
    }),
    ...(shared && { review_id: reviewId }),
    finding_id: finding.id,
    shared,
    outcome: feedback.outcome,
    severity: finding.severity,
    category: finding.category,
    provider,
  });
};

type ReviewCommentPayload = {
  reviewId: string;
  shared: boolean;
  provider: ReviewProvider | undefined;
  comment: string;
};

/**
 * What the researcher wrote about a review, shared or not. An empty comment
 * takes back the one sent before, as an incomplete response.
 */
export const captureReviewComment = ({
  reviewId,
  shared,
  provider,
  comment,
}: ReviewCommentPayload) => {
  posthog.capture('survey sent', {
    $survey_id: REVIEW_SURVEY.id,
    $survey_submission_id: reviewId,
    $survey_completed: comment !== '',
    ...(comment !== '' && {
      [`$survey_response_${REVIEW_SURVEY.commentQuestion}`]: comment,
    }),
    ...(shared && { review_id: reviewId }),
    shared,
    provider,
  });
};

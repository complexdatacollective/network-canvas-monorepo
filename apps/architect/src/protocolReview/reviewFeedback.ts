/**
 * What becomes of a problem, as feedback on a shared review reports it:
 *
 * - `undecided`: nothing has been done with it yet;
 * - `fixed`: Architect made the suggested fix;
 * - `fixed_edited`: Architect made the fix after the researcher changed its
 *   text or numbers;
 * - `mine`: the researcher kept it to fix themselves;
 * - `done`: the researcher fixed it themselves;
 * - `dismissed`: the researcher put it away.
 */
export const FEEDBACK_OUTCOMES = [
  'undecided',
  'fixed',
  'fixed_edited',
  'mine',
  'done',
  'dismissed',
] as const;

export type FeedbackOutcome = (typeof FEEDBACK_OUTCOMES)[number];

/** Whether the researcher found a problem worth being told about. */
export const FEEDBACK_RATINGS = ['useful', 'not_useful'] as const;

export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

/** Why a problem was not useful, when the researcher said. */
export const FEEDBACK_REASONS = [
  'wrong',
  'not_relevant',
  'fix_would_not_work',
] as const;

export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

/** The longest written feedback on a review, in characters. */
export const FEEDBACK_COMMENT_MAX_LENGTH = 2_000;

/** One problem's feedback: what became of it and how the researcher rated it. */
export type FindingFeedback = {
  outcome: FeedbackOutcome;
  /** Null until the researcher rates the problem. */
  rating: FeedbackRating | null;
  /** Only ever with `not_useful`, and null unless the researcher gave one. */
  reason: FeedbackReason | null;
};

/**
 * Feedback on a review as it stands, or as it was last sent
 * (`StoredReview.feedbackSent`). Problems are reported only for a review that
 * was shared; the comment for any review.
 */
export type ReviewFeedback = {
  findings: Record<string, FindingFeedback>;
  /** Empty when the researcher has written nothing. */
  comment: string;
};

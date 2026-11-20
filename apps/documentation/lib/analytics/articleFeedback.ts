/**
 * The "Did this article help?" prompt answers a PostHog survey of type API,
 * "Documentation article feedback". The ids are the survey's and its
 * questions' in PostHog, and each rating is sent as the English choice text
 * the survey holds, so a change to either in PostHog must change here too.
 */
const ARTICLE_SURVEY = {
  id: '01a1fa2f-5595-0000-a91f-b16efc12bc06',
  ratingQuestion: 'c5b666c2-1e43-4ff8-b212-ea3b3bd327ae',
  commentQuestion: '220d2d7a-3cb1-4061-9c03-dc02ff1b44e4',
} as const;

export type ArticleRating = 'yes' | 'no';

const RATING_CHOICES: Record<ArticleRating, string> = {
  yes: 'Yes',
  no: 'No',
};

export const ARTICLE_COMMENT_MAX_LENGTH = 2000;

export type ArticleFeedback = {
  submissionId: string;
  rating: ArticleRating | null;
  comment: string;
};

type ArticleContext = {
  /** The article's path without the language, so translations group together. */
  docPath: string;
  locale: string;
};

/**
 * One response per visit to an article. Changing the rating or adding a
 * comment sends the same submission again, so PostHog keeps the latest answer; one
 * without a rating is an incomplete response.
 */
export function articleFeedbackEvent(
  { submissionId, rating, comment }: ArticleFeedback,
  { docPath, locale }: ArticleContext,
) {
  return {
    $survey_id: ARTICLE_SURVEY.id,
    $survey_submission_id: submissionId,
    $survey_completed: rating !== null,
    ...(rating !== null && {
      [`$survey_response_${ARTICLE_SURVEY.ratingQuestion}`]:
        RATING_CHOICES[rating],
    }),
    ...(comment !== '' && {
      [`$survey_response_${ARTICLE_SURVEY.commentQuestion}`]: comment,
    }),
    doc_path: docPath,
    section: docPath.split('/')[1] ?? '',
    locale,
  };
}

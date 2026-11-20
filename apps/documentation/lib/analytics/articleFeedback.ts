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

export const ARTICLE_RATINGS = ['yes', 'no'] as const;

export type ArticleRating = (typeof ARTICLE_RATINGS)[number];

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
 * One response per article per reader. Changing the rating or the comment
 * sends the same submission again, so PostHog keeps the latest answer; one
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

const STORAGE_PREFIX = 'nc-docs-article-feedback:';

const isArticleRating = (value: unknown): value is ArticleRating =>
  ARTICLE_RATINGS.some((rating) => rating === value);

export function readStoredArticleFeedback(docPath: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + docPath);
  } catch {
    return null;
  }
}

export function parseArticleFeedback(
  raw: string | null,
): ArticleFeedback | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('submissionId' in parsed) ||
      !('comment' in parsed)
    ) {
      return null;
    }
    const { submissionId, comment } = parsed;
    if (typeof submissionId !== 'string' || typeof comment !== 'string') {
      return null;
    }
    const rating = 'rating' in parsed ? parsed.rating : null;
    return {
      submissionId,
      rating: isArticleRating(rating) ? rating : null,
      comment,
    };
  } catch {
    return null;
  }
}

export function saveArticleFeedback(
  docPath: string,
  feedback: ArticleFeedback,
): void {
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + docPath,
      JSON.stringify(feedback),
    );
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the
    // answer is still sent, it just isn't remembered on the next visit.
  }
}

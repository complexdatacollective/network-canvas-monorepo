import { readBodyWithLimit } from './body.ts';
import {
  type FeedbackErrorCode,
  FeedbackRequestSchema,
  REVIEW_LIMITS,
} from './contract.ts';
import type { ReviewDependencies } from './review.ts';

/**
 * Feedback on a review the researcher shared: what they did with each
 * problem, how they rated it, and anything they wrote about the review.
 *
 * It is kept beside the shared review and for no longer: a review the service
 * holds no shared copy of gets none kept, and what is kept expires at the
 * moment the review does.
 */

/** KV refuses an expiry nearer than this, in seconds. */
const SHORTEST_EXPIRY_SECONDS = 60;

/** Where a shared review is kept. */
export const sharedReviewKey = (reviewId: string): string =>
  `review:${reviewId}`;

/** Where the feedback on it is kept. */
const feedbackKey = (reviewId: string): string => `feedback:${reviewId}`;

const refusal = (
  status: number,
  error: FeedbackErrorCode,
  retryAt: string | null,
  cors: Record<string, string>,
): Response =>
  new Response(JSON.stringify({ error, retryAt }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

export const feedback = async (
  request: Request,
  cors: Record<string, string>,
  deps: ReviewDependencies,
): Promise<Response> => {
  const body = await readBodyWithLimit(request, REVIEW_LIMITS.maxFeedbackBytes);
  if (!body.ok) {
    return body.reason === 'too_large'
      ? refusal(413, 'too_large', null, cors)
      : refusal(400, 'invalid_request', null, cors);
  }
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return refusal(400, 'invalid_request', null, cors);
  }
  const parsed = FeedbackRequestSchema.safeParse(json);
  if (!parsed.success) return refusal(400, 'invalid_request', null, cors);
  const { installationId, reviewId, findings, comment } = parsed.data;

  const receivedAt = deps.now();
  const address =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('CF-Connecting-IPv6') ??
    'unknown';
  try {
    const [installationKey, addressKey] = await Promise.all([
      deps.hash(`feedback-installation:${installationId}`),
      deps.hash(`feedback-address:${address}`),
    ]);
    const admitted = await deps.limiter.admitFeedback({
      installationKey,
      addressKey,
      now: receivedAt,
    });
    if (!admitted.ok) {
      return refusal(429, admitted.error, admitted.retryAt, cors);
    }

    const expiration = await deps.sharedReviews.expiration(
      sharedReviewKey(reviewId),
    );
    if (
      expiration === null ||
      expiration - Math.floor(receivedAt / 1000) < SHORTEST_EXPIRY_SECONDS
    ) {
      return refusal(404, 'unknown_review', null, cors);
    }
    await deps.sharedReviews.put(
      feedbackKey(reviewId),
      JSON.stringify({
        receivedAt: new Date(receivedAt).toISOString(),
        findings,
        comment,
      }),
      { expiration },
    );
  } catch {
    deps.log({ reason: 'feedback_failed', status: 0, provider: null });
    return refusal(503, 'service_unavailable', null, cors);
  }
  return new Response(null, { status: 204, headers: cors });
};

import { describe, expect, it } from 'vitest';

import {
  type FeedbackRequest,
  FeedbackErrorSchema,
  REVIEW_LIMITS,
} from '../contract.ts';
import { handleRequest } from '../review.ts';
import {
  ADDRESS,
  answerWith,
  countFor,
  createHarness,
  type Harness,
  INSTALLATION_ID,
  modelFinding,
  ORIGIN,
  readEvents,
  reviewRequest,
  scriptedModel,
  URL_FEEDBACK,
  validRequest,
} from './helpers.ts';

const DAY_SECONDS = 24 * 60 * 60;
const RETENTION_SECONDS = REVIEW_LIMITS.sharedReviewRetentionDays * DAY_SECONDS;

const feedbackRequest = (
  body: unknown,
  headers: Record<string, string> = {},
): Request =>
  new Request(URL_FEEDBACK, {
    method: 'POST',
    headers: {
      'Origin': ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ADDRESS,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Runs one review and answers with its id. */
const reviewed = async (harness: Harness, share: boolean): Promise<string> => {
  const events = await readEvents(
    await handleRequest(reviewRequest(validRequest({ share })), harness.deps),
  );
  await harness.settled();
  const last = events.at(-1);
  if (last?.type !== 'result') throw new Error('Expected a result.');
  return last.result.reviewId;
};

const newHarness = () =>
  createHarness(
    scriptedModel({ chunks: [answerWith([modelFinding('A problem')])] }),
  );

const validFeedback = (
  reviewId: string,
  overrides: Partial<FeedbackRequest> = {},
): FeedbackRequest => ({
  installationId: INSTALLATION_ID,
  reviewId,
  findings: [
    { id: 'f1', outcome: 'fixed_edited', rating: 'useful', reason: null },
    { id: 'f2', outcome: 'dismissed', rating: 'not_useful', reason: 'wrong' },
  ],
  comment: 'The second problem misread the skip logic.',
  ...overrides,
});

const errorOf = async (response: Response) =>
  FeedbackErrorSchema.parse(await response.json());

describe('feedback on a shared review', () => {
  it('is kept beside the review, until the moment the review expires', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    const reviewExpiresAt = harness.shared[0]?.expiresAt;

    // Ten days on, feedback gets what is left of the review's time, not a
    // new retention period.
    harness.clock.now += 10 * DAY_SECONDS * 1000;
    const sent = validFeedback(reviewId);
    const response = await handleRequest(feedbackRequest(sent), harness.deps);

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(harness.shared).toHaveLength(2);
    const kept = harness.shared[1];
    expect(kept?.key).toBe(`feedback:${reviewId}`);
    expect(kept?.expirationTtl).toBeNull();
    expect(kept?.expiresAt).toBe(reviewExpiresAt);
    expect(kept?.expiresAt).toBe(
      Math.floor(harness.clock.now / 1000) +
        RETENTION_SECONDS -
        10 * DAY_SECONDS,
    );
    // The installation id and the address are counted, never kept.
    expect(JSON.parse(kept?.value ?? 'null')).toEqual({
      receivedAt: new Date(harness.clock.now).toISOString(),
      findings: sent.findings,
      comment: sent.comment,
    });
    expect(kept?.value).not.toContain(INSTALLATION_ID);
    expect(kept?.value).not.toContain(ADDRESS);
  });

  it('replaces the feedback sent before', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    await handleRequest(feedbackRequest(validFeedback(reviewId)), harness.deps);
    const later = validFeedback(reviewId, { findings: [], comment: null });
    const response = await handleRequest(feedbackRequest(later), harness.deps);

    expect(response.status).toBe(204);
    const [, first, second] = harness.shared;
    expect(second?.key).toBe(first?.key);
    expect(JSON.parse(second?.value ?? 'null')).toMatchObject({
      findings: [],
      comment: null,
    });
  });

  it('does not count against the limit on reviews', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    expect(countFor(harness.store, 'installation')).toBe(1);
    await handleRequest(feedbackRequest(validFeedback(reviewId)), harness.deps);
    expect(countFor(harness.store, 'installation')).toBe(1);
    expect(countFor(harness.store, 'address')).toBe(1);
  });
});

describe('feedback that is not kept', () => {
  it('is refused for a review that was not shared', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, false);
    const response = await handleRequest(
      feedbackRequest(validFeedback(reviewId)),
      harness.deps,
    );
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toEqual({
      error: 'unknown_review',
      retryAt: null,
    });
    expect(harness.shared).toEqual([]);
  });

  it('is refused once the shared review has expired, or is about to', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    harness.clock.now += (RETENTION_SECONDS - 30) * 1000;
    const nearly = await handleRequest(
      feedbackRequest(validFeedback(reviewId)),
      harness.deps,
    );
    expect(nearly.status).toBe(404);
    harness.clock.now += 60 * 1000;
    const after = await handleRequest(
      feedbackRequest(validFeedback(reviewId)),
      harness.deps,
    );
    expect(after.status).toBe(404);
    expect(harness.shared).toHaveLength(1);
  });

  it('is refused when it is not the contract’s', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    const bodies: unknown[] = [
      'not json',
      { ...validFeedback(reviewId), extra: true },
      { ...validFeedback(reviewId), reviewId: 'not-a-uuid' },
      validFeedback(reviewId, {
        comment: 'x'.repeat(REVIEW_LIMITS.maxFeedbackCommentLength + 1),
      }),
      validFeedback(reviewId, { comment: '' }),
      // A reason belongs only to a problem that was not useful.
      validFeedback(reviewId, {
        findings: [
          { id: 'f1', outcome: 'fixed', rating: 'useful', reason: 'wrong' },
        ],
      }),
      validFeedback(reviewId, {
        findings: Array.from(
          { length: REVIEW_LIMITS.maxFeedbackFindings + 1 },
          (_, index) => ({
            id: `f${index}`,
            outcome: 'undecided' as const,
            rating: null,
            reason: null,
          }),
        ),
      }),
    ];
    for (const body of bodies) {
      const response = await handleRequest(feedbackRequest(body), harness.deps);
      expect(response.status).toBe(400);
      expect(await errorOf(response)).toEqual({
        error: 'invalid_request',
        retryAt: null,
      });
    }
    expect(harness.shared).toHaveLength(1);
  });

  it('is refused when it is too large, whatever its length says', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    const body = JSON.stringify({
      ...validFeedback(reviewId),
      padding: 'x'.repeat(REVIEW_LIMITS.maxFeedbackBytes),
    });
    const request = new Request(URL_FEEDBACK, {
      method: 'POST',
      headers: { 'Origin': ORIGIN, 'Content-Type': 'application/json' },
      body: new Blob([body]).stream(),
      duplex: 'half',
    } as RequestInit);
    expect(request.headers.get('Content-Length')).toBeNull();
    const response = await handleRequest(request, harness.deps);
    expect(response.status).toBe(413);
    expect(await errorOf(response)).toEqual({
      error: 'too_large',
      retryAt: null,
    });
  });

  it('is refused from another origin, and by another method', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    const foreign = await handleRequest(
      feedbackRequest(validFeedback(reviewId), {
        Origin: 'https://example.com',
      }),
      harness.deps,
    );
    expect(foreign.status).toBe(403);
    const get = await handleRequest(
      new Request(URL_FEEDBACK, { headers: { Origin: ORIGIN } }),
      harness.deps,
    );
    expect(get.status).toBe(405);
    expect(harness.shared).toHaveLength(1);
  });

  it('is refused past the hourly limit, until the hour ends', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    const send = () =>
      handleRequest(feedbackRequest(validFeedback(reviewId)), harness.deps);
    for (
      let sent = 0;
      sent < REVIEW_LIMITS.feedbackPerInstallationPerHour;
      sent += 1
    ) {
      expect((await send()).status).toBe(204);
    }
    const refused = await send();
    expect(refused.status).toBe(429);
    expect(await errorOf(refused)).toEqual({
      error: 'hourly_limit',
      retryAt: new Date(harness.clock.now + 60 * 60 * 1000).toISOString(),
    });
    // A refused sending keeps nothing, and reviews are still allowed.
    expect(harness.shared).toHaveLength(
      1 + REVIEW_LIMITS.feedbackPerInstallationPerHour,
    );
    await reviewed(harness, false);

    harness.clock.now += 60 * 60 * 1000;
    expect((await send()).status).toBe(204);
  });

  it('answers unavailable, and logs a fixed code, when it cannot be kept', async () => {
    const harness = newHarness();
    const reviewId = await reviewed(harness, true);
    harness.deps.sharedReviews.put = async () => {
      throw new Error('KV is down');
    };
    const response = await handleRequest(
      feedbackRequest(validFeedback(reviewId)),
      harness.deps,
    );
    expect(response.status).toBe(503);
    expect(await errorOf(response)).toEqual({
      error: 'service_unavailable',
      retryAt: null,
    });
    expect(harness.logs).toEqual([
      { reason: 'feedback_failed', status: 0, provider: null },
    ]);
    expect(harness.notices).toEqual([]);
  });
});

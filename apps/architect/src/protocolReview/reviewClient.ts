import {
  PROTOCOL_REVIEW_SERVICE_URL,
  type ProviderAvailability,
  PROVIDERS_PATH,
  ProviderStatusSchema,
  REVIEW_PATH,
  type ReviewErrorCode,
  ReviewErrorSchema,
  type ReviewEvent,
  ReviewEventSchema,
  type ReviewRequest,
  type ReviewResult,
} from '@codaco/protocol-review-worker/contract';

import { readEventStream } from './eventStream';

/**
 * Talks to the protocol review service. A review is one `POST`, answered with
 * a stream of server-sent events (`ReviewEvent`) or with a JSON error; which
 * providers have budget left is one `GET`.
 */

/** Where the service is asked: the build's override, else the service. */
export const reviewServiceUrl = (path: string = REVIEW_PATH): string => {
  const override = import.meta.env.VITE_PROTOCOL_REVIEW_URL;
  const base =
    typeof override === 'string' && override !== ''
      ? override
      : PROTOCOL_REVIEW_SERVICE_URL;
  return new URL(path, base).toString();
};

export type ReviewOutcome =
  | { kind: 'result'; result: ReviewResult }
  | { kind: 'error'; code: ReviewErrorCode; retryAt: string | null }
  | { kind: 'aborted' };

const UNAVAILABLE: ReviewOutcome = {
  kind: 'error',
  code: 'service_unavailable',
  retryAt: null,
};

const isAbort = (error: unknown, signal: AbortSignal) =>
  signal.aborted ||
  (error instanceof DOMException && error.name === 'AbortError');

const errorOutcome = async (response: Response): Promise<ReviewOutcome> => {
  try {
    const body: unknown = await response.json();
    const parsed = ReviewErrorSchema.safeParse(body);
    return parsed.success
      ? { kind: 'error', code: parsed.data.error, retryAt: parsed.data.retryAt }
      : UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
};

type RequestReviewOptions = {
  request: ReviewRequest;
  signal: AbortSignal;
  /**
   * Characters received so far of the model's answer (`received`) and of the
   * summary of its thinking, which comes first (`thinking`); both only grow.
   * `thinking` is 0 from a service that does not report it.
   */
  onProgress?: (progress: { received: number; thinking: number }) => void;
  url?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Requests a review and waits for its outcome. Never throws: a network
 * failure or an answer that is not the contract's is `service_unavailable`,
 * and an abort through `signal` is `aborted`.
 */
export const requestReview = async ({
  request,
  signal,
  onProgress,
  url = reviewServiceUrl(),
  fetchImpl = fetch,
}: RequestReviewOptions): Promise<ReviewOutcome> => {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    return isAbort(error, signal) ? { kind: 'aborted' } : UNAVAILABLE;
  }

  if (!response.ok) return await errorOutcome(response);
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    return UNAVAILABLE;
  }

  let outcome: ReviewOutcome | null = null;
  let malformed = false;
  const handle = (event: ReviewEvent) => {
    if (event.type === 'progress') {
      onProgress?.({ received: event.received, thinking: event.thinking ?? 0 });
    } else if (event.type === 'result') {
      outcome = { kind: 'result', result: event.result };
    } else {
      outcome = {
        kind: 'error',
        code: event.error.error,
        retryAt: event.error.retryAt,
      };
    }
  };
  const onData = (data: string) => {
    if (outcome !== null || malformed) return;
    let json: unknown;
    try {
      json = JSON.parse(data) as unknown;
    } catch {
      malformed = true;
      return;
    }
    const parsed = ReviewEventSchema.safeParse(json);
    if (parsed.success) handle(parsed.data);
    else malformed = true;
  };

  try {
    await readEventStream(
      response.body,
      signal,
      onData,
      () => outcome !== null || malformed,
    );
  } catch (error) {
    return isAbort(error, signal) ? { kind: 'aborted' } : UNAVAILABLE;
  }
  if (signal.aborted) return { kind: 'aborted' };
  if (malformed) return UNAVAILABLE;
  return outcome ?? UNAVAILABLE;
};

type RequestProviderStatusOptions = {
  url?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Asks which providers have budget left for a review. Never throws: null
 * when the service could not be asked or its answer is not the contract's,
 * which says nothing either way about any provider. It sends nothing about
 * the researcher or the protocol, and no header that needs a preflight.
 */
export const requestProviderStatus = async ({
  url = reviewServiceUrl(PROVIDERS_PATH),
  fetchImpl = fetch,
}: RequestProviderStatusOptions = {}): Promise<
  ProviderAvailability[] | null
> => {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const parsed = ProviderStatusSchema.safeParse(body);
    return parsed.success ? parsed.data.providers : null;
  } catch {
    return null;
  }
};

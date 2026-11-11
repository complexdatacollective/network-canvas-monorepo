import { readBodyWithLimit } from './body.ts';
import {
  HEARTBEAT_INTERVAL_MS,
  MODEL_TIMEOUT_MS,
  PROGRESS_INTERVAL_MS,
} from './constants.ts';
import {
  REVIEW_LIMITS,
  REVIEW_PATH,
  type ReviewErrorCode,
  type ReviewEvent,
  type ReviewRequest,
  ReviewRequestSchema,
} from './contract.ts';
import { allowedOrigin, corsHeaders, preflightHeaders } from './cors.ts';
import { normaliseFindings } from './findings.ts';
import type { AdmitRequest, AdmitResult, SettleRequest } from './limiter.ts';
import { ModelCallError, type ReviewModel } from './model.ts';
import type { FailureLog, FailureNotifier } from './notify.ts';
import { costMicros, reservationMicros } from './pricing.ts';
import { buildReviewMessage, REVIEW_SYSTEM_PROMPT } from './prompt/build.ts';

/**
 * The review service: everything between the request and the response, with
 * every outside dependency injected so it runs under plain vitest.
 */

type ReviewLimiter = {
  admit: (request: AdmitRequest) => Promise<AdmitResult>;
  settle: (request: SettleRequest) => Promise<void>;
};

type SharedReviewStore = {
  put: (
    key: string,
    value: string,
    options: { expirationTtl: number },
  ) => Promise<void>;
};

export type ReviewDependencies = {
  /** The one extra origin allowed in local development; unset in production. */
  devOrigin: string | undefined;
  limiter: ReviewLimiter;
  model: ReviewModel;
  sharedReviews: SharedReviewStore;
  notify: FailureNotifier;
  log: FailureLog;
  /** Keeps work going after the response has been returned. */
  waitUntil: (promise: Promise<unknown>) => void;
  now: () => number;
  randomId: () => string;
  /** A one-way hash, so limit keys never hold an address or an id. */
  hash: (value: string) => Promise<string>;
  timing?: {
    progressIntervalMs?: number;
    heartbeatIntervalMs?: number;
    timeoutMs?: number;
  };
};

const SECONDS_PER_DAY = 24 * 60 * 60;

const errorResponse = (
  status: number,
  error: ReviewErrorCode,
  retryAt: string | null,
  headers: Record<string, string>,
): Response =>
  new Response(JSON.stringify({ error, retryAt }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

const SERVICE_UNAVAILABLE: ReviewEvent = {
  type: 'error',
  error: { error: 'service_unavailable', retryAt: null },
};

export const handleRequest = async (
  request: Request,
  deps: ReviewDependencies,
): Promise<Response> => {
  const origin = allowedOrigin(request, deps.devOrigin);
  if (origin === null) {
    return errorResponse(403, 'forbidden_origin', null, { Vary: 'Origin' });
  }
  const cors = corsHeaders(origin);

  if (new URL(request.url).pathname !== REVIEW_PATH) {
    return new Response(null, { status: 404, headers: cors });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: preflightHeaders(origin),
    });
  }
  if (request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { ...cors, Allow: 'POST, OPTIONS' },
    });
  }

  const body = await readBodyWithLimit(request, REVIEW_LIMITS.maxRequestBytes);
  if (!body.ok) {
    return body.reason === 'too_large'
      ? errorResponse(413, 'too_large', null, cors)
      : errorResponse(400, 'invalid_request', null, cors);
  }
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return errorResponse(400, 'invalid_request', null, cors);
  }
  const parsed = ReviewRequestSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', null, cors);
  }

  return review(request, parsed.data, cors, deps);
};

const review = async (
  request: Request,
  reviewRequest: ReviewRequest,
  cors: Record<string, string>,
  deps: ReviewDependencies,
): Promise<Response> => {
  const receivedAt = deps.now();
  const system = REVIEW_SYSTEM_PROMPT;
  const user = buildReviewMessage(reviewRequest);

  const address =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('CF-Connecting-IPv6') ??
    'unknown';
  const [installationKey, addressKey] = await Promise.all([
    deps.hash(`installation:${reviewRequest.installationId}`),
    deps.hash(`address:${address}`),
  ]);

  const admitted = await deps.limiter.admit({
    installationKey,
    addressKey,
    reservationMicros: reservationMicros(system.length + user.length),
    now: receivedAt,
  });
  if (!admitted.ok) {
    return admitted.error === 'hourly_limit'
      ? errorResponse(429, 'hourly_limit', admitted.retryAt, cors)
      : errorResponse(503, 'daily_limit', admitted.retryAt, cors);
  }
  const { admission, quota } = admitted;

  const progressIntervalMs =
    deps.timing?.progressIntervalMs ?? PROGRESS_INTERVAL_MS;
  const heartbeatIntervalMs =
    deps.timing?.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const timeoutMs = deps.timing?.timeoutMs ?? MODEL_TIMEOUT_MS;

  const abort = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, timeoutMs);
  request.signal?.addEventListener('abort', () => abort.abort());

  // The stream, once the response has been returned. Until then, progress is
  // only counted.
  let send: ((event: ReviewEvent) => void) | null = null;
  let received = 0;
  let lastProgressAt = Number.NEGATIVE_INFINITY;
  const sendProgress = (force: boolean) => {
    if (!send) return;
    const now = deps.now();
    if (!force && now - lastProgressAt < progressIntervalMs) return;
    lastProgressAt = now;
    send({ type: 'progress', received });
  };

  const { promise: started, resolve: markStarted } =
    Promise.withResolvers<void>();

  const run = deps.model({
    system,
    user,
    signal: abort.signal,
    onStart: () => markStarted(),
    onText: (chunk) => {
      received += chunk.length;
      sendProgress(false);
    },
  });

  const settle = async (actualMicros: number, refundHourly: boolean) => {
    try {
      await deps.limiter.settle({ admission, actualMicros, refundHourly });
    } catch {
      deps.log({ reason: 'settle_failed', status: 0 });
    }
  };

  const fail = async (
    reason: string,
    status: number,
    actualMicros: number,
  ): Promise<ReviewEvent> => {
    await settle(actualMicros, true);
    deps.log({ reason, status });
    deps.waitUntil(deps.notify({ reason, status }));
    return SERVICE_UNAVAILABLE;
  };

  /** The review's last event, or null when the client went away. */
  const conclude = async (): Promise<ReviewEvent | null> => {
    try {
      const output = await run;
      const cost = costMicros(output.usage);
      if (output.stopReason === 'refusal') return fail('refusal', 200, cost);
      if (output.stopReason === 'max_tokens') {
        return fail('truncated', 200, cost);
      }
      const normalised = normaliseFindings(output.text);
      if (!normalised.ok) return fail(normalised.reason, 200, cost);

      await settle(cost, false);
      const reviewId = deps.randomId();
      if (reviewRequest.share) {
        deps.waitUntil(
          share(deps, reviewId, receivedAt, reviewRequest, normalised.findings),
        );
      }
      return {
        type: 'result',
        result: { reviewId, findings: normalised.findings, quota },
      };
    } catch (error) {
      const failure =
        error instanceof ModelCallError
          ? error
          : new ModelCallError('unknown', 0, null);
      const cost = failure.usage ? costMicros(failure.usage) : 0;
      if (failure.reason === 'cancelled' && !timedOut) {
        // The client went away. The review still counts against the hourly
        // limit; the budget keeps only what was spent.
        await settle(cost, false);
        return null;
      }
      return fail(
        failure.reason === 'cancelled' ? 'timeout' : failure.reason,
        failure.status,
        cost,
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const outcome: { ended: boolean; event: ReviewEvent | null } = {
    ended: false,
    event: null,
  };
  const concluded = conclude().then((event) => {
    outcome.ended = true;
    outcome.event = event;
    return event;
  });
  // Settling the budget must finish even if the client has gone.
  deps.waitUntil(concluded);
  await Promise.race([started, concluded]);

  // A review that ended before the provider began answering has streamed
  // nothing, so it is answered with a status instead.
  if (
    outcome.ended &&
    (outcome.event === null || outcome.event.type === 'error')
  ) {
    return errorResponse(503, 'service_unavailable', null, cors);
  }

  return stream(cors, concluded, abort, (emit) => {
    send = emit;
    sendProgress(true);
    return setInterval(() => sendProgress(true), heartbeatIntervalMs);
  });
};

/**
 * The event stream. `begin` connects the review's progress to it and returns
 * the heartbeat timer; the stream ends with the review's last event.
 */
const stream = (
  cors: Record<string, string>,
  concluded: Promise<ReviewEvent | null>,
  abort: AbortController,
  begin: (emit: (event: ReviewEvent) => void) => ReturnType<typeof setInterval>,
): Response => {
  const encoder = new TextEncoder();
  let open = true;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ReviewEvent) => {
        if (!open) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          open = false;
        }
      };
      const heartbeat = begin(emit);
      const finish = async () => {
        const event = await concluded;
        clearInterval(heartbeat);
        if (event) emit(event);
        if (open) {
          open = false;
          controller.close();
        }
      };
      void finish();
    },
    cancel() {
      // The client disconnected: stop the model, so the budget stops being
      // spent on an answer nobody will read.
      open = false;
      abort.abort();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
};

/** Keeps a review the researcher chose to share. */
const share = async (
  deps: ReviewDependencies,
  reviewId: string,
  receivedAt: number,
  request: ReviewRequest,
  findings: unknown,
): Promise<void> => {
  try {
    await deps.sharedReviews.put(
      `review:${reviewId}`,
      JSON.stringify({
        receivedAt: new Date(receivedAt).toISOString(),
        locale: request.locale,
        studyContext: request.studyContext,
        protocol: request.protocol,
        findings,
      }),
      {
        expirationTtl:
          REVIEW_LIMITS.sharedReviewRetentionDays * SECONDS_PER_DAY,
      },
    );
  } catch {
    deps.log({ reason: 'share_failed', status: 0 });
  }
};

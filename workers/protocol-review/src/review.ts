import { readBodyWithLimit } from './body.ts';
import {
  HEARTBEAT_INTERVAL_MS,
  MODEL_TIMEOUT_MS,
  PROGRESS_INTERVAL_MS,
  PROVIDER_MODELS,
} from './constants.ts';
import {
  type ProviderAvailability,
  PROVIDERS_PATH,
  type ProviderStatus,
  REVIEW_LIMITS,
  REVIEW_PATH,
  type ReviewErrorCode,
  type ReviewEvent,
  type ReviewProvider,
  type ReviewRequest,
  ReviewRequestSchema,
} from './contract.ts';
import { allowedOrigin, corsHeaders, preflightHeaders } from './cors.ts';
import { normaliseFindings, REVIEW_OUTPUT_SCHEMA } from './findings.ts';
import type {
  AdmitRequest,
  AdmitResult,
  AvailabilityRequest,
  SettleRequest,
} from './limiter.ts';
import {
  BILLING_UNKNOWN,
  type FailedCallBilling,
  ModelCallError,
  type ReviewModel,
} from './model.ts';
import type { FailureLog, FailureNotifier } from './notify.ts';
import { costMicros, reservationMicros } from './pricing.ts';
import { buildReviewMessage, REVIEW_SYSTEM_PROMPT } from './prompt/build.ts';

/**
 * The review service: everything between the request and the response, with
 * every outside dependency injected so it runs under plain vitest.
 */

type ReviewLimiter = {
  availability: (
    request: AvailabilityRequest,
  ) => Promise<ProviderAvailability[]>;
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
  /** Each provider's model call; the request says which one runs. */
  models: Record<ReviewProvider, ReviewModel>;
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

/** The response to a client that went away before the review began. */
const CLIENT_CLOSED_REQUEST = 499;

/**
 * What a failed call is recorded as having cost: nothing only when the
 * provider refused it outright; what it reported, with any unreported output
 * charged at the cap; and otherwise the whole reservation, which is the most
 * the call could have cost.
 */
const mayHaveBilled = (
  provider: ReviewProvider,
  billing: FailedCallBilling,
  reservedMicros: number,
): number => {
  if (billing.kind === 'rejected') return 0;
  if (billing.kind === 'reported') return costMicros(provider, billing.usage);
  return reservedMicros;
};

/** Everything every review sends besides its own request. */
const FIXED_TEXTS = [
  REVIEW_SYSTEM_PROMPT,
  JSON.stringify(REVIEW_OUTPUT_SCHEMA),
] as const;

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

  const { pathname } = new URL(request.url);
  if (pathname !== REVIEW_PATH && pathname !== PROVIDERS_PATH) {
    return new Response(null, { status: 404, headers: cors });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: preflightHeaders(origin),
    });
  }
  if (pathname === PROVIDERS_PATH) {
    if (request.method !== 'GET') {
      return new Response(null, {
        status: 405,
        headers: { ...cors, Allow: 'GET, OPTIONS' },
      });
    }
    return providerStatus(cors, deps);
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

/**
 * Which providers have room in their budgets for a review. It reads the
 * limiter and nothing else, so asking costs nothing and counts against no
 * limit.
 */
const providerStatus = async (
  cors: Record<string, string>,
  deps: ReviewDependencies,
): Promise<Response> => {
  let providers: ProviderAvailability[];
  try {
    providers = await deps.limiter.availability({
      smallestReservationMicros: {
        anthropic: reservationMicros('anthropic', FIXED_TEXTS),
        openai: reservationMicros('openai', FIXED_TEXTS),
      },
      now: deps.now(),
    });
  } catch {
    return errorResponse(503, 'service_unavailable', null, cors);
  }
  const status: ProviderStatus = { providers };
  return new Response(JSON.stringify(status), {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};

const review = async (
  request: Request,
  reviewRequest: ReviewRequest,
  cors: Record<string, string>,
  deps: ReviewDependencies,
): Promise<Response> => {
  const receivedAt = deps.now();
  const { provider } = reviewRequest;
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
    provider,
    // Everything the request carries: the instructions, the schema the
    // answer must follow, and the review request.
    reservationMicros: reservationMicros(provider, [...FIXED_TEXTS, user]),
    now: receivedAt,
  });
  if (!admitted.ok) {
    // The researcher's own limit is theirs to wait out (429); a provider's
    // spent budget is the service's condition (503).
    return errorResponse(
      admitted.error === 'hourly_limit' ? 429 : 503,
      admitted.error,
      admitted.retryAt,
      cors,
    );
  }
  const { admission, quota } = admitted;

  // The client may have gone away while the body was read and the review
  // admitted. An abort event is not repeated for a late listener, so the
  // signal's state is checked as well as subscribed to, with no await between
  // the two and the call. A review cancelled before its call started spent
  // nothing, and still counts against the hourly limit, as any cancelled
  // review does.
  if (request.signal?.aborted) {
    try {
      await deps.limiter.settle({
        admission,
        actualMicros: 0,
        refundHourly: false,
      });
    } catch {
      deps.log({ reason: 'settle_failed', status: 0, provider });
    }
    return new Response(null, { status: CLIENT_CLOSED_REQUEST, headers: cors });
  }

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
  request.signal?.addEventListener('abort', () => abort.abort(), {
    once: true,
  });

  // The stream, once the response has been returned. Until then, progress is
  // only counted.
  let send: ((event: ReviewEvent) => void) | null = null;
  let received = 0;
  let thinking = 0;
  let lastProgressAt = Number.NEGATIVE_INFINITY;
  const sendProgress = (force: boolean) => {
    if (!send) return;
    const now = deps.now();
    if (!force && now - lastProgressAt < progressIntervalMs) return;
    lastProgressAt = now;
    send({ type: 'progress', received, thinking });
  };

  const { promise: started, resolve: markStarted } =
    Promise.withResolvers<void>();

  const run = deps.models[provider]({
    system,
    user,
    signal: abort.signal,
    onStart: () => markStarted(),
    onThinking: (chunk) => {
      thinking += chunk.length;
      sendProgress(false);
    },
    onText: (chunk) => {
      received += chunk.length;
      sendProgress(false);
    },
  });

  const settle = async (actualMicros: number, refundHourly: boolean) => {
    try {
      await deps.limiter.settle({ admission, actualMicros, refundHourly });
    } catch {
      deps.log({ reason: 'settle_failed', status: 0, provider });
    }
  };

  const fail = async (
    reason: string,
    status: number,
    actualMicros: number,
  ): Promise<ReviewEvent> => {
    await settle(actualMicros, true);
    deps.log({ reason, status, provider });
    deps.waitUntil(deps.notify({ reason, status, provider }));
    return SERVICE_UNAVAILABLE;
  };

  /** The review's last event, or null when the client went away. */
  const conclude = async (): Promise<ReviewEvent | null> => {
    try {
      const output = await run;
      const cost = costMicros(provider, output.usage);
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
          : new ModelCallError('unknown', 0, BILLING_UNKNOWN);
      const cost = mayHaveBilled(
        provider,
        failure.billing,
        admission.reservationMicros,
      );
      if (failure.reason === 'cancelled' && !timedOut) {
        // The client went away. The review still counts against the hourly
        // limit; the budget keeps what the call may have cost.
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
        provider: request.provider,
        model: PROVIDER_MODELS[request.provider].model,
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
    deps.log({ reason: 'share_failed', status: 0, provider: request.provider });
  }
};

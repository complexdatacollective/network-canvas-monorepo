import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from 'openai';
import type {
  Response as ModelResponse,
  ResponseUsage,
} from 'openai/resources/responses/responses';

import {
  MAX_OUTPUT_TOKENS,
  MODEL_TIMEOUT_MS,
  PROVIDER_MODELS,
} from './constants.ts';
import { REVIEW_OUTPUT_SCHEMA } from './findings.ts';
import {
  BILLING_UNKNOWN,
  type FailedCallBilling,
  ModelCallError,
  type ModelFailureReason,
  REJECTED,
  type ReviewModel,
  reasonByStatus,
  reported,
} from './model.ts';
import type { TokenUsage } from './pricing.ts';

/**
 * The review as one streamed call to OpenAI's Responses API: no tools, and a
 * strict structured-output schema so the answer always parses. The long,
 * unchanging instructions are the developer message and end at the one cache
 * breakpoint; the study details and protocol follow in the user message, and
 * are never written to the cache. Nothing is stored by the provider beyond
 * the call (`store: false`).
 *
 * The model reasons for minutes before it writes, and sends nothing while it
 * does unless a summary of its reasoning is asked for. The summary is asked
 * for only so that the review can be seen to move. OpenAI gives summaries to
 * verified organisations only, and refuses the whole request otherwise, so a
 * request refused as invalid is sent once more without one (see
 * `summariesRefused`).
 */

/** The fixed reason and HTTP status of a failed call to the provider. */
const classifyOpenAIError = (
  error: unknown,
): { reason: ModelFailureReason; status: number } => {
  // Most specific first: the abort and timeout errors are connection errors,
  // and every one of these is an APIError.
  if (error instanceof APIUserAbortError) {
    return { reason: 'cancelled', status: 0 };
  }
  if (error instanceof APIConnectionTimeoutError) {
    return { reason: 'timeout', status: 0 };
  }
  if (error instanceof APIConnectionError) {
    return { reason: 'connection', status: 0 };
  }
  if (error instanceof APIError) {
    // An error event in the middle of a stream carries no status: the
    // provider had accepted the request and then failed.
    if (error.status === undefined) {
      return { reason: 'provider_error', status: 0 };
    }
    const { status } = error;
    // Out of credit arrives as a 429, like a rate limit; its code tells them
    // apart.
    if (error.code === 'insufficient_quota')
      return { reason: 'billing', status };
    return { reason: reasonByStatus(status), status };
  }
  return { reason: 'unknown', status: 0 };
};

/**
 * Whether the provider refused the request outright: it answered with an HTTP
 * error status, so no answer began. A lost connection, a timeout and an abort
 * carry none, and neither does an error event in the middle of a stream; the
 * provider may have billed for any of those.
 */
const isConfirmedRejection = (error: unknown): boolean =>
  error instanceof APIError &&
  !(error instanceof APIConnectionError) &&
  !(error instanceof APIUserAbortError) &&
  typeof error.status === 'number';

/**
 * OpenAI counts cache reads and writes inside `input_tokens`; the service
 * counts the three apart, each at its own price.
 */
const toUsage = (usage: ResponseUsage): TokenUsage => {
  const written = usage.input_tokens_details.cache_write_tokens;
  const read = usage.input_tokens_details.cached_tokens;
  return {
    inputTokens: Math.max(0, usage.input_tokens - written - read),
    cacheCreationInputTokens: written,
    cacheReadInputTokens: read,
    // Reasoning is part of the output count, and billed as output.
    outputTokens: usage.output_tokens,
  };
};

/**
 * The answer's text. A streamed response carries it only in its output
 * items (`output_text` is something the SDK adds to a response that was not
 * streamed).
 */
const textOf = (response: ModelResponse): string =>
  response.output
    .flatMap((item) => (item.type === 'message' ? item.content : []))
    .map((part) => (part.type === 'output_text' ? part.text : ''))
    .join('');

/** Why a finished response stopped, in the service's vocabulary. */
const stopReasonOf = (response: ModelResponse): string | null => {
  const refused = response.output.some(
    (item) =>
      item.type === 'message' &&
      item.content.some((part) => part.type === 'refusal'),
  );
  if (refused) return 'refusal';
  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason;
    if (reason === 'max_output_tokens') return 'max_tokens';
    if (reason === 'content_filter') return 'refusal';
    return reason ?? 'incomplete';
  }
  return response.status === 'completed'
    ? 'end_turn'
    : (response.status ?? null);
};

/**
 * Whether the provider refused the request as invalid (HTTP 400), before any
 * work began. Such a request is not billed.
 */
const isInvalidRequest = (error: unknown): boolean =>
  error instanceof APIError && error.status === 400;

/** A stream that ended with the provider saying the response failed. */
class ResponseFailure extends Error {
  readonly usage: ResponseUsage | undefined;

  constructor(usage: ResponseUsage | undefined) {
    super('The response failed.');
    this.name = 'ResponseFailure';
    this.usage = usage;
  }
}

/**
 * The API keys whose requests for a summary of the reasoning the provider has
 * refused. Kept for the life of the Worker instance rather than of one model:
 * the Worker builds a model for every request, and only the first review
 * after the instance starts should pay for the refusal with a second request.
 * Held by key because the refusal is about the organisation the key belongs
 * to.
 */
const summariesRefused = new Set<string>();

export const createOpenAIModel = (
  apiKey: string,
  options: { fetch?: typeof fetch } = {},
): ReviewModel => {
  const client = new OpenAI({
    apiKey,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    // No retries, for the same reason as the Anthropic call: a retried call
    // reports only the attempt that succeeded, so an earlier one the provider
    // billed would never be counted against the budget.
    maxRetries: 0,
    timeout: MODEL_TIMEOUT_MS,
  });

  return async ({ system, user, signal, onStart, onThinking, onText }) => {
    const open = (summary: boolean) =>
      client.responses.create(
        {
          model: PROVIDER_MODELS.openai.model,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          reasoning: {
            effort: PROVIDER_MODELS.openai.effort,
            ...(summary ? { summary: 'auto' as const } : {}),
          },
          store: false,
          stream: true,
          // Only the instructions are worth caching: the rest of the request
          // is one protocol, which no later review repeats.
          prompt_cache_options: { mode: 'explicit', ttl: '30m' },
          input: [
            {
              role: 'developer',
              content: [
                {
                  type: 'input_text',
                  text: system,
                  prompt_cache_breakpoint: { mode: 'explicit' },
                },
              ],
            },
            { role: 'user', content: user },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'protocol_review',
              strict: true,
              schema: REVIEW_OUTPUT_SCHEMA,
            },
          },
        },
        { signal },
      );

    try {
      let stream: Awaited<ReturnType<typeof open>>;
      const askForSummary = !summariesRefused.has(apiKey);
      try {
        stream = await open(askForSummary);
      } catch (error) {
        // Not a retry of work the provider began: it refused the request
        // outright, which costs nothing, and the likeliest cause is the
        // summary. Anything else wrong with the request is refused again.
        if (!askForSummary || !isInvalidRequest(error)) throw error;
        summariesRefused.add(apiKey);
        stream = await open(false);
      }

      let finished: ModelResponse | null = null;
      for await (const event of stream) {
        if (event.type === 'response.created') {
          onStart();
        } else if (event.type === 'response.reasoning_summary_text.delta') {
          onThinking(event.delta);
        } else if (event.type === 'response.output_text.delta') {
          onText(event.delta);
        } else if (
          event.type === 'response.completed' ||
          event.type === 'response.incomplete'
        ) {
          finished = event.response;
        } else if (event.type === 'response.failed') {
          throw new ResponseFailure(event.response.usage);
        } else if (event.type === 'error') {
          throw new ResponseFailure(undefined);
        }
      }

      // A stream that ends without saying how the response finished never
      // reported what it cost.
      if (finished === null || finished.usage === undefined) {
        throw new ResponseFailure(undefined);
      }
      return {
        text: textOf(finished),
        stopReason: stopReasonOf(finished),
        usage: toUsage(finished.usage),
      };
    } catch (error) {
      if (error instanceof ResponseFailure) {
        // The provider had begun, so it may have billed: what it reported
        // when it said, and otherwise the whole reservation.
        throw new ModelCallError(
          'provider_error',
          200,
          error.usage ? reported(toUsage(error.usage)) : BILLING_UNKNOWN,
        );
      }
      const { reason, status } = classifyOpenAIError(error);
      const billing: FailedCallBilling = isConfirmedRejection(error)
        ? REJECTED
        : BILLING_UNKNOWN;
      throw new ModelCallError(reason, status, billing);
    }
  };
};

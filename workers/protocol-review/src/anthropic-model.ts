import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';

import {
  MAX_OUTPUT_TOKENS,
  MODEL_TIMEOUT_MS,
  PROVIDER_MODELS,
  REVIEW_EFFORT,
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
 * The review as one streamed call to Claude: no tools, adaptive thinking,
 * and a structured-output schema so the answer always parses. The long,
 * unchanging instructions are the system prompt and carry the cache
 * breakpoint; the study details and protocol follow in the user message.
 */

const REASON_BY_ERROR_TYPE: Partial<
  Record<NonNullable<APIError['type']>, ModelFailureReason>
> = {
  authentication_error: 'authentication',
  permission_error: 'permission',
  billing_error: 'billing',
  rate_limit_error: 'rate_limited',
  overloaded_error: 'overloaded',
  not_found_error: 'not_found',
  invalid_request_error: 'bad_request',
  timeout_error: 'timeout',
  api_error: 'provider_error',
};

/** The fixed reason and HTTP status of a failed call to the provider. */
export const classifyProviderError = (
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
    const status = error.status ?? 0;
    const byType = error.type ? REASON_BY_ERROR_TYPE[error.type] : undefined;
    return { reason: byType ?? reasonByStatus(status), status };
  }
  return { reason: 'unknown', status: 0 };
};

/**
 * Whether the provider refused the request outright: it answered with an HTTP
 * error status, so no answer began. The SDK builds that error from the
 * response (`APIError.generate`), and it is the only kind that carries a
 * status. A lost connection, a timeout and an abort carry none, and neither
 * does an error event in the middle of a stream; the provider may have billed
 * for any of those.
 */
export const isConfirmedRejection = (error: unknown): boolean =>
  error instanceof APIError &&
  !(error instanceof APIConnectionError) &&
  !(error instanceof APIUserAbortError) &&
  typeof error.status === 'number';

const toUsage = (
  usage: Anthropic.Usage,
  outputTokens: number | null,
): TokenUsage => ({
  inputTokens: usage.input_tokens,
  cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
  cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  outputTokens,
});

export const createAnthropicModel = (
  apiKey: string,
  options: { fetch?: typeof fetch } = {},
): ReviewModel => {
  const client = new Anthropic({
    apiKey,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    // No retries. A retried call reports only the usage of the attempt that
    // succeeded, so an earlier attempt that failed after the provider began
    // work would be billed and never counted against the budget. The
    // researcher is told the service is unavailable and can try again.
    maxRetries: 0,
    timeout: MODEL_TIMEOUT_MS,
  });

  return async ({ system, user, signal, onStart, onText }) => {
    // The input is reported when the provider starts answering; how much
    // output it wrote is only known at the end.
    let started: TokenUsage | null = null;
    try {
      const stream = client.messages.stream(
        {
          model: PROVIDER_MODELS.anthropic.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          thinking: { type: 'adaptive' },
          output_config: {
            effort: REVIEW_EFFORT,
            format: { type: 'json_schema', schema: REVIEW_OUTPUT_SCHEMA },
          },
          system: [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: user }],
        },
        { signal },
      );

      for await (const event of stream) {
        if (event.type === 'message_start') {
          started = toUsage(event.message.usage, null);
          onStart();
        } else if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          onText(event.delta.text);
        }
      }

      const message = await stream.finalMessage();
      const text = message.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      return {
        text,
        stopReason: message.stop_reason,
        usage: toUsage(message.usage, message.usage.output_tokens),
      };
    } catch (error) {
      const { reason, status } = classifyProviderError(error);
      const billing: FailedCallBilling = started
        ? reported(started)
        : isConfirmedRejection(error)
          ? REJECTED
          : BILLING_UNKNOWN;
      throw new ModelCallError(reason, status, billing);
    }
  };
};

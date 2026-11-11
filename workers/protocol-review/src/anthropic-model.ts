import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';

import {
  MAX_OUTPUT_TOKENS,
  MODEL_TIMEOUT_MS,
  REVIEW_EFFORT,
  REVIEW_MODEL,
} from './constants.ts';
import { REVIEW_OUTPUT_SCHEMA } from './findings.ts';
import {
  ModelCallError,
  type ModelFailureReason,
  type ReviewModel,
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

const reasonByStatus = (status: number): ModelFailureReason => {
  if (status === 401) return 'authentication';
  if (status === 402) return 'billing';
  if (status === 403) return 'permission';
  if (status === 404) return 'not_found';
  if (status === 413) return 'request_too_large';
  if (status === 429) return 'rate_limited';
  if (status === 529) return 'overloaded';
  if (status === 400) return 'bad_request';
  if (status >= 500) return 'provider_error';
  return 'unknown';
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

const toUsage = (
  usage: Anthropic.Usage,
  outputTokens: number | null,
): TokenUsage => ({
  inputTokens: usage.input_tokens,
  cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
  cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  outputTokens,
});

export const createAnthropicModel = (apiKey: string): ReviewModel => {
  const client = new Anthropic({
    apiKey,
    // One retry covers a passing overload before the answer starts; more
    // would keep the researcher waiting on a provider that is down.
    maxRetries: 1,
    timeout: MODEL_TIMEOUT_MS,
  });

  return async ({ system, user, signal, onStart, onText }) => {
    // Input is billed once the provider starts answering; how much output
    // it wrote is only known at the end.
    let started: TokenUsage | null = null;
    try {
      const stream = client.messages.stream(
        {
          model: REVIEW_MODEL,
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
      throw new ModelCallError(reason, status, started);
    }
  };
};

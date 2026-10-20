// Claude through the Messages API with structured outputs.
//
// The schema goes in output_config.format RAW. The SDK's zodOutputFormat
// helper moves `enum` and `const` into description text, so the stage
// discriminators and option enums would not constrain generation.
// No assistant prefill (400 on current models) and no `thinking` field.

import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';

import {
  parseJsonOrNull,
  type ProviderAdapter,
  type StopReason,
  type StructuredRequest,
  type StructuredResponse,
} from './types.ts';

// The slice of the SDK client the adapter uses, so tests can pass a fake.
export type AnthropicClientLike = {
  messages: {
    create: (
      params: MessageCreateParamsNonStreaming,
      options?: { timeout?: number; maxRetries?: number },
    ) => Promise<Message>;
  };
};

const buildAnthropicParams = (
  request: StructuredRequest,
): MessageCreateParamsNonStreaming => ({
  model: request.model,
  max_tokens: request.maxTokens,
  system: [
    {
      type: 'text',
      text: request.system,
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: request.messages.map((m) => ({
    role: m.role,
    content: m.content,
  })),
  output_config: {
    format: { type: 'json_schema', schema: request.schema },
    ...(request.effort ? { effort: request.effort } : {}),
  },
});

const toStopReason = (reason: Message['stop_reason']): StopReason => {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'complete';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    case 'tool_use':
    case 'pause_turn':
    case null:
      return 'other';
  }
  // A stop reason newer than this SDK's types.
  return 'other';
};

const readAnthropicMessage = (message: Message): StructuredResponse => {
  const rawText = message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('');
  return {
    json: parseJsonOrNull(rawText),
    stopReason: toStopReason(message.stop_reason),
    rawText,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
  };
};

type AnthropicAdapterOptions = {
  // Injected in tests; built from ANTHROPIC_API_KEY otherwise.
  client?: AnthropicClientLike;
  apiKey?: string;
};

export const createAnthropicAdapter = (
  options: AnthropicAdapterOptions = {},
): ProviderAdapter => {
  const apiKey = () => options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  let client = options.client;
  const getClient = (): AnthropicClientLike => {
    client ??= new Anthropic({ apiKey: apiKey(), maxRetries: 0 });
    return client;
  };
  return {
    provider: 'anthropic',
    isConfigured: () => Boolean(options.client) || apiKey().length > 0,
    generateStructured: async (request) => {
      const message = await getClient().messages.create(
        buildAnthropicParams(request),
        // No SDK retries: each would get the full timeout again, multiplying
        // it past the background function's limit. The pipeline retries.
        {
          maxRetries: 0,
          ...(request.timeoutMs ? { timeout: request.timeoutMs } : {}),
        },
      );
      return readAnthropicMessage(message);
    },
  };
};

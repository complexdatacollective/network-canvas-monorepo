// Claude through the Messages API with structured outputs.
//
// The schema goes in output_config.format RAW. The SDK's zodOutputFormat
// helper moves `enum` and `const` into description text, so the stage
// discriminators and option enums would not constrain generation.
// No assistant prefill (400 on current models) and no `thinking` field.
//
// A schema too big for constrained decoding (the study design) is rejected
// with "The compiled grammar is too large". Such a schema is then sent as
// guidance instead: in the system prompt, with the reply parsed as JSON and
// checked against the schema by the caller, like any other answer.

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

const schemaGuidance = (request: StructuredRequest) =>
  [
    `Reply with one JSON object that matches the JSON Schema below (named "${request.schemaName}").`,
    'Output only the JSON: no prose before or after it, and no code fences.',
    'Every property in the schema is required, and enum values must match exactly.',
    '',
    JSON.stringify(request.schema),
  ].join('\n');

const buildAnthropicParams = (
  request: StructuredRequest,
  constrained = true,
): MessageCreateParamsNonStreaming => ({
  model: request.model,
  max_tokens: request.maxTokens,
  system: constrained
    ? [
        {
          type: 'text',
          text: request.system,
          cache_control: { type: 'ephemeral' },
        },
      ]
    : [
        { type: 'text', text: request.system },
        {
          type: 'text',
          text: schemaGuidance(request),
          cache_control: { type: 'ephemeral' },
        },
      ],
  messages: request.messages.map((m) => ({
    role: m.role,
    content: m.content,
  })),
  output_config: {
    ...(constrained
      ? { format: { type: 'json_schema' as const, schema: request.schema } }
      : {}),
    ...(request.effort ? { effort: request.effort } : {}),
  },
});

// The one 400 that a smaller request can avoid.
const isGrammarTooLarge = (error: unknown) =>
  error instanceof Anthropic.BadRequestError &&
  /grammar is too large/i.test(error.message);

// Guided replies sometimes arrive fenced or with a stray sentence around them.
const extractJson = (text: string): unknown => {
  const direct = parseJsonOrNull(text);
  if (direct !== null) return direct;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start
    ? parseJsonOrNull(text.slice(start, end + 1))
    : null;
};

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
    json: extractJson(rawText),
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
  // Schemas the API refused to compile, sent as guidance from then on.
  const unconstrained = new Set<string>();
  const getClient = (): AnthropicClientLike => {
    client ??= new Anthropic({ apiKey: apiKey(), maxRetries: 0 });
    return client;
  };
  return {
    provider: 'anthropic',
    isConfigured: () => Boolean(options.client) || apiKey().length > 0,
    generateStructured: async (request) => {
      // No SDK retries: each would get the full timeout again, multiplying
      // it past the background function's limit. The pipeline retries.
      const send = (constrained: boolean) =>
        getClient().messages.create(
          buildAnthropicParams(request, constrained),
          {
            maxRetries: 0,
            ...(request.timeoutMs ? { timeout: request.timeoutMs } : {}),
          },
        );
      if (unconstrained.has(request.schemaName)) {
        return readAnthropicMessage(await send(false));
      }
      try {
        return readAnthropicMessage(await send(true));
      } catch (error) {
        if (!isGrammarTooLarge(error)) throw error;
        unconstrained.add(request.schemaName);
        return readAnthropicMessage(await send(false));
      }
    },
  };
};

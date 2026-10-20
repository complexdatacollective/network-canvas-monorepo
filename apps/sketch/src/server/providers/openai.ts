// OpenAI through the Responses API with strict json_schema output. The same
// provider-safe schema as Anthropic's is sent unchanged. OpenAI caches long
// prompt prefixes automatically; `prompt_cache_key` groups calls that share
// one system prompt so they land on the same cache.

import OpenAI from 'openai';
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses';

import {
  parseJsonOrNull,
  type ProviderAdapter,
  type StopReason,
  type StructuredRequest,
  type StructuredResponse,
} from './types.ts';

export type OpenAIClientLike = {
  responses: {
    create: (
      params: ResponseCreateParamsNonStreaming,
      options?: { timeout?: number },
    ) => Promise<Response>;
  };
};

const buildOpenAIParams = (
  request: StructuredRequest,
): ResponseCreateParamsNonStreaming => ({
  model: request.model,
  instructions: request.system,
  input: request.messages.map((m) => ({
    type: 'message',
    role: m.role,
    content: m.content,
  })),
  max_output_tokens: request.maxTokens,
  store: false,
  prompt_cache_key: `sketch-${request.schemaName}`,
  text: {
    format: {
      type: 'json_schema',
      name: request.schemaName,
      strict: true,
      schema: request.schema,
    },
  },
  ...(request.effort ? { reasoning: { effort: request.effort } } : {}),
});

const hasRefusal = (response: Response) =>
  response.output.some(
    (item) =>
      item.type === 'message' &&
      item.content.some((part) => part.type === 'refusal'),
  );

const toStopReason = (response: Response): StopReason => {
  if (hasRefusal(response)) return 'refusal';
  if (response.status === 'completed') return 'complete';
  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason;
    if (reason === 'max_output_tokens') return 'max_tokens';
    if (reason === 'content_filter') return 'refusal';
  }
  return 'other';
};

const readOpenAIResponse = (response: Response): StructuredResponse => {
  const rawText = response.output_text;
  const usage = response.usage;
  const cached = usage?.input_tokens_details.cached_tokens ?? 0;
  const written = usage?.input_tokens_details.cache_write_tokens ?? 0;
  return {
    json: parseJsonOrNull(rawText),
    stopReason: toStopReason(response),
    rawText,
    usage: {
      // input_tokens includes the cached ones; report them separately.
      inputTokens: Math.max(0, (usage?.input_tokens ?? 0) - cached - written),
      outputTokens: usage?.output_tokens ?? 0,
      cacheReadTokens: cached,
      cacheWriteTokens: written,
    },
  };
};

type OpenAIAdapterOptions = {
  client?: OpenAIClientLike;
  apiKey?: string;
};

export const createOpenAIAdapter = (
  options: OpenAIAdapterOptions = {},
): ProviderAdapter => {
  const apiKey = () => options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
  let client = options.client;
  const getClient = (): OpenAIClientLike => {
    client ??= new OpenAI({ apiKey: apiKey(), maxRetries: 2 });
    return client;
  };
  return {
    provider: 'openai',
    isConfigured: () => Boolean(options.client) || apiKey().length > 0,
    generateStructured: async (request) => {
      const response = await getClient().responses.create(
        buildOpenAIParams(request),
        request.timeoutMs ? { timeout: request.timeoutMs } : undefined,
      );
      return readOpenAIResponse(response);
    },
  };
};

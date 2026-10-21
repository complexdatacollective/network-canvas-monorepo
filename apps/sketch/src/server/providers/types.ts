// The one seam between the pipeline and an LLM vendor. Each adapter turns a
// structured-output request into its SDK's call and normalises the reply, so
// the pipeline never sees a vendor type and tests can inject a fake.

import type { Provider } from '../../shared/api.ts';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Effort = 'low' | 'medium' | 'high';

type JsonSchema = Record<string, unknown>;

export type StructuredRequest = {
  model: string;
  // Sent as the cached prefix: keep it byte-stable across calls.
  system: string;
  messages: ChatMessage[];
  // A provider-safe JSON Schema (toProviderJsonSchema output), sent unchanged.
  schema: JsonSchema;
  schemaName: string;
  maxTokens: number;
  effort?: Effort;
  // Let the model think before answering (Anthropic adaptive thinking).
  thinking?: boolean;
  timeoutMs?: number;
};

// `complete` is the only state in which the JSON can be trusted to match the
// schema; anything else counts as a failed answer.
export type StopReason = 'complete' | 'max_tokens' | 'refusal' | 'other';

export type TokenUsage = {
  // Uncached input tokens.
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type StructuredResponse = {
  // The parsed reply, or null when the text is not JSON.
  json: unknown;
  stopReason: StopReason;
  usage: TokenUsage;
  rawText: string;
};

export type ProviderAdapter = {
  provider: Provider;
  isConfigured: () => boolean;
  generateStructured: (
    request: StructuredRequest,
  ) => Promise<StructuredResponse>;
};

export type ProviderAdapters = Record<Provider, ProviderAdapter>;

export const parseJsonOrNull = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
};

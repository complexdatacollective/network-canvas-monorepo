import type { JsonStore } from '../jobs.ts';
import type {
  ProviderAdapter,
  ProviderAdapters,
  StructuredRequest,
  StructuredResponse,
  TokenUsage,
} from '../providers/types.ts';

export const memoryStore = (): JsonStore & { data: Map<string, unknown> } => {
  const data = new Map<string>();
  return {
    data,
    getJSON: async (key) => structuredClone(data.get(key) ?? null),
    setJSON: async (key, value) => {
      data.set(key, structuredClone(value));
    },
  };
};

const USAGE: TokenUsage = {
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 2000,
  cacheWriteTokens: 0,
};

export const reply = (
  json: unknown,
  overrides: Partial<StructuredResponse> = {},
): StructuredResponse => ({
  json,
  rawText: json === null ? '' : JSON.stringify(json),
  stopReason: 'complete',
  usage: USAGE,
  ...overrides,
});

type Script = StructuredResponse | Error;

// A provider that answers each schema from its own queue, and records every
// request it was sent.
export const scriptedAdapter = (scripts: {
  screening?: Script[];
  study_design?: Script[];
  wording?: Script[];
}) => {
  const requests: StructuredRequest[] = [];
  const queues: Record<string, Script[]> = {
    screening: [...(scripts.screening ?? [])],
    study_design: [...(scripts.study_design ?? [])],
    wording: [...(scripts.wording ?? [])],
  };
  const adapter: ProviderAdapter = {
    provider: 'anthropic',
    isConfigured: () => true,
    generateStructured: async (request) => {
      requests.push(structuredClone(request));
      const next = queues[request.schemaName]?.shift();
      if (!next) throw new Error(`no scripted reply for ${request.schemaName}`);
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const adapters: ProviderAdapters = {
    anthropic: adapter,
    openai: { ...adapter, provider: 'openai', isConfigured: () => false },
  };
  return { adapters, requests };
};

export const STUDY_SCREENING = {
  isStudy: true,
  summary: 'Students, close friends, drinking and wellbeing',
  refusalHint: '',
};

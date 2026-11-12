import {
  type ReviewEvent,
  ReviewEventSchema,
  type ReviewProvider,
  type ReviewRequest,
} from '../contract.ts';
import {
  admit,
  availability,
  type HourlyWindow,
  type LimiterStore,
  settle,
} from '../limiter.ts';
import type {
  ModelCallError,
  ModelRunInput,
  ModelRunOutput,
  ReviewModel,
} from '../model.ts';
import type { FailureNotice } from '../notify.ts';
import type { ReviewDependencies } from '../review.ts';

/** A one-way stand-in for SHA-256 (FNV-1a), so keys never hold the input. */
const fakeHash = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

export const ORIGIN = 'https://architect.networkcanvas.com';
export const URL_REVIEW = 'https://protocol-review.networkcanvas.com/review';
export const INSTALLATION_ID = '3f1c2b9e-4d5a-4e6f-8a7b-9c0d1e2f3a4b';
export const ADDRESS = '203.0.113.7';

/** The limiter's state in memory, standing in for the Durable Object's SQL. */
export const createMemoryStore = (): LimiterStore & {
  windows: Map<string, HourlyWindow>;
  /** Each provider's spending, by day. */
  spend: Record<ReviewProvider, Map<string, number>>;
} => {
  const windows = new Map<string, HourlyWindow>();
  const spend = {
    anthropic: new Map<string, number>(),
    openai: new Map<string, number>(),
  };
  return {
    windows,
    spend,
    getWindow: (key) => windows.get(key) ?? null,
    putWindow: (window) => {
      windows.set(window.key, { ...window });
    },
    deleteWindow: (key) => {
      windows.delete(key);
    },
    deleteExpiredWindows: (now) => {
      for (const [key, window] of windows) {
        if (window.windowEnd <= now) windows.delete(key);
      }
    },
    getCommitted: (provider, day) => spend[provider].get(day) ?? 0,
    setCommitted: (provider, day, micros) => {
      spend[provider].set(day, micros);
    },
    getCommittedSince: (provider, day) =>
      [...spend[provider]].reduce(
        (total, [key, micros]) => (key >= day ? total + micros : total),
        0,
      ),
    deleteDaysBefore: (day) => {
      for (const days of Object.values(spend)) {
        for (const key of days.keys()) if (key < day) days.delete(key);
      }
    },
  };
};

export const validRequest = (
  overrides: Partial<ReviewRequest> = {},
): ReviewRequest => ({
  installationId: INSTALLATION_ID,
  locale: 'en',
  share: false,
  provider: 'anthropic',
  studyContext: {
    researchQuestions: ['How does support from close friends shape wellbeing?'],
    population: 'First-year undergraduate students',
    administration: 'self_administered',
    synopsis: 'A survey of students in their first semester.',
  },
  protocol: {
    name: 'Secret Study Name',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {},
    stages: [
      {
        id: 'stage-welcome',
        type: 'Information',
        label: { en: 'Welcome' },
        title: { en: 'Welcome' },
        items: [],
      },
    ],
  },
  ...overrides,
});

export const reviewRequest = (
  body: unknown,
  headers: Record<string, string> = {},
): Request =>
  new Request(URL_REVIEW, {
    method: 'POST',
    headers: {
      'Origin': ORIGIN,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': ADDRESS,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** A finding as the model writes it: no id. */
export const modelFinding = (
  title: string,
  severity: 'serious' | 'worth_fixing' | 'suggestion' = 'worth_fixing',
): Record<string, unknown> => ({
  severity,
  category: 'wording',
  title,
  explanation: 'Participants will read this differently.',
  stageId: 'stage-welcome',
  codebookEntity: null,
  codebookTypeId: null,
  fix: {
    summary: 'Reword the prompt.',
    changes: ['Stage 1 · Welcome: reword the title'],
    operations: [
      {
        op: 'set',
        path: '/stages/stage-welcome/title/en',
        value: '"Hello"',
      },
    ],
  },
});

export const USAGE = {
  inputTokens: 1_000,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 10_000,
  outputTokens: 2_000,
};

type ScriptedModel = {
  /** Whether the provider starts answering (sends `message_start`). */
  start?: boolean;
  /** Pieces of the summary of the model's thinking, sent before the answer. */
  thinking?: string[];
  chunks?: string[];
  /** Called before each chunk, e.g. to move the clock on. */
  beforeChunk?: () => void;
  output?: Partial<ModelRunOutput>;
  error?: ModelCallError;
  /** Wait until the call is aborted, then throw `abortError`. */
  waitForAbort?: { abortError: ModelCallError };
};

/** A model that plays a script, recording what it was asked. */
export const scriptedModel = (
  script: ScriptedModel,
): ReviewModel & { calls: ModelRunInput[] } => {
  const calls: ModelRunInput[] = [];
  const model = async (input: ModelRunInput): Promise<ModelRunOutput> => {
    calls.push(input);
    if (script.start !== false) input.onStart();
    // The answer arrives after the provider has started, as it does for real,
    // so the response is already streaming.
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const chunk of script.thinking ?? []) {
      script.beforeChunk?.();
      input.onThinking(chunk);
    }
    for (const chunk of script.chunks ?? []) {
      script.beforeChunk?.();
      input.onText(chunk);
    }
    if (script.waitForAbort) {
      const { abortError } = script.waitForAbort;
      await new Promise<void>((resolve) => {
        if (input.signal.aborted) resolve();
        input.signal.addEventListener('abort', () => resolve());
      });
      throw abortError;
    }
    if (script.error) throw script.error;
    const text = (script.chunks ?? []).join('');
    return {
      text,
      stopReason: 'end_turn',
      usage: USAGE,
      ...script.output,
    };
  };
  return Object.assign(model, { calls });
};

export const answerWith = (findings: unknown[]): string =>
  JSON.stringify({ findings });

export type Harness = {
  deps: ReviewDependencies;
  store: ReturnType<typeof createMemoryStore>;
  shared: { key: string; value: string; expirationTtl: number }[];
  logs: FailureNotice[];
  notices: FailureNotice[];
  clock: { now: number };
  /** Waits for everything handed to `waitUntil`. */
  settled: () => Promise<void>;
};

export const START = Date.parse('2026-11-11T10:00:00.000Z');

/** Fails a test that reaches a provider it did not script. */
const unscripted: ReviewModel = async () => {
  throw new Error('This test scripted no model for this provider.');
};

/**
 * `model` answers for Anthropic, which `validRequest` asks for, unless it
 * names one for each provider.
 */
export const createHarness = (
  model: ReviewModel | Record<ReviewProvider, ReviewModel>,
  overrides: Partial<ReviewDependencies> = {},
): Harness => {
  const store = createMemoryStore();
  const shared: Harness['shared'] = [];
  const logs: FailureNotice[] = [];
  const notices: FailureNotice[] = [];
  const pending: Promise<unknown>[] = [];
  const clock = { now: START };
  let ids = 0;

  const deps: ReviewDependencies = {
    devOrigin: undefined,
    limiter: {
      availability: async (request) => availability(store, request),
      admit: async (request) => admit(store, request),
      settle: async (request) => settle(store, request),
    },
    models:
      typeof model === 'function'
        ? { anthropic: model, openai: unscripted }
        : model,
    sharedReviews: {
      put: async (key, value, { expirationTtl }) => {
        shared.push({ key, value, expirationTtl });
      },
    },
    notify: async (notice) => {
      notices.push(notice);
    },
    log: (notice) => {
      logs.push(notice);
    },
    waitUntil: (promise) => {
      pending.push(promise);
    },
    now: () => clock.now,
    randomId: () => {
      ids += 1;
      return `00000000-0000-4000-8000-${String(ids).padStart(12, '0')}`;
    },
    hash: async (value) => fakeHash(value),
    ...overrides,
  };

  return {
    deps,
    store,
    shared,
    logs,
    notices,
    clock,
    settled: async () => {
      await Promise.all(pending);
    },
  };
};

/** Reads a whole event stream, checking every event against the contract. */
export const readEvents = async (
  response: Response,
): Promise<ReviewEvent[]> => {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      if (!block.startsWith('data: ')) {
        throw new Error(`Not a data event: ${block}`);
      }
      return ReviewEventSchema.parse(JSON.parse(block.slice('data: '.length)));
    });
};

/** The installation's hourly count, or 0 when it has no live window. */
export const countFor = (
  store: ReturnType<typeof createMemoryStore>,
  prefix: 'installation' | 'address',
): number => {
  const key = fakeHash(
    prefix === 'installation'
      ? `installation:${INSTALLATION_ID}`
      : `address:${ADDRESS}`,
  );
  return store.windows.get(key)?.count ?? 0;
};

import {
  type ConfigResponse,
  type JobResult,
  type JobStatus,
  type JobStep,
  STEP_IDS,
  type StepState,
} from '../shared/api.ts';

export const stepsAt = (doneCount: number): JobStep[] =>
  STEP_IDS.map((id, index) => {
    const state: StepState =
      index < doneCount ? 'done' : index === doneCount ? 'active' : 'pending';
    return { id, state, detail: `${id} ${state}` };
  });

export const sampleResult = (): JobResult => ({
  protocol: {
    name: 'Friendship and Wellbeing',
    schemaVersion: 8,
    stages: [],
    codebook: {},
    assetManifest: {
      roster: {
        id: 'roster',
        type: 'network',
        name: 'Classmates',
        source: 'classmates.csv',
      },
    },
  },
  assets: [
    {
      id: 'roster',
      name: 'classmates.csv',
      mimeType: 'text/csv',
      content: 'name\nAda\n',
    },
  ],
  summary: {
    name: 'Friendship and Wellbeing',
    stageCount: 3,
    stages: [
      { label: 'Welcome', type: 'Information' },
      { label: 'Close friends', type: 'NameGeneratorQuickAdd' },
      { label: 'Who knows whom', type: 'Sociogram' },
    ],
    nodeTypes: ['person'],
    edgeTypes: ['knows'],
    rosterCount: 1,
  },
  attempts: 1,
  fixedIssues: [],
});

export const jobStatus = (overrides: Partial<JobStatus> = {}): JobStatus => ({
  id: 'job-1',
  status: 'running',
  provider: 'anthropic',
  models: { design: 'claude-sonnet-5-5', wording: 'claude-haiku-5-5' },
  modelLabels: { design: 'Claude Sonnet 5.5', wording: 'Claude Haiku 5.5' },
  steps: stepsAt(1),
  createdAt: '2026-10-20T00:00:00.000Z',
  finishedAt: null,
  durationMs: null,
  usage: null,
  result: null,
  error: null,
  refusalHint: null,
  ...overrides,
});

export const succeededJob = (overrides: Partial<JobStatus> = {}): JobStatus =>
  jobStatus({
    status: 'succeeded',
    steps: stepsAt(5),
    finishedAt: '2026-10-20T00:00:41.000Z',
    durationMs: 41_000,
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0.19,
    },
    result: sampleResult(),
    ...overrides,
  });

const models = (design: string, wording: string) => ({
  design,
  wording,
  labels: { design, wording },
});

export const configResponse = (openaiAvailable = false): ConfigResponse => ({
  providers: [
    {
      provider: 'anthropic',
      available: true,
      label: 'Claude',
      models: {
        standard: models('Claude Sonnet 5.5', 'Claude Haiku 5.5'),
        strong: models('Claude Opus 5.5', 'Claude Haiku 5.5'),
      },
    },
    {
      provider: 'openai',
      available: openaiAvailable,
      label: 'ChatGPT',
      models: {
        standard: models('GPT-6 Astra', 'GPT-6 Luna'),
        strong: models('GPT-6 Astra', 'GPT-6 Luna'),
      },
    },
  ],
});

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// The URL and method of a fetch call, whatever form its arguments took.
export const describeCall = (input: unknown, init?: RequestInit) => ({
  url:
    typeof input === 'string' ? input : input instanceof URL ? input.href : '',
  method: init?.method ?? 'GET',
});

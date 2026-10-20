// The HTTP contract between the Sketch page and its Netlify functions. Shared
// by both sides, so it holds types and constants only: no runtime imports.

export const PROVIDERS = ['anthropic', 'openai'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const MAX_DESCRIPTION_LENGTH = 6000;
export const MIN_DESCRIPTION_LENGTH = 20;

// POST /api/jobs
export type CreateJobRequest = {
  description: string;
  provider: Provider;
  // Set when the page runs the same description through both providers, so
  // the log can pair the two runs and record which one the researcher picked.
  comparisonId?: string;
  // With comparisonId: a finished job from the Ready screen that this
  // comparison starts from, so the server can tag it with the same
  // comparisonId and the researcher can prefer it.
  seedJobId?: string;
};

export type CreateJobResponse = { jobId: string };

export type ApiError = { error: string };

// The five steps the generating screen shows, in order.
export const STEP_IDS = [
  'read',
  'design',
  'wording',
  'compile',
  'validate',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export type StepState = 'pending' | 'active' | 'done' | 'failed';

export type JobStep = {
  id: StepId;
  state: StepState;
  // One line for the step's row: what it is doing, or what it produced.
  detail: string;
};

export type JobStatusValue =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'refused';

// A file asset the protocol's assetManifest names (a placeholder roster CSV).
// The page turns `content` into a Blob for the Architect handoff and the zip.
export type GeneratedAsset = {
  id: string; // the assetManifest key
  name: string; // the manifest entry's `source` file name
  mimeType: string;
  content: string;
};

export type StageSummary = { label: string; type: string };

export type ProtocolSummary = {
  name: string;
  stageCount: number;
  stages: StageSummary[];
  nodeTypes: string[];
  edgeTypes: string[];
  rosterCount: number;
};

export type JobResult = {
  // A schema 8 protocol that passed @codaco/protocol-validation.
  protocol: Record<string, unknown>;
  assets: GeneratedAsset[];
  summary: ProtocolSummary;
  // 1 when the first design validated, 2 after the one retry.
  attempts: number;
  // Validation issues the retry fixed, for the compare screen's note.
  fixedIssues: string[];
};

export type JobModels = { design: string; wording: string };

export type JobUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
};

// GET /api/jobs/:id
export type JobStatus = {
  id: string;
  status: JobStatusValue;
  provider: Provider;
  models: JobModels;
  // Human-readable model labels, e.g. "Claude Opus 5.5".
  modelLabels: JobModels;
  steps: JobStep[];
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  usage: JobUsage | null;
  result: JobResult | null;
  // Set when status is 'failed'.
  error: string | null;
  // Set when status is 'refused': why the description is not a study yet.
  refusalHint: string | null;
};

// GET /api/config
export type ProviderConfig = {
  provider: Provider;
  available: boolean;
  label: string; // "Claude" | "ChatGPT"
  models: JobModels & { labels: JobModels };
};

export type ConfigResponse = { providers: ProviderConfig[] };

// POST /api/preference
export type PreferenceRequest = {
  comparisonId: string;
  preferredJobId: string;
};

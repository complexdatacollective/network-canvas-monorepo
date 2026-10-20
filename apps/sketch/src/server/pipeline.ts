// The five user-visible steps of a Sketch job (SPEC §0):
//   read     screening model, refuses only when the text is not a study
//   design   design model, then the deterministic preflight; at most one retry
//   wording  cheap model polishes the drafts; failure is not fatal
//   compile  compile the design with the wording
//   validate schema 8 validation; falls back to the preflight protocol
//
// Pure apart from the injected adapters and onProgress, so it is tested with
// fake providers.

import type {
  JobResult,
  JobStatusValue,
  JobStep,
  JobUsage,
  Provider,
  StepId,
  StepState,
} from '../shared/api.ts';
import { STEP_IDS } from '../shared/api.ts';
import {
  buildProtocol,
  preflight,
  retryFeedback,
  validationIssues,
  type BuildOptions,
  type BuildResult,
} from './design/build.ts';
import {
  DEFAULT_PEOPLE,
  estimateBurden,
  stageCosts,
  type Burden,
} from './design/burden.ts';
import { buildWordingRequest } from './design/feedback.ts';
import { toProviderJsonSchema } from './design/json-schema.ts';
import type { DesignIssue } from './design/rules.ts';
import {
  ScreeningSchema,
  StudyDesignSchema,
  WordingSchema,
  type StudyDesign,
  type Wording,
} from './design/schema.ts';
import { costUsd, getStepModels, type StepModels } from './models.ts';
import {
  buildDesignMessages,
  buildReviewMessage,
  DESIGN_SYSTEM,
  UNPARSEABLE_FEEDBACK,
} from './prompts/design.ts';
import {
  buildScreeningMessages,
  SCREENING_SYSTEM,
} from './prompts/screening.ts';
import { buildWordingMessages, WORDING_SYSTEM } from './prompts/wording.ts';
import type {
  ChatMessage,
  ProviderAdapter,
  ProviderAdapters,
  StopReason,
  StructuredRequest,
  StructuredResponse,
  TokenUsage,
} from './providers/types.ts';

// Built once per process: byte-stable, so the provider's grammar and prompt
// caches keep hitting.
const SCHEMAS = {
  screening: toProviderJsonSchema(ScreeningSchema),
  design: toProviderJsonSchema(StudyDesignSchema),
  wording: toProviderJsonSchema(WordingSchema),
};

const LIMITS = {
  screening: { maxTokens: 1_000, timeoutMs: 60_000 },
  // room for adaptive thinking ahead of a design of up to ~16k tokens
  design: { maxTokens: 32_000, timeoutMs: 6 * 60_000 },
  review: { maxTokens: 32_000, timeoutMs: 6 * 60_000 },
  wording: { maxTokens: 8_000, timeoutMs: 2 * 60_000 },
} as const;

// generate-background is killed at 15 minutes. The pipeline stops starting
// calls, and clips their timeouts, so it is done by 13 minutes and the final
// job, log and spend writes still have time to land.
const PIPELINE_DEADLINE_MS = 13 * 60_000;
// A call is not started with less time than this left before the deadline.
const MIN_CALL_MS = 30_000;

// The most input one call can plausibly send, priced at the cache-write
// rate (the dearer of the two input rates): the design system prompt is
// about 6k tokens, the description at most 2k, and a retry carries the
// first answer, at most 16k.
const INPUT_ALLOWANCE_TOKENS = 30_000;

const worstCaseCallUsd = (role: CallRole, model: string) =>
  costUsd(
    {
      inputTokens: 0,
      outputTokens: LIMITS[role].maxTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: INPUT_ALLOWANCE_TOKENS,
    },
    model,
  );

// The most one job can cost: screening, two design attempts, the burden
// review and wording, each at its output cap. The budget guard reserves
// this before a job runs.
export const estimateJobCostUsd = (provider: Provider): number => {
  const models = getStepModels(provider);
  const total =
    worstCaseCallUsd('screening', models.screening) +
    2 * worstCaseCallUsd('design', models.design) +
    worstCaseCallUsd('review', models.design) +
    worstCaseCallUsd('wording', models.wording);
  return Math.round(total * 1e6) / 1e6;
};

// An error that carries an HTTP status came back from the provider, which
// rejected the request without generating. Anything else (a timeout, a
// dropped connection) may have been generated and billed regardless.
const providerAnswered = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  typeof error.status === 'number';

// A 4xx other than timeout, conflict or rate limit: the provider will reject
// the same request again, so retrying it only wastes the job's time.
const providerRejected = (error: unknown) =>
  providerAnswered(error) &&
  (error as { status: number }).status >= 400 &&
  (error as { status: number }).status < 500 &&
  ![408, 409, 429].includes((error as { status: number }).status);

type PipelineInput = {
  description: string;
  provider: Provider;
};

export type PipelineDeps = {
  adapters: ProviderAdapters;
  onProgress?: (steps: JobStep[]) => void | Promise<void>;
  buildOptions?: BuildOptions;
  // For tests: a fixed clock.
  now?: () => number;
  // Epoch ms after which no call starts; defaults to PIPELINE_DEADLINE_MS
  // from the start of the run.
  deadline?: number;
  // Ask the design model to review the chosen design for respondent
  // burden. Off unless asked for.
  review?: boolean;
};

type CallRole = 'screening' | 'design' | 'review' | 'wording';

type CallRecord = {
  role: CallRole;
  attempt: number;
  model: string;
  stopReason: StopReason | 'error';
  usage: TokenUsage;
  costUsd: number;
  durationMs: number;
  error?: string;
  // costUsd is the call's worst case, not a measured cost.
  estimated?: boolean;
};

type AttemptLog = {
  attempt: number;
  stopReason: StopReason | 'error';
  rawText: string;
  parsed: boolean;
  design: StudyDesign | null;
  issues: BuildResult['issues'];
  validationIssues: ReturnType<typeof validationIssues>;
  fatal: string | null;
  retry: boolean;
  feedback: string | null;
};

type PipelineTag =
  | 'compilerBug'
  | 'wordingBug'
  | 'wordingFailed'
  | 'salvaged'
  | 'firstAttemptShipped'
  | 'screeningFailed'
  | 'reviewed'
  | 'reviewDiscarded';

type PipelineLog = {
  models: StepModels;
  screening: { isStudy: boolean; summary: string; refusalHint: string } | null;
  attempts: AttemptLog[];
  wording: Wording | null;
  protocolValid: boolean;
  shippedIssues: string[];
  tags: PipelineTag[];
  calls: CallRecord[];
  durationsMs: Partial<Record<StepId, number>>;
  // The compiled interview's burden before and after the review.
  burden?: { before: Burden; after?: Burden };
  // Set when the run threw; the outcome is then 'failed'.
  crash?: string;
};

type PipelineOutcome = {
  status: Extract<JobStatusValue, 'succeeded' | 'failed' | 'refused'>;
  steps: JobStep[];
  usage: JobUsage;
  result: JobResult | null;
  error: string | null;
  refusalHint: string | null;
  log: PipelineLog;
};

const ACTIVE_DETAIL: Record<StepId, string> = {
  read: 'Picking out who, which relationships and what to measure…',
  design: 'Choosing stages and building the codebook…',
  wording: 'Writing the prompts and screen text…',
  compile: 'Turning the design into stages, variables and skip logic…',
  validate: 'Validating every stage and variable…',
};

const DEFAULT_REFUSAL_HINT =
  'Describe who you want to interview and which people or relationships in their lives you want to map.';

const DESIGN_FAILED =
  'Sketch could not turn these research questions into a working protocol. Try stating each question more precisely, or add the population and setting to the synopsis.';

const DESIGN_UNREACHABLE =
  'The design model could not be reached. Please try again in a few minutes.';

const DESIGN_REJECTED =
  "The design model turned down Sketch's request. This is a problem with Sketch, not with your study, and it has been logged.";

const DESIGN_REFUSED =
  'The design model declined to design this study. Try describing the research questions and the population in more neutral, academic terms.';

export const PIPELINE_FAILURE_MESSAGE =
  'Something went wrong while Sketch was working on your study. Please try again.';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const listJoin = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const designDetail = (b: BuildResult) =>
  `${plural(b.design.nodeTypes.length, 'node type')}, ${plural(b.design.relationships.length, 'relationship')}, ${plural(b.design.stages.length, 'stage')}`;

const wordingDetail = (request: ReturnType<typeof buildWordingRequest>) => {
  const screens = request.stages.filter((s) => s.kind === 'information').length;
  const intros = request.stages.filter((s) =>
    s.title.startsWith('introduction title'),
  ).length;
  const parts = [plural(request.prompts.length, 'prompt')];
  if (request.questions.length)
    parts.push(plural(request.questions.length, 'question'));
  if (intros) parts.push(plural(intros, 'intro screen'));
  if (screens) parts.push(plural(screens, 'information screen'));
  return listJoin(parts);
};

const compileDetail = (b: BuildResult) => {
  const parts = ['Codebook', 'stages'];
  if (
    b.design.stages.some(
      (s) =>
        s.skipLogic.mode !== 'always_show' && s.skipLogic.conditions.length,
    )
  )
    parts.push('skip logic');
  const rosters = b.assets.filter((a) => a.mimeType === 'text/csv').length;
  if (rosters === 1) parts.push('a placeholder roster');
  if (rosters > 1) parts.push(`${rosters} placeholder rosters`);
  if (b.assets.some((a) => a.mimeType === 'application/geo+json'))
    parts.push('a world map');
  return listJoin(parts);
};

const issueMessages = (b: BuildResult) => [
  ...b.issues.filter((i) => i.severity === 'degraded').map((i) => i.message),
  ...validationIssues(b).map((i) => `${i.path.join('.')}: ${i.message}`),
  ...(b.fatal ? [b.fatal] : []),
];

// Never throws: whatever goes wrong, the outcome still carries the log and
// the cost of the calls already made, so both reach the research log and the
// daily budget.
export const runPipeline = async (
  input: PipelineInput,
  deps: PipelineDeps,
): Promise<PipelineOutcome> => {
  const clock = deps.now ?? Date.now;
  const deadline = deps.deadline ?? clock() + PIPELINE_DEADLINE_MS;
  const adapter: ProviderAdapter = deps.adapters[input.provider];
  const models = getStepModels(input.provider);
  const buildOptions = deps.buildOptions ?? {};
  // Stages the salvage step removes are reported like any degraded repair,
  // so they reach the researcher notes, the result and the log.
  const salvagedIssues: DesignIssue[] = [];
  let designOptions: BuildOptions = buildOptions;

  const steps: JobStep[] = STEP_IDS.map((id) => ({
    id,
    state: 'pending',
    detail: 'Waiting',
  }));
  const log: PipelineLog = {
    models,
    screening: null,
    attempts: [],
    wording: null,
    protocolValid: false,
    shippedIssues: [],
    tags: [],
    calls: [],
    durationsMs: {},
  };
  const stepStarted: Partial<Record<StepId, number>> = {};

  const setStep = async (id: StepId, state: StepState, detail: string) => {
    const step = steps.find((s) => s.id === id);
    if (!step) return;
    step.state = state;
    step.detail = detail;
    if (state === 'active') stepStarted[id] ??= clock();
    if (state === 'done' || state === 'failed') {
      const start = stepStarted[id];
      if (start !== undefined) log.durationsMs[id] = clock() - start;
    }
    await deps.onProgress?.(steps.map((s) => ({ ...s })));
  };

  const totals = (): JobUsage => {
    const sum = log.calls.reduce(
      (acc, c) => ({
        inputTokens: acc.inputTokens + c.usage.inputTokens,
        outputTokens: acc.outputTokens + c.usage.outputTokens,
        cacheReadTokens: acc.cacheReadTokens + c.usage.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens + c.usage.cacheWriteTokens,
        costUsd: acc.costUsd + c.costUsd,
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0,
      },
    );
    return { ...sum, costUsd: Math.round(sum.costUsd * 1e6) / 1e6 };
  };

  // Set by call() when the provider rejected the request outright.
  let lastCallRejected = false;

  // Calls the provider and records usage. Returns null when the call threw.
  const call = async (
    role: CallRole,
    attempt: number,
    request: Omit<StructuredRequest, 'maxTokens' | 'timeoutMs'>,
  ): Promise<StructuredResponse | null> => {
    const start = clock();
    const remaining = deadline - start;
    const noUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    if (remaining < MIN_CALL_MS) {
      // Out of time: not sent, so not billed.
      log.calls.push({
        role,
        attempt,
        model: request.model,
        stopReason: 'error',
        usage: noUsage,
        costUsd: 0,
        durationMs: 0,
        error: 'Skipped: the job deadline has passed',
      });
      return null;
    }
    lastCallRejected = false;
    try {
      const response = await adapter.generateStructured({
        ...request,
        maxTokens: LIMITS[role].maxTokens,
        timeoutMs: Math.min(LIMITS[role].timeoutMs, remaining),
      });
      log.calls.push({
        role,
        attempt,
        model: request.model,
        stopReason: response.stopReason,
        usage: response.usage,
        costUsd: costUsd(response.usage, request.model),
        durationMs: clock() - start,
      });
      return response;
    } catch (error) {
      lastCallRejected = providerRejected(error);
      log.calls.push({
        role,
        attempt,
        model: request.model,
        stopReason: 'error',
        usage: noUsage,
        // A timed-out call may still have been generated and billed.
        ...(providerAnswered(error)
          ? { costUsd: 0 }
          : {
              costUsd: worstCaseCallUsd(role, request.model),
              estimated: true,
            }),
        durationMs: clock() - start,
        error: errorMessage(error),
      });
      return null;
    }
  };

  const finish = (
    status: PipelineOutcome['status'],
    extra: Partial<Pick<PipelineOutcome, 'result' | 'error' | 'refusalHint'>>,
  ): PipelineOutcome => ({
    status,
    steps: steps.map((s) => ({ ...s })),
    usage: totals(),
    result: extra.result ?? null,
    error: extra.error ?? null,
    refusalHint: extra.refusalHint ?? null,
    log,
  });

  const failActive = async (error: string) => {
    const active = steps.find((s) => s.state === 'active');
    if (active) await setStep(active.id, 'failed', truncate(error, 140));
    return finish('failed', { error });
  };

  try {
    return await run();
  } catch (error) {
    log.crash = errorMessage(error);
    for (const step of steps)
      if (step.state === 'active') step.state = 'failed';
    return finish('failed', { error: PIPELINE_FAILURE_MESSAGE });
  }

  async function run(): Promise<PipelineOutcome> {
    // ---- Step 1: read ---------------------------------------------------------
    await setStep('read', 'active', ACTIVE_DETAIL.read);
    const screeningResponse = await call('screening', 1, {
      model: models.screening,
      system: SCREENING_SYSTEM,
      messages: buildScreeningMessages(input.description),
      schema: SCHEMAS.screening,
      schemaName: 'screening',
      effort: 'low',
    });
    const screening =
      screeningResponse?.stopReason === 'complete'
        ? ScreeningSchema.safeParse(screeningResponse.json)
        : null;
    if (screening?.success) {
      log.screening = screening.data;
      if (!screening.data.isStudy) {
        const refusalHint = screening.data.refusalHint || DEFAULT_REFUSAL_HINT;
        await setStep('read', 'done', 'This does not describe a study yet');
        return finish('refused', { refusalHint });
      }
    } else {
      // The gate is a courtesy; when it fails, carry on as if it had passed.
      log.tags.push('screeningFailed');
    }
    await setStep(
      'read',
      'done',
      truncate(
        (screening?.success && screening.data.summary) ||
          'Read your description',
        140,
      ),
    );

    // ---- Step 2: design -------------------------------------------------------
    await setStep('design', 'active', ACTIVE_DETAIL.design);

    type Attempt =
      | { ok: true; raw: StudyDesign; build: BuildResult; rawText: string }
      | {
          ok: false;
          rawText: string;
          feedback: string;
          reason: 'unparseable' | 'unreachable' | 'rejected' | 'refused';
        };

    const runAttempt = async (
      attempt: number,
      messages: ChatMessage[],
      role: 'design' | 'review' = 'design',
    ): Promise<Attempt> => {
      const response = await call(role, attempt, {
        model: models.design,
        system: DESIGN_SYSTEM,
        messages,
        schema: SCHEMAS.design,
        schemaName: 'study_design',
        effort: 'high',
        thinking: true,
      });
      const entry: AttemptLog = {
        attempt,
        stopReason: response?.stopReason ?? 'error',
        rawText: response?.rawText ?? '',
        parsed: false,
        design: null,
        issues: [],
        validationIssues: [],
        fatal: null,
        retry: true,
        feedback: null,
      };
      log.attempts.push(entry);
      if (!response) {
        entry.feedback = UNPARSEABLE_FEEDBACK;
        return {
          ok: false,
          rawText: '',
          feedback: UNPARSEABLE_FEEDBACK,
          reason: lastCallRejected ? 'rejected' : 'unreachable',
        };
      }
      const parsed =
        response.stopReason === 'complete'
          ? StudyDesignSchema.safeParse(response.json)
          : null;
      if (!parsed?.success) {
        entry.feedback = UNPARSEABLE_FEEDBACK;
        return {
          ok: false,
          rawText: response.rawText,
          feedback: UNPARSEABLE_FEEDBACK,
          // a refusal of this study would be refused again
          reason: response.stopReason === 'refusal' ? 'refused' : 'unparseable',
        };
      }
      entry.parsed = true;
      entry.design = parsed.data;
      let build: BuildResult;
      try {
        build = await preflight(parsed.data, buildOptions);
      } catch (error) {
        // compile() is meant to be total on analyse() output; a throw is ours.
        log.tags.push('compilerBug');
        entry.feedback = UNPARSEABLE_FEEDBACK;
        entry.fatal = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          rawText: response.rawText,
          feedback: UNPARSEABLE_FEEDBACK,
          reason: 'unparseable',
        };
      }
      entry.issues = build.issues;
      entry.validationIssues = validationIssues(build);
      entry.fatal = build.fatal;
      entry.retry = build.retry;
      if (build.retry) entry.feedback = retryFeedback(build);
      return { ok: true, raw: parsed.data, build, rawText: response.rawText };
    };

    const problemCount = (a: Attempt) =>
      a.ok
        ? a.build.issues.filter((i) => i.severity === 'degraded').length +
          validationIssues(a.build).length +
          (a.build.fatal ? 1 : 0)
        : 1;

    const firstMessages = buildDesignMessages(input.description);
    const first = await runAttempt(1, firstMessages);

    let chosen: { raw: StudyDesign; build: BuildResult } | null = null;
    let attempts = 1;
    let fixedIssues: string[] = [];

    if (first.ok && !first.build.retry) {
      chosen = { raw: first.raw, build: first.build };
    } else if (!first.ok && first.reason === 'rejected') {
      // The same request would be rejected again: do not spend the retry.
      return failActive(DESIGN_REJECTED);
    } else if (!first.ok && first.reason === 'refused') {
      return failActive(DESIGN_REFUSED);
    } else {
      const count = problemCount(first);
      await setStep(
        'design',
        'active',
        `Revising the design (${plural(count, 'problem')})`,
      );
      const feedback = first.ok ? retryFeedback(first.build) : first.feedback;
      // A multi-turn continuation when there is an answer to continue from.
      // A call that threw is simply asked again.
      let retryMessages: ChatMessage[] = firstMessages;
      if (first.rawText.trim()) {
        retryMessages = [
          ...firstMessages,
          { role: 'assistant', content: first.rawText },
          { role: 'user', content: feedback },
        ];
      } else if (first.ok || first.reason === 'unparseable') {
        retryMessages = [
          {
            role: 'user',
            content: `${firstMessages[0]?.content ?? ''}\n\n${feedback}`,
          },
        ];
      }
      const second = await runAttempt(2, retryMessages);
      attempts = 2;

      if (second.ok && !second.build.fatal) {
        chosen = { raw: second.raw, build: second.build };
        const before = first.ok
          ? issueMessages(first.build)
          : [UNPARSEABLE_FEEDBACK];
        const after = new Set(issueMessages(second.build));
        fixedIssues = before.filter((m) => !after.has(m));
      } else if (
        first.ok &&
        !first.build.fatal &&
        first.build.validation.success
      ) {
        // The revision was worse than the original. The original builds, with
        // its degraded repairs, so ship it rather than fail.
        chosen = { raw: first.raw, build: first.build };
        log.tags.push('firstAttemptShipped');
      } else if (!second.ok && second.reason === 'unreachable') {
        return failActive(DESIGN_UNREACHABLE);
      } else if (!second.ok && second.reason === 'rejected') {
        return failActive(DESIGN_REJECTED);
      } else if (!second.ok && second.reason === 'refused') {
        return failActive(DESIGN_REFUSED);
      } else {
        return failActive(
          second.ok && second.build.fatal ? second.build.fatal : DESIGN_FAILED,
        );
      }

      // Salvage: drop the design stages that schema validation names, twice at
      // most. compile() should never need this; the fuzzer says it is rare.
      for (
        let round = 0;
        round < 2 && !chosen.build.validation.success;
        round++
      ) {
        const current = chosen;
        const named = new Set(
          validationIssues(current.build).flatMap((issue) => {
            if (issue.path[0] !== 'stages' || typeof issue.path[1] !== 'number')
              return [];
            const src = current.build.stageMap[issue.path[1]];
            return src && 'designIndex' in src ? [src.designIndex] : [];
          }),
        );
        if (!named.size) break;
        for (const i of named) {
          const stage = current.raw.stages[i];
          if (!stage) continue;
          salvagedIssues.push({
            severity: 'degraded',
            code: 'STAGE_SALVAGED',
            path: `stages[${i}]`,
            message: `The ${stage.kind} stage "${stage.id}" was removed because Sketch could not make it valid. Add it again in Architect if the study needs it.`,
          });
        }
        designOptions = { ...buildOptions, extraIssues: [...salvagedIssues] };
        const raw: StudyDesign = {
          ...current.raw,
          stages: current.raw.stages.filter((_, i) => !named.has(i)),
        };
        let build: BuildResult;
        try {
          build = await preflight(raw, designOptions);
        } catch (error) {
          log.tags.push('compilerBug');
          log.crash = errorMessage(error);
          return failActive(DESIGN_FAILED);
        }
        chosen = { raw, build };
        log.tags.push('salvaged');
      }
      // Salvage can remove the last stage that collects anything.
      if (chosen.build.fatal) return failActive(chosen.build.fatal);
      if (!chosen.build.validation.success) {
        log.tags.push('compilerBug');
        return failActive(DESIGN_FAILED);
      }
    }
    // ---- Burden review ------------------------------------------------------
    if (deps.review) {
      await setStep(
        'design',
        'active',
        'Reviewing the design for participant burden',
      );
      const people =
        chosen.raw.burdenEstimate?.expectedPeople || DEFAULT_PEOPLE;
      const before = estimateBurden(chosen.build.protocol, people);
      log.burden = { before };
      const reviewed = await runAttempt(
        attempts + 1,
        [
          ...firstMessages,
          { role: 'assistant', content: JSON.stringify(chosen.raw) },
          {
            role: 'user',
            content: buildReviewMessage(
              before,
              chosen.raw.burdenEstimate ?? {
                screens: 0,
                itemsPerPerson: 0,
              },
              stageCosts(chosen.build.protocol, people),
            ),
          },
        ],
        'review',
      );
      if (
        reviewed.ok &&
        !reviewed.build.retry &&
        !reviewed.build.fatal &&
        reviewed.build.validation.success
      ) {
        // The review starts from a salvaged design when salvage ran, so its
        // notes still apply to what ships.
        let build = reviewed.build;
        if (designOptions !== buildOptions) {
          try {
            build = await preflight(reviewed.raw, designOptions);
          } catch (error) {
            log.tags.push('compilerBug');
            log.crash = errorMessage(error);
            return failActive(DESIGN_FAILED);
          }
        }
        chosen = { raw: reviewed.raw, build };
        log.burden.after = estimateBurden(chosen.build.protocol, people);
        log.tags.push('reviewed');
      } else log.tags.push('reviewDiscarded');
    }
    const pre = chosen.build;
    log.shippedIssues = pre.issues
      .filter((i) => i.severity === 'degraded')
      .map((i) => i.message);
    await setStep('design', 'done', designDetail(pre));

    // ---- Step 3: wording (not fatal) -----------------------------------------
    await setStep('wording', 'active', ACTIVE_DETAIL.wording);
    const wordingRequest = buildWordingRequest(pre.design);
    const wordingResponse = await call('wording', 1, {
      model: models.wording,
      system: WORDING_SYSTEM,
      messages: buildWordingMessages(wordingRequest),
      schema: SCHEMAS.wording,
      schemaName: 'wording',
      effort: 'low',
    });
    const wordingParsed =
      wordingResponse?.stopReason === 'complete'
        ? WordingSchema.safeParse(wordingResponse.json)
        : null;
    const wording = wordingParsed?.success ? wordingParsed.data : null;
    log.wording = wording;
    if (wording) {
      await setStep('wording', 'done', wordingDetail(wordingRequest));
    } else {
      log.tags.push('wordingFailed');
      await setStep(
        'wording',
        'done',
        'Kept the draft wording from the design',
      );
    }

    // ---- Step 4: compile -----------------------------------------------------
    await setStep('compile', 'active', ACTIVE_DETAIL.compile);
    let final: BuildResult = pre;
    if (wording) {
      try {
        final = await buildProtocol(chosen.raw, wording, designOptions);
      } catch {
        final = pre;
        log.tags.push('wordingBug');
      }
    }
    await setStep('compile', 'done', compileDetail(final));

    // ---- Step 5: validate ----------------------------------------------------
    await setStep('validate', 'active', ACTIVE_DETAIL.validate);
    if (!final.validation.success) {
      // Wording only overlays strings, so this should not happen; the
      // preflight protocol is valid and ships instead.
      log.tags.push('wordingBug');
      final = pre;
    }
    log.protocolValid = final.validation.success;
    await setStep(
      'validate',
      'done',
      attempts === 1
        ? 'Passed on the first try'
        : log.tags.includes('firstAttemptShipped')
          ? 'Passed with the first design'
          : 'Passed after one revision',
    );

    return finish('succeeded', {
      result: {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the compiled input shape, already validated
        protocol: final.protocol as Record<string, unknown>,
        assets: final.assets,
        summary: final.summary,
        attempts,
        fixedIssues,
      },
    });
  }
};

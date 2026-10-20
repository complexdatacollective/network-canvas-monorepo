import { useEffect, useEffectEvent, useState } from 'react';

import { sendPreference } from '../api/client.ts';
import { ghostButton, paperButton } from '../components/buttonStyles.ts';
import { HandoffActions } from '../components/HandoffActions.tsx';
import { ScreenHeading } from '../components/ScreenHeading.tsx';
import { SiteHeader } from '../components/SiteHeader.tsx';
import { StageList } from '../components/StageList.tsx';
import { StepList } from '../components/StepList.tsx';
import { useElapsed } from '../hooks/useElapsed.ts';
import { isJobFinished, type JobRun, useJobRun } from '../hooks/useJobRun.ts';
import {
  excerpt,
  formatClock,
  formatCost,
  formatSeconds,
  plural,
} from '../lib/format.ts';
import { initialSteps, stepProgress } from '../lib/steps.ts';
import { firstQuestion } from '../lib/study.ts';
import type {
  CreateJobRequest,
  JobResult,
  JobStatus,
  Provider,
  ProviderConfig,
} from '../shared/api.ts';

// A finished run (from the Ready screen) that fills one side of the
// comparison, so only the other provider runs.
export type CompareSeed = { provider: Provider; job: JobStatus };

// Runs still going when the researcher leaves. Comparing the same study again
// picks them up instead of paying for new ones.
export type UnfinishedComparison = {
  description: string;
  comparisonId: string;
  jobIds: Partial<Record<Provider, string>>;
};

type Props = {
  description: string;
  seed?: CompareSeed | null;
  providers: ProviderConfig[];
  resume?: UnfinishedComparison | null;
  // Reports the runs still going (null once none are).
  onUnfinished: (runs: UnfinishedComparison | null) => void;
  onNew: () => void;
  // Both runs refused the description: back to the describe screen.
  onRefused: (hint: string | null) => void;
};

const CARD_STYLE: Record<Provider, { letter: string; color: string }> = {
  anthropic: { letter: 'C', color: 'bg-claude' },
  openai: { letter: 'G', color: 'bg-chatgpt' },
};

const shortLabel = (label: string, provider: ProviderConfig) =>
  label.startsWith(`${provider.label} `)
    ? label.slice(provider.label.length + 1)
    : label;

const resultOf = (run: JobRun): JobResult | null =>
  run.job?.status === 'succeeded' ? run.job.result : null;

// Stage types this run has and the other does not.
const uniqueTypes = (mine: JobResult | null, theirs: JobResult | null) => {
  if (!mine || !theirs) return new Set<string>();
  const other = new Set(theirs.summary.stages.map((stage) => stage.type));
  return new Set(
    mine.summary.stages
      .map((stage) => stage.type)
      .filter((type) => !other.has(type)),
  );
};

type CardProps = {
  provider: ProviderConfig;
  run: JobRun;
  onlyHere: ReadonlySet<string>;
  preferred: boolean;
  preferDisabled: boolean;
  // The other design is not ready, so there is nothing to compare yet.
  awaitingOther: boolean;
  onPrefer: () => void;
  onRetry: () => void;
};

const RunCard = ({
  provider,
  run,
  onlyHere,
  preferred,
  preferDisabled,
  awaitingOther,
  onPrefer,
  onRetry,
}: CardProps) => {
  const [startedAt] = useState(() => Date.now());
  const job = run.job;
  const result = resultOf(run);
  const finished =
    result !== null ||
    run.error !== null ||
    job?.status === 'failed' ||
    job?.status === 'refused';
  const elapsed = useElapsed(startedAt, !finished);
  const style = CARD_STYLE[provider.provider];
  const labels = job?.modelLabels ?? provider.models.labels;
  const steps = job?.steps.length ? job.steps : initialSteps();
  const progress = stepProgress(steps);
  const titleId = `run-${provider.provider}`;

  const failure =
    run.error ??
    (job?.status === 'failed'
      ? (job.error ?? 'Sketch could not finish this protocol.')
      : job?.status === 'refused'
        ? (job.refusalHint ??
          'This provider did not read the research questions as a study.')
        : null);

  return (
    <article
      aria-labelledby={titleId}
      className={`bg-paper text-ink shadow-card flex flex-col gap-5 rounded-[28px] p-5 sm:p-[26px] ${
        preferred ? 'outline-mustard outline-4' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`font-display text-on-light grid size-11 place-items-center rounded-[14px] text-xl font-black ${style.color}`}
          >
            {style.letter}
          </span>
          <span className="flex flex-col leading-[1.25]">
            <span
              id={titleId}
              className="font-display text-[1.375rem] font-black"
            >
              {provider.label}
            </span>
            <span className="text-ink-muted text-sm">
              {shortLabel(labels.design, provider)} design ·{' '}
              {shortLabel(labels.wording, provider)} wording
            </span>
          </span>
        </div>
        {preferred && (
          <span className="bg-night-raised rounded-full px-3 py-1.5 text-[0.8125rem] font-bold text-white">
            Your pick
          </span>
        )}
      </div>

      {result && job ? (
        <>
          <h2 className="font-display m-0 text-xl leading-[1.25] font-extrabold break-words">
            {result.summary.name}
          </h2>
          <dl className="m-0 grid grid-cols-3 gap-2.5">
            {[
              ['Time', formatSeconds(job.durationMs)],
              ['API cost', formatCost(job.usage?.costUsd)],
              ['Validation', result.attempts <= 1 ? 'First try' : '1 retry'],
            ].map(([term, value]) => (
              <div
                key={term}
                className="bg-paper-sunk min-w-0 rounded-2xl px-3 py-3 sm:px-3.5"
              >
                <dt className="text-ink-muted text-xs font-bold tracking-[0.05em] uppercase">
                  {term}
                </dt>
                <dd className="font-display m-0 mt-0.5 text-lg font-black sm:text-[1.375rem]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="text-ink-muted -mt-2 text-sm">
            {result.attempts <= 1 ? (
              <p className="m-0">Passed schema 8 validation with no retry.</p>
            ) : (
              <>
                <p className="m-0">
                  {result.fixedIssues.length > 0
                    ? `Fixed ${plural(result.fixedIssues.length, 'validation issue', 'validation issues')}, then passed:`
                    : 'Revised once, then passed schema 8 validation.'}
                </p>
                {result.fixedIssues.length > 0 && (
                  <ul className="m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5">
                    {result.fixedIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-ink-muted text-[0.8125rem] font-bold tracking-[0.06em] uppercase">
              {plural(result.summary.stageCount, 'stage', 'stages')}
            </span>
            <StageList
              stages={result.summary.stages}
              variant="paper"
              onlyHere={onlyHere}
            />
          </div>

          <div className="mt-auto flex flex-col gap-2.5">
            <HandoffActions result={result} variant="card" />
            <button
              type="button"
              aria-pressed={preferred}
              disabled={preferDisabled || awaitingOther}
              onClick={onPrefer}
              className={`${paperButton} self-start ${preferred ? 'border-night-raised bg-night-raised hover:bg-night-raised text-white' : ''}`}
            >
              {preferred ? 'Preferred' : 'Prefer this one'}
            </button>
            {awaitingOther && (
              <span className="text-ink-muted text-sm">
                You can choose once both designs are ready.
              </span>
            )}
          </div>
        </>
      ) : failure ? (
        <div
          role="alert"
          className="bg-danger-wash flex flex-col items-start gap-3 rounded-2xl px-4 py-4"
        >
          <strong className="font-display text-lg font-extrabold">
            This run did not finish
          </strong>
          <p className="m-0 text-[0.9375rem]">{failure}</p>
          <button type="button" onClick={onRetry} className={paperButton}>
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-label={`${provider.label} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              className="bg-paper-track h-2.5 overflow-hidden rounded-full"
            >
              <div
                className="bg-sea-green h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="text-ink-muted flex justify-between text-sm">
              <span>
                Step {progress.current} of {steps.length}
              </span>
              <span>Elapsed {formatClock(elapsed)}</span>
            </div>
          </div>
          <StepList steps={steps} labels={labels} compact />
        </div>
      )}
    </article>
  );
};

export const CompareScreen = ({
  description,
  seed = null,
  providers,
  resume = null,
  onUnfinished,
  onNew,
  onRefused,
}: Props) => {
  const [comparisonId] = useState(
    () => resume?.comparisonId ?? crypto.randomUUID(),
  );
  // Cleared for a provider when its run is retried, which starts a new job.
  const [resumeIds, setResumeIds] = useState(() => resume?.jobIds ?? {});
  const [preferredJobId, setPreferredJobId] = useState<string | null>(null);
  const [preferenceState, setPreferenceState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');

  const anthropic = providers.find((p) => p.provider === 'anthropic');
  const openai = providers.find((p) => p.provider === 'openai');

  // Each run's request; a new object (Try again) starts that run again.
  const makeRequest = (provider: Provider): CreateJobRequest | null =>
    providers.some((p) => p.provider === provider)
      ? {
          description,
          provider,
          comparisonId,
          ...(seed && seed.provider !== provider
            ? { seedJobId: seed.job.id }
            : {}),
        }
      : null;
  // The seeded side shows the finished run until it is retried.
  const [seeded, setSeeded] = useState<Provider | null>(seed?.provider ?? null);
  const [requests, setRequests] = useState(() => ({
    anthropic: seed?.provider === 'anthropic' ? null : makeRequest('anthropic'),
    openai: seed?.provider === 'openai' ? null : makeRequest('openai'),
  }));
  // Counts retries so each one remounts its card and restarts the clock.
  const [attempts, setAttempts] = useState<Record<Provider, number>>({
    anthropic: 0,
    openai: 0,
  });

  const anthropicLive = useJobRun(requests.anthropic, {
    resumeJobId: resumeIds.anthropic ?? null,
  });
  const openaiLive = useJobRun(requests.openai, {
    resumeJobId: resumeIds.openai ?? null,
  });

  const running = (run: JobRun) =>
    run.jobId !== null && !isJobFinished(run.job) ? run.jobId : null;
  const runningAnthropic = running(anthropicLive);
  const runningOpenai = running(openaiLive);
  const reportUnfinished = useEffectEvent(() => {
    const jobIds: UnfinishedComparison['jobIds'] = {};
    if (runningAnthropic) jobIds.anthropic = runningAnthropic;
    if (runningOpenai) jobIds.openai = runningOpenai;
    onUnfinished(
      runningAnthropic || runningOpenai
        ? { description, comparisonId, jobIds }
        : null,
    );
  });
  useEffect(() => {
    reportUnfinished();
  }, [runningAnthropic, runningOpenai]);
  const seedRun = (provider: Provider, live: JobRun): JobRun =>
    seed && seeded === provider
      ? { jobId: seed.job.id, job: seed.job, error: null }
      : live;
  const anthropicRun = seedRun('anthropic', anthropicLive);
  const openaiRun = seedRun('openai', openaiLive);
  const anthropicResult = resultOf(anthropicRun);
  const openaiResult = resultOf(openaiRun);

  const bothRefused =
    anthropicRun.job?.status === 'refused' &&
    openaiRun.job?.status === 'refused';
  const handleRefused = useEffectEvent(() => {
    onRefused(
      anthropicRun.job?.refusalHint ?? openaiRun.job?.refusalHint ?? null,
    );
  });
  useEffect(() => {
    if (bothRefused) handleRefused();
  }, [bothRefused]);

  const prefer = async (jobId: string | null) => {
    if (!jobId) return;
    const previous = preferredJobId;
    setPreferredJobId(jobId);
    setPreferenceState('saving');
    try {
      await sendPreference({ comparisonId, preferredJobId: jobId });
      setPreferenceState('saved');
    } catch {
      setPreferredJobId(previous);
      setPreferenceState('error');
    }
  };

  const cards = [
    {
      config: anthropic,
      run: anthropicRun,
      mine: anthropicResult,
      theirs: openaiResult,
    },
    {
      config: openai,
      run: openaiRun,
      mine: openaiResult,
      theirs: anthropicResult,
    },
  ];

  return (
    <>
      <SiteHeader
        lab
        onHome={onNew}
        action={
          <button type="button" onClick={onNew} className={ghostButton}>
            New study
          </button>
        }
      />
      <main className="mx-auto flex w-full max-w-[1344px] flex-col gap-7 px-4 pt-6 pb-[72px] sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex max-w-[760px] flex-col gap-2.5">
            <ScreenHeading
              focusOnMount
              className="font-display text-[clamp(2.125rem,4vw,3.25rem)] leading-[1.05] font-black tracking-[-0.02em]"
            >
              One study, two designs
            </ScreenHeading>
            <p className="text-night-text m-0 text-lg">
              Both providers got the same research questions and the same
              decision guide. Open either in Architect, and tell us which one
              you would rather start from.
            </p>
          </div>
          <blockquote className="border-night-border m-0 max-w-[460px] rounded-[18px] border-[1.5px] border-dashed px-[18px] py-3.5 text-sm text-[oklch(0.88_0.02_281)]">
            “{excerpt(firstQuestion(description), 150)}”
          </blockquote>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-6">
          {cards.map(({ config, run, mine, theirs }) =>
            config ? (
              <RunCard
                key={`${config.provider}-${attempts[config.provider]}`}
                provider={config}
                run={run}
                onlyHere={uniqueTypes(mine, theirs)}
                preferred={run.jobId !== null && run.jobId === preferredJobId}
                preferDisabled={preferenceState === 'saving'}
                awaitingOther={theirs === null}
                onPrefer={() => void prefer(run.jobId)}
                onRetry={() => {
                  if (seeded === config.provider) setSeeded(null);
                  // A job Sketch lost track of may still be running: follow
                  // it again rather than paying for another.
                  const unfinishedId = running(run);
                  setResumeIds((current) => ({
                    ...current,
                    [config.provider]: unfinishedId ?? undefined,
                  }));
                  setAttempts((current) => ({
                    ...current,
                    [config.provider]: current[config.provider] + 1,
                  }));
                  setRequests((current) => ({
                    ...current,
                    [config.provider]: makeRequest(config.provider),
                  }));
                }}
              />
            ) : null,
          )}
        </div>
        <p
          aria-live="polite"
          className="m-0 text-sm text-[oklch(0.82_0.03_281)]"
        >
          {preferenceState === 'error'
            ? 'Your pick could not be saved. Please try again.'
            : preferenceState === 'saved'
              ? 'Thanks. Your pick is saved to the log with both protocols, so we can see which provider designs better studies over time.'
              : 'Your pick is saved to the log with both protocols, so we can see which provider designs better studies over time.'}
        </p>
      </main>
    </>
  );
};

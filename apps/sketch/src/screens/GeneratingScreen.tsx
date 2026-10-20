import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { ctaButton, ghostButton } from '../components/buttonStyles.ts';
import { ArrowRightIcon } from '../components/Icons.tsx';
import { ProgressArt } from '../components/ProgressArt.tsx';
import { ScreenHeading } from '../components/ScreenHeading.tsx';
import { SiteHeader } from '../components/SiteHeader.tsx';
import { StepList } from '../components/StepList.tsx';
import { useElapsed } from '../hooks/useElapsed.ts';
import { useJobRun } from '../hooks/useJobRun.ts';
import { excerpt, formatClock } from '../lib/format.ts';
import { initialSteps, STEP_TITLES, stepProgress } from '../lib/steps.ts';
import type { CreateJobRequest, JobModels, JobStatus } from '../shared/api.ts';

type Props = {
  request: CreateJobRequest;
  // Model labels from /api/config, shown until the job reports its own.
  expectedLabels: JobModels | null;
  onCancel: () => void;
  onReady: (job: JobStatus) => void;
  onRefused: (hint: string | null) => void;
  onFailed: (message: string) => void;
};

export const GeneratingScreen = ({
  request,
  expectedLabels,
  onCancel,
  onReady,
  onRefused,
  onFailed,
}: Props) => {
  const run = useJobRun(request);
  const [startedAt] = useState(() => Date.now());
  const job = run.job;
  const succeeded = job?.status === 'succeeded' && job.result !== null;
  const elapsed = useElapsed(startedAt, !succeeded);
  const seeButton = useRef<HTMLButtonElement>(null);

  const steps = job?.steps.length ? job.steps : initialSteps();
  const labels = job?.modelLabels ?? expectedLabels;
  const progress = stepProgress(steps);
  const activeStep = steps.find((step) => step.state === 'active');

  // Hand terminal outcomes to the app.
  const settle = useEffectEvent((current: typeof run) => {
    const { job: latest } = current;
    if (current.error) {
      onFailed(current.error);
    } else if (latest?.status === 'refused') {
      onRefused(latest.refusalHint);
    } else if (latest?.status === 'failed') {
      onFailed(latest.error ?? 'Sketch could not finish this protocol.');
    } else if (latest?.status === 'succeeded' && !latest.result) {
      onFailed('Sketch finished but did not return a protocol.');
    }
  });
  useEffect(() => {
    settle(run);
  }, [run]);

  useEffect(() => {
    if (succeeded) seeButton.current?.focus();
  }, [succeeded]);

  return (
    <>
      <SiteHeader
        onHome={onCancel}
        action={
          <button type="button" onClick={onCancel} className={ghostButton}>
            Cancel
          </button>
        }
      />
      <main className="mx-auto flex w-full max-w-[1344px] flex-col gap-12 px-4 pt-6 pb-[72px] sm:px-8 lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-7">
          <div className="flex flex-col gap-2.5">
            <ScreenHeading
              focusOnMount
              className="font-display text-[clamp(2.25rem,4vw,3.25rem)] leading-[1.05] font-black tracking-[-0.02em]"
            >
              {succeeded
                ? 'Your protocol is ready'
                : 'Sketching your interview'}
            </ScreenHeading>
            <p aria-live="polite" className="text-night-text m-0 text-lg">
              {succeeded
                ? 'It passed validation and is ready to open in Architect.'
                : 'Hang on while Sketch designs, writes and checks your protocol. You can keep this tab in the background.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-label="Generation progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              className="bg-night-tile h-2.5 overflow-hidden rounded-full"
            >
              <div
                className="bg-sea-green h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="text-night-muted flex justify-between text-sm">
              <span>
                Step {progress.current} of {steps.length}
              </span>
              <span>Elapsed {formatClock(elapsed)}</span>
            </div>
            <p aria-live="polite" className="sr-only">
              {succeeded
                ? 'All five steps are done.'
                : activeStep
                  ? `Step ${progress.current} of ${steps.length}: ${STEP_TITLES[activeStep.id]}`
                  : ''}
            </p>
          </div>

          <StepList steps={steps} labels={labels} />

          {succeeded && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5">
              <button
                ref={seeButton}
                type="button"
                onClick={() => onReady(job)}
                className={ctaButton}
              >
                See your protocol
                <ArrowRightIcon />
              </button>
            </div>
          )}
        </div>

        <aside
          aria-label="Your study so far"
          className="flex min-w-0 flex-col gap-5"
        >
          <ProgressArt doneCount={progress.done} />
          <div className="border-night-border flex flex-col gap-2 rounded-3xl border-[1.5px] border-dashed px-[22px] py-5">
            <span className="text-night-muted text-[0.8125rem] font-bold tracking-[0.06em] uppercase">
              Your description
            </span>
            <p className="m-0 text-[0.9375rem] text-[oklch(0.9_0.02_281)]">
              {excerpt(request.description)}
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="text-mustard hover:text-mustard-light min-h-11 cursor-pointer self-start border-0 bg-transparent p-0 font-[inherit] text-[0.9375rem] font-semibold underline"
            >
              Edit and start again
            </button>
          </div>
        </aside>
      </main>
    </>
  );
};

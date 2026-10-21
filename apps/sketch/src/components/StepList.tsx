import { STEP_TITLES, stepWho } from '../lib/steps.ts';
import type { JobModels, JobStep, StepState } from '../shared/api.ts';

const STATE_TEXT: Record<StepState, string> = {
  pending: 'Waiting',
  active: 'In progress',
  done: 'Done',
  failed: 'Failed',
};

const StepIcon = ({ state }: { state: StepState }) => {
  if (state === 'done') {
    return (
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="16" cy="16" r="15" className="fill-sea-green" />
        <path
          d="m10 16.5 4 4 8-9"
          fill="none"
          className="stroke-on-light"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === 'active') {
    return (
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        className="motion-safe:animate-spin"
      >
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          className="stroke-[oklch(0.9_0.04_86.39)]"
          strokeWidth="4"
        />
        <path
          d="M16 3 A13 13 0 0 1 29 16"
          fill="none"
          className="stroke-[oklch(0.62_0.15_70)]"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (state === 'failed') {
    return (
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="16" cy="16" r="15" className="fill-danger" />
        <path
          d="M11 11l10 10M21 11 11 21"
          fill="none"
          className="stroke-white"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        className="stroke-[oklch(0.86_0.015_281)]"
        strokeWidth="3"
      />
    </svg>
  );
};

type Props = {
  steps: JobStep[];
  labels: JobModels | null;
  compact?: boolean;
};

const rowTone = (state: StepState) => {
  if (state === 'active') return 'bg-mustard-wash';
  if (state === 'failed') return 'bg-danger-wash';
  if (state === 'pending') return 'opacity-75';
  return '';
};

export const StepList = ({ steps, labels, compact = false }: Props) => (
  <ol
    className={`text-ink m-0 list-none overflow-hidden p-0 ${
      compact
        ? 'border-paper-rule rounded-2xl border bg-white'
        : 'bg-paper shadow-card rounded-[28px]'
    }`}
  >
    {steps.map((step, index) => (
      <li
        key={step.id}
        aria-current={step.state === 'active' ? 'step' : undefined}
        className={`flex items-start ${compact ? 'gap-3 px-3.5 py-3' : 'gap-3 px-4 py-[18px] sm:gap-[18px] sm:px-[26px] sm:py-[22px]'} ${
          index === 0 ? '' : 'border-paper-rule border-t'
        } ${rowTone(step.state)}`}
      >
        <span
          className={`mt-px grid flex-none place-items-center ${compact ? 'size-6 [&>svg]:size-6' : 'size-8'}`}
        >
          <StepIcon state={step.state} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span
              className={`font-display font-extrabold ${compact ? 'text-base' : 'text-[1.1875rem]'}`}
            >
              {STEP_TITLES[step.id]}
              <span className="sr-only">, {STATE_TEXT[step.state]}</span>
            </span>
            <span className="bg-paper-sunk rounded-full px-2.5 py-[3px] text-[0.8125rem] font-bold text-[oklch(0.38_0.07_281)]">
              {stepWho(step.id, labels)}
            </span>
          </div>
          <span
            className={`text-ink-muted ${compact ? 'text-sm' : 'text-[0.9375rem]'}`}
          >
            {step.detail}
          </span>
        </div>
      </li>
    ))}
  </ol>
);

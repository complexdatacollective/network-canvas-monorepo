import { createElement } from 'react';

import { ghostButton } from '../components/buttonStyles.ts';
import { HandoffActions } from '../components/HandoffActions.tsx';
import { PlusIcon } from '../components/Icons.tsx';
import { ScreenHeading } from '../components/ScreenHeading.tsx';
import { SiteHeader } from '../components/SiteHeader.tsx';
import { StageList } from '../components/StageList.tsx';
import { ARCHITECT_URL } from '../handoff/architectUrl.ts';
import { formatSeconds, listOf, plural } from '../lib/format.ts';
import { stageTypeStyle } from '../lib/stageTypes.ts';
import type { JobResult, JobStatus, ProtocolSummary } from '../shared/api.ts';

type Props = {
  job: JobStatus;
  result: JobResult;
  // The other provider's label ("ChatGPT") when it can run a comparison.
  compareWith: string | null;
  onNew: () => void;
  onEdit: () => void;
  onCompare: () => void;
};

const summaryChips = (summary: ProtocolSummary): string[] => {
  const chips = [plural(summary.stageCount, 'stage', 'stages')];
  if (summary.nodeTypes.length > 0) chips.push(listOf(summary.nodeTypes));
  if (summary.edgeTypes.length > 0) {
    chips.push(
      plural(summary.edgeTypes.length, 'relationship', 'relationships'),
    );
  }
  if (summary.rosterCount > 0) {
    chips.push(
      plural(summary.rosterCount, 'placeholder roster', 'placeholder rosters'),
    );
  }
  chips.push('Schema 9');
  return chips;
};

const validityText = (attempts: number) =>
  attempts <= 1 ? 'valid on the first try' : 'valid after one revision';

const PREVIEW_COUNT = 5;

const architectHost = (() => {
  try {
    return new URL(ARCHITECT_URL).host;
  } catch {
    return 'architect.networkcanvas.com';
  }
})();

const linkButton =
  'min-h-11 cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-mustard underline hover:text-mustard-light';

export const ReadyScreen = ({
  job,
  result,
  compareWith,
  onNew,
  onEdit,
  onCompare,
}: Props) => {
  const { summary } = result;
  const preview = summary.stages.slice(0, PREVIEW_COUNT);
  const more = summary.stages.length - preview.length;

  return (
    <>
      <SiteHeader
        onHome={onNew}
        action={
          <button type="button" onClick={onNew} className={ghostButton}>
            <PlusIcon size={16} />
            New study
          </button>
        }
      />
      <main className="mx-auto flex w-full max-w-[1344px] flex-col gap-12 px-4 pt-6 pb-[72px] sm:px-8 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-7">
          <div className="flex flex-col gap-4">
            <span className="bg-sea-green text-on-light inline-flex items-center gap-2 self-start rounded-full py-1.5 pr-3.5 pl-2 text-sm font-bold">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="12" cy="12" r="11" className="fill-on-light" />
                <path
                  d="m7.5 12.5 3 3 6-7"
                  fill="none"
                  className="stroke-sea-green"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Ready · passed validation
            </span>
            <ScreenHeading
              focusOnMount
              className="font-display text-title font-black tracking-[-0.02em] break-words"
            >
              {summary.name}
            </ScreenHeading>
            <ul
              aria-label="Protocol summary"
              className="m-0 flex list-none flex-wrap gap-2 p-0"
            >
              {summaryChips(summary).map((chip) => (
                <li
                  key={chip}
                  className="bg-night-raised rounded-[10px] px-3 py-1.5 text-sm text-[oklch(0.9_0.02_281)]"
                >
                  {chip}
                </li>
              ))}
            </ul>
          </div>

          <HandoffActions result={result} variant="page" />

          <section
            aria-labelledby="inside"
            className="border-night-line bg-night-panel flex flex-col gap-4 rounded-[28px] border p-4 sm:p-6"
          >
            <h2
              id="inside"
              className="font-display m-0 text-[1.1875rem] font-extrabold"
            >
              The interview, stage by stage
            </h2>
            <StageList stages={summary.stages} variant="night" />
          </section>

          <div className="flex flex-wrap justify-between gap-x-6 gap-y-3 text-sm text-[oklch(0.82_0.03_281)]">
            <span>
              Designed by {job.modelLabels.design} · worded by{' '}
              {job.modelLabels.wording} · {formatSeconds(job.durationMs)} ·{' '}
              {validityText(result.attempts)}
            </span>
            <span className="flex flex-wrap gap-x-5 gap-y-2">
              <button type="button" onClick={onEdit} className={linkButton}>
                Edit the study
              </button>
              {compareWith && (
                <button
                  type="button"
                  onClick={onCompare}
                  className={linkButton}
                >
                  Compare with {compareWith}
                </button>
              )}
            </span>
          </div>
        </div>

        <aside
          aria-label="Where your protocol goes next"
          className="flex min-w-0 flex-col gap-3.5"
        >
          <div className="text-ink relative overflow-hidden rounded-[22px] bg-[oklch(0.9593_0.009_281)] shadow-[0_30px_60px_-20px_oklch(0.1_0.06_281),0_0_0_1px_oklch(0.45_0.08_281)]">
            <div className="bg-paper-line flex items-center gap-2.5 px-4 py-3">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="bg-danger size-[11px] rounded-full" />
                <span className="bg-mustard size-[11px] rounded-full" />
                <span className="size-[11px] rounded-full bg-[oklch(0.7_0.2_150)]" />
              </span>
              <span className="bg-paper min-w-0 flex-1 truncate rounded-lg px-3 py-1 text-[0.8125rem] text-[oklch(0.4_0.05_281)]">
                {architectHost}
              </span>
            </div>
            <div className="flex flex-col gap-3.5 px-[22px] pt-5 pb-[26px]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display min-w-0 truncate text-[1.0625rem] leading-[1.2] font-black">
                  {summary.name}
                </span>
                <span className="bg-neon-coral flex-none rounded-full px-2.5 py-1 text-xs font-bold text-white">
                  Preview
                </span>
              </div>
              <div className="relative flex flex-col gap-2.5 pl-7">
                <span
                  aria-hidden="true"
                  className="bg-neon-coral absolute top-1.5 bottom-1.5 left-[9px] w-1 rounded-sm"
                />
                {preview.map((stage, index) => {
                  const style = stageTypeStyle(stage.type);
                  return (
                    <div
                      key={`${index}-${stage.label}`}
                      className="relative flex items-center gap-3 rounded-[14px] bg-white px-3 py-2.5 shadow-[0_1px_0_oklch(0.88_0.015_281)]"
                    >
                      <span
                        aria-hidden="true"
                        className="border-neon-coral absolute -left-[25px] size-3.5 rounded-full border-[3px] bg-white"
                      />
                      <span
                        aria-hidden="true"
                        className="grid size-[30px] flex-none place-items-center rounded-[10px]"
                        style={style.swatch}
                      >
                        {style.icon &&
                          createElement(style.icon, { className: 'size-4' })}
                      </span>
                      <span className="min-w-0 truncate text-sm font-bold">
                        {stage.label}
                      </span>
                    </div>
                  );
                })}
                {more > 0 && (
                  <span className="text-ink-muted pl-1 text-[0.8125rem]">
                    and {plural(more, 'more stage', 'more stages')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <p className="m-0 text-sm text-[oklch(0.84_0.03_281)]">
            Architect opens with your protocol loaded. Nothing is saved on our
            side beyond the log described on the start page.
          </p>
        </aside>
      </main>
    </>
  );
};

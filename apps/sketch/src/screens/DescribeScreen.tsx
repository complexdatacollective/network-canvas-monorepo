import { type FormEvent, useId, useRef } from 'react';

import { ctaButton } from '../components/buttonStyles.ts';
import { HeroArt, PhoneArt } from '../components/HeroArt.tsx';
import {
  ArrowRightIcon,
  CheckIcon,
  InfoIcon,
  LockIcon,
} from '../components/Icons.tsx';
import { NotAStudyNotice } from '../components/NotAStudyNotice.tsx';
import { ScreenHeading } from '../components/ScreenHeading.tsx';
import { SiteHeader } from '../components/SiteHeader.tsx';
import { EXAMPLES } from '../lib/examples.ts';
import {
  type DesignTier,
  MAX_DESCRIPTION_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  type Provider,
  type ProviderConfig,
} from '../shared/api.ts';

export type DescribeForm = {
  description: string;
  // The example the text came from, until the researcher edits it.
  picked: string | null;
  provider: Provider;
  tier: DesignTier;
  compare: boolean;
};

export type ConfigState =
  | { status: 'loading' }
  | { status: 'ready'; providers: ProviderConfig[] }
  | { status: 'error'; message: string };

type Props = {
  form: DescribeForm;
  onChange: (form: DescribeForm) => void;
  config: ConfigState;
  onRetryConfig: () => void;
  // Set when the last description was refused as not a study.
  refusal: { hint: string | null } | null;
  onGenerate: () => void;
  focusHeading: boolean;
};

const PROVIDER_DOTS: Record<Provider, string> = {
  anthropic: 'bg-[oklch(0.66_0.16_45)]',
  openai: 'bg-[oklch(0.6_0.12_171.52)]',
};

// "Claude Sonnet 5.5" reads as "Sonnet 5.5" next to the Claude toggle.
const shortLabel = (label: string, provider: ProviderConfig) =>
  label.startsWith(`${provider.label} `)
    ? label.slice(provider.label.length + 1)
    : label;

const selectClass =
  'min-h-11 cursor-pointer rounded-xl border-[1.5px] border-[oklch(0.86_0.015_281)] bg-white px-3 font-[inherit] text-sm font-semibold text-ink-strong';

const countLine = (length: number, trimmed: number) => {
  if (trimmed > 0 && trimmed < MIN_DESCRIPTION_LENGTH) {
    return `${length} characters · write at least ${MIN_DESCRIPTION_LENGTH} to get started`;
  }
  if (length > MAX_DESCRIPTION_LENGTH - 500) {
    return `${length} of ${MAX_DESCRIPTION_LENGTH} characters`;
  }
  return `${length} characters · vague is fine, Sketch fills gaps with defaults`;
};

const INCLUDES = [
  'A codebook of node types, relationships and variables, with input controls chosen to fit each question',
  'Stages in a sensible order, with titles, prompts, intro screens and skip logic written for participants',
  'Placeholder roster files and a test map key where your design needs them',
];

const STEPS = [
  {
    title: 'Describe it in your own words',
    text: 'A sentence or a page. Sketch never asks follow-up questions; where your description is quiet, it picks sensible defaults.',
    badge: 'bg-neon-coral text-white',
  },
  {
    title: 'Sketch designs the interview',
    text: 'It chooses the stages, builds the codebook, writes every prompt, and checks the result against the Network Canvas protocol schema before you see it.',
    badge: 'bg-mustard text-night',
  },
  {
    title: 'Refine it in Architect',
    text: 'The protocol opens in Architect in a new tab. Change anything, add your own media, then run it in Interviewer or Fresco.',
    badge: 'bg-sea-green text-night',
  },
];

export const DescribeScreen = ({
  form,
  onChange,
  config,
  onRetryConfig,
  refusal,
  onGenerate,
  focusHeading,
}: Props) => {
  const hintId = useId();
  const countId = useId();
  const refusalId = useId();
  const textareaId = useId();
  const firstExample = useRef<HTMLButtonElement>(null);

  const providers = config.status === 'ready' ? config.providers : [];
  const available = providers.filter((p) => p.available);
  const current = providers.find((p) => p.provider === form.provider);
  const canCompare = available.length >= 2;
  const comparing = form.compare && canCompare;
  const trimmed = form.description.trim().length;
  const ready =
    config.status === 'ready' &&
    (comparing || current?.available === true) &&
    trimmed >= MIN_DESCRIPTION_LENGTH &&
    trimmed <= MAX_DESCRIPTION_LENGTH &&
    !refusal;

  const update = (patch: Partial<DescribeForm>) =>
    onChange({ ...form, ...patch });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) onGenerate();
  };

  const tierModels = current?.models[form.tier];
  const hasTierChoice =
    current !== undefined &&
    current.models.standard.design !== current.models.strong.design;

  return (
    <>
      <SiteHeader home />
      <main className="mx-auto w-full max-w-[1344px] px-4 pt-1 sm:px-8 sm:pt-8">
        <div className="flex flex-col gap-12 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-[22px] sm:gap-7">
            <div className="-mx-4 sm:hidden">
              <PhoneArt />
            </div>
            <div className="flex flex-col gap-3 sm:gap-5">
              <span className="bg-night-raised hidden items-center gap-2 self-start rounded-full border border-[oklch(0.42_0.08_281)] px-3.5 py-1.5 text-[0.8125rem] font-semibold text-[oklch(0.9_0.03_281)] sm:inline-flex">
                <span className="bg-sea-green size-2 rounded-full" />
                Experimental · builds schema 8 protocols
              </span>
              <ScreenHeading
                focusOnMount={focusHeading}
                className="font-display sm:text-hero text-[2.5rem] leading-[1.04] font-black tracking-[-0.025em]"
              >
                Describe your study.
                <br className="max-sm:hidden" /> Get an{' '}
                <span className="text-mustard relative inline-block">
                  interview.
                  <svg
                    viewBox="0 0 300 24"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                    className="absolute -bottom-3.5 left-0 hidden h-5 w-full sm:block"
                  >
                    <path
                      d="M4 16 C 60 6, 140 4, 200 9 S 280 16, 296 8"
                      fill="none"
                      className="stroke-mustard"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </ScreenHeading>
              <p className="m-0 max-w-[640px] text-[1.0625rem] leading-[1.55] text-[oklch(0.88_0.025_281)] sm:text-[1.1875rem]">
                Write a few sentences about your research. Sketch designs a
                complete Network Canvas interview, with the people to ask about,
                the questions to ask and the screens to draw them on, and opens
                it in Architect ready to refine.
              </p>
            </div>

            <form
              aria-label="Study description"
              onSubmit={submit}
              className="bg-paper text-ink shadow-card-lip flex flex-col gap-3.5 rounded-3xl p-[18px] scheme-light sm:gap-[18px] sm:rounded-[28px] sm:p-7"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={textareaId}
                  className="font-display text-xl font-extrabold sm:text-[1.375rem]"
                >
                  Describe your study
                </label>
                <span
                  id={hintId}
                  className="text-sm text-[oklch(0.42_0.06_281)] sm:text-[0.9375rem]"
                >
                  Who will you interview, which relationships matter, and what
                  do you want to know about the people they name?
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <textarea
                  id={textareaId}
                  rows={7}
                  value={form.description}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  aria-describedby={`${hintId} ${countId}${refusal ? ` ${refusalId}` : ''}`}
                  aria-invalid={refusal ? true : undefined}
                  onChange={(event) =>
                    update({ description: event.target.value, picked: null })
                  }
                  placeholder="For example: I want to understand how first-year students form friendships, and whether their friends' drinking is linked to their own wellbeing…"
                  className={`font-body text-ink-strong block min-h-[188px] w-full resize-y rounded-[18px] border-2 bg-white px-4 py-3.5 text-base leading-[1.6] placeholder:text-[oklch(0.55_0.03_281)] sm:px-5 sm:py-[18px] sm:text-[1.0625rem] ${
                    refusal ? 'border-tangerine' : 'border-paper-line'
                  }`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[0.8125rem] text-[oklch(0.45_0.05_281)]">
                  <span id={countId}>
                    {countLine(form.description.length, trimmed)}
                  </span>
                  {form.description.length > 0 && (
                    <button
                      type="button"
                      onClick={() => update({ description: '', picked: null })}
                      className="min-h-8 cursor-pointer rounded-md border-0 bg-transparent px-1.5 font-[inherit] font-semibold text-[oklch(0.42_0.1_281)]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {refusal && (
                <NotAStudyNotice
                  id={refusalId}
                  hint={refusal.hint}
                  onTryExample={() => firstExample.current?.focus()}
                />
              )}

              <div className="flex flex-col gap-2.5">
                <span className="text-xs font-bold tracking-[0.06em] text-[oklch(0.45_0.05_281)] uppercase sm:text-[0.8125rem]">
                  Or start from an example
                </span>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((example, index) => {
                    const on = form.picked === example.id;
                    return (
                      <button
                        key={example.id}
                        ref={index === 0 ? firstExample : undefined}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          update({
                            description: example.text,
                            picked: example.id,
                          })
                        }
                        className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 font-[inherit] text-sm font-semibold ${
                          on
                            ? 'border-night-raised bg-night-raised text-white'
                            : 'text-ink hover:border-night-raised border-[oklch(0.86_0.015_281)] bg-white'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-2.5 rounded-full ${example.dot}`}
                        />
                        {example.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-paper-rule h-px" />

              {config.status === 'error' && (
                <div
                  role="alert"
                  className="bg-danger-wash flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm"
                >
                  <InfoIcon size={20} className="text-danger flex-none" />
                  <span className="flex-1">{config.message}</span>
                  <button
                    type="button"
                    onClick={onRetryConfig}
                    className="border-paper-line text-ink min-h-11 cursor-pointer rounded-full border-[1.5px] bg-white px-4 font-[inherit] font-bold"
                  >
                    Try again
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-[18px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-[18px]">
                  <div
                    role="group"
                    aria-label="Model provider"
                    aria-busy={config.status === 'loading'}
                    className={`bg-paper-track flex rounded-full p-1 sm:inline-flex ${comparing ? 'opacity-60' : ''}`}
                  >
                    {(providers.length > 0
                      ? providers
                      : ([
                          {
                            provider: 'anthropic',
                            label: 'Claude',
                            available: false,
                          },
                          {
                            provider: 'openai',
                            label: 'ChatGPT',
                            available: false,
                          },
                        ] satisfies Pick<
                          ProviderConfig,
                          'provider' | 'label' | 'available'
                        >[])
                    ).map((p) => {
                      const on = form.provider === p.provider && !comparing;
                      return (
                        <button
                          key={p.provider}
                          type="button"
                          aria-pressed={on}
                          disabled={!p.available}
                          title={
                            config.status === 'ready' && !p.available
                              ? `${p.label} is not available right now`
                              : undefined
                          }
                          onClick={() =>
                            update({ provider: p.provider, compare: false })
                          }
                          className={`inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-4 font-[inherit] text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none ${
                            on
                              ? 'bg-night-raised shadow-seg text-white'
                              : 'bg-transparent text-[oklch(0.36_0.07_281)]'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`size-2 rounded-full ${PROVIDER_DOTS[p.provider]}`}
                          />
                          {p.label}
                          {config.status === 'ready' && !p.available && (
                            <span className="sr-only"> (not available)</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {current && tierModels && (
                    <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-start sm:gap-[18px]">
                      {hasTierChoice ? (
                        <label className="inline-flex items-center gap-2 text-sm text-[oklch(0.38_0.06_281)]">
                          Design
                          <select
                            value={form.tier}
                            onChange={(event) =>
                              update({
                                tier:
                                  event.target.value === 'strong'
                                    ? 'strong'
                                    : 'standard',
                              })
                            }
                            className={selectClass}
                          >
                            <option value="standard">
                              {shortLabel(
                                current.models.standard.labels.design,
                                current,
                              )}
                            </option>
                            <option value="strong">
                              {shortLabel(
                                current.models.strong.labels.design,
                                current,
                              )}
                            </option>
                          </select>
                        </label>
                      ) : (
                        <span className="text-sm text-[oklch(0.38_0.06_281)]">
                          Design ·{' '}
                          {shortLabel(tierModels.labels.design, current)}
                        </span>
                      )}
                      <span className="text-ink-muted text-sm">
                        Wording ·{' '}
                        {shortLabel(tierModels.labels.wording, current)}
                      </span>
                    </div>
                  )}

                  {canCompare && (
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-[oklch(0.34_0.08_281)] sm:text-[0.9375rem]">
                      <input
                        type="checkbox"
                        checked={form.compare}
                        onChange={(event) =>
                          update({ compare: event.target.checked })
                        }
                        className="accent-slate-blue size-5 cursor-pointer"
                      />
                      Run both and compare
                    </label>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!ready}
                  className={`${ctaButton} w-full sm:w-auto`}
                >
                  {comparing ? 'Generate with both' : 'Generate protocol'}
                  <ArrowRightIcon />
                </button>
              </div>
            </form>

            <div className="flex max-w-[760px] items-start gap-3 text-sm text-[oklch(0.84_0.03_281)]">
              <LockIcon className="mt-px flex-none" />
              <p className="m-0">
                Sketch keeps a log of every description and the protocol it
                generates, so we can improve it. Please leave out names and
                anything that could identify a real person.{' '}
                <a href="#what-we-keep">What we keep</a>
              </p>
            </div>
          </div>

          <aside
            aria-label="What Sketch builds"
            className="hidden min-w-0 flex-col gap-6 lg:flex"
          >
            <HeroArt />
            <div className="border-night-line bg-night-panel flex flex-col gap-3.5 rounded-3xl border p-6">
              <h2 className="font-display m-0 text-[1.1875rem] font-extrabold">
                Every protocol includes
              </h2>
              <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[0.9375rem] text-[oklch(0.88_0.025_281)]">
                {INCLUDES.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckIcon className="text-sea-green mt-0.5 flex-none" />
                    <span>{item}</span>
                  </li>
                ))}
                <li className="flex items-start gap-3">
                  <InfoIcon className="text-mustard mt-0.5 flex-none" />
                  <span>
                    Images, audio and video are left for you to add in Architect
                  </span>
                </li>
              </ul>
            </div>
          </aside>
        </div>

        <section
          id="how"
          aria-labelledby="how-title"
          className="flex scroll-mt-6 flex-col gap-3 pt-10 pb-12 sm:gap-8 sm:pt-24 sm:pb-[72px]"
        >
          <h2
            id="how-title"
            className="font-display m-0 text-[1.625rem] font-black tracking-[-0.015em] sm:text-4xl"
          >
            How it works
          </h2>
          <ol className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] sm:gap-5">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="border-night-line bg-night-panel flex gap-3.5 rounded-[20px] border p-4 sm:flex-col sm:rounded-3xl sm:p-7"
              >
                <span
                  aria-hidden="true"
                  className={`font-display grid size-10 flex-none place-items-center rounded-[13px] text-[1.1875rem] font-black sm:size-12 sm:rounded-2xl sm:text-[1.375rem] ${step.badge}`}
                >
                  {index + 1}
                </span>
                <span className="flex flex-col gap-0.5 sm:gap-3.5">
                  <h3 className="font-display m-0 text-[1.0625rem] font-extrabold sm:text-[1.3125rem]">
                    {step.title}
                  </h3>
                  <p className="text-night-text m-0 text-[0.9375rem] sm:text-base">
                    {step.text}
                  </p>
                </span>
              </li>
            ))}
          </ol>
          <div
            id="what-we-keep"
            className="border-night-border text-night-text flex max-w-[760px] scroll-mt-6 flex-col gap-2 rounded-3xl border-[1.5px] border-dashed px-[22px] py-5 text-[0.9375rem]"
          >
            <h3 className="font-display m-0 text-lg font-extrabold text-white">
              What we keep
            </h3>
            <p className="m-0">
              For every run, Sketch logs the description you wrote, the protocol
              it generated, the models it used, how long it took and what it
              cost. When you compare two designs, it also logs which one you
              preferred. We read these logs to make Sketch better. Nothing else
              is stored, and Sketch never sees what happens in Architect.
            </p>
          </div>
        </section>
      </main>
      <footer className="border-night-dot border-t">
        <div className="text-night-muted mx-auto flex max-w-[1344px] flex-wrap justify-between gap-3 px-4 py-6 text-sm sm:px-8">
          <span>Sketch is an experiment from the Network Canvas project.</span>
          <a href="https://networkcanvas.com">networkcanvas.com</a>
        </div>
      </footer>
    </>
  );
};

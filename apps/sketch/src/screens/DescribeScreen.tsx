import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { ctaButton } from '../components/buttonStyles.ts';
import { Faq, WHAT_WE_KEEP } from '../components/Faq.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import {
  ArrowRightIcon,
  CloseIcon,
  InfoIcon,
  LockIcon,
  PlusIcon,
} from '../components/Icons.tsx';
import { NotAStudyNotice } from '../components/NotAStudyNotice.tsx';
import { ScreenHeading } from '../components/ScreenHeading.tsx';
import { SiteHeader } from '../components/SiteHeader.tsx';
import { EXAMPLES } from '../lib/examples.ts';
import {
  filledQuestions,
  MAX_QUESTION_LENGTH,
  MAX_POPULATION_LENGTH,
  MAX_QUESTIONS,
  MAX_SYNOPSIS_LENGTH,
  MIN_POPULATION_LENGTH,
  MIN_QUESTION_LENGTH,
  studyIsComplete,
} from '../lib/study.ts';
import { type Provider, type ProviderConfig } from '../shared/api.ts';

export type DescribeForm = {
  questions: string[];
  population: string;
  synopsis: string;
  // The example the text came from, until the researcher edits it.
  picked: string | null;
  provider: Provider;
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
  // A run of this exact study is still going; Generate picks it up again.
  resumable: boolean;
  focusHeading: boolean;
};

const PROVIDER_DOTS: Record<Provider, string> = {
  anthropic: 'bg-[oklch(0.66_0.16_45)]',
  openai: 'bg-[oklch(0.6_0.12_171.52)]',
};

// "Claude Opus 5.5" reads as "Opus 5.5" next to the Claude toggle.
const shortLabel = (label: string, provider: ProviderConfig) =>
  label.startsWith(`${provider.label} `)
    ? label.slice(provider.label.length + 1)
    : label;

const NO_PROVIDERS_MESSAGE =
  'Sketch cannot generate protocols right now because no model provider is set up. Try again later.';

const questionsLine = (questions: string[]) => {
  const filled = filledQuestions(questions);
  if (filled.some((q) => q.length < MIN_QUESTION_LENGTH)) {
    return `Each research question needs at least ${MIN_QUESTION_LENGTH} characters.`;
  }
  if (filled.length === 0) return 'Add at least one research question.';
  return filled.length === 1
    ? '1 research question'
    : `${filled.length} research questions`;
};

const synopsisLine = (length: number) =>
  length > MAX_SYNOPSIS_LENGTH - 500
    ? `${length} of ${MAX_SYNOPSIS_LENGTH} characters`
    : `${length} characters`;

const textareaClass =
  'font-body text-ink-strong block w-full resize-y rounded-[18px] border-2 bg-white px-4 py-3 text-base leading-[1.6] placeholder:text-[oklch(0.55_0.03_281)] sm:px-5 sm:py-3.5 sm:text-[1.0625rem]';

const STEPS = [
  {
    title: 'State your research questions',
    text: 'Add a synopsis of the study as you would in a proposal or paper. Population, design, reference periods and instruments you specify are kept as written.',
    badge: 'bg-neon-coral text-white',
  },
  {
    title: 'Sketch designs the interview',
    text: 'It derives who participants name, the relationships among them and the measures each question needs, builds the codebook and stages, and checks the result against the Network Canvas protocol schema.',
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
  resumable,
  focusHeading,
}: Props) => {
  const questionsHintId = useId();
  const questionsCountId = useId();
  const synopsisHintId = useId();
  const synopsisCountId = useId();
  const refusalId = useId();
  const synopsisId = useId();
  const populationId = useId();
  const populationHintId = useId();
  const populationCountId = useId();
  const firstExample = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const questionInputs = useRef<(HTMLTextAreaElement | null)[]>([]);
  // The question to focus once the list re-renders after an add or a remove.
  const focusQuestion = useRef<number | null>(null);

  useEffect(() => {
    if (focusQuestion.current === null) return;
    const target = questionInputs.current[focusQuestion.current];
    focusQuestion.current = null;
    (target ?? addButton.current)?.focus();
  });

  const providers = config.status === 'ready' ? config.providers : [];
  const available = providers.filter((p) => p.available);
  const current = providers.find((p) => p.provider === form.provider);
  const canCompare = available.length >= 2;
  // Config loaded, but no provider has a key: say so rather than leave a
  // dead Generate button.
  const noProviders = config.status === 'ready' && available.length === 0;
  const comparing = form.compare && canCompare;
  const ready =
    config.status === 'ready' &&
    (comparing || current?.available === true) &&
    studyIsComplete(form) &&
    !refusal;

  const update = (patch: Partial<DescribeForm>) =>
    onChange({ ...form, ...patch });

  const setQuestion = (index: number, value: string) =>
    update({
      questions: form.questions.map((q, i) => (i === index ? value : q)),
      picked: null,
    });
  const addQuestion = () => {
    focusQuestion.current = form.questions.length;
    update({ questions: [...form.questions, ''], picked: null });
  };
  const removeQuestion = (index: number) => {
    focusQuestion.current = Math.max(0, index - 1);
    update({
      questions: form.questions.filter((_, i) => i !== index),
      picked: null,
    });
  };
  const hasText =
    form.questions.some((q) => q.trim()) ||
    form.population.trim().length > 0 ||
    form.synopsis.trim().length > 0;
  const populationLength = form.population.trim().length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) onGenerate();
  };

  const labels = current?.models.labels;

  // FAQ items open on the page. A visit to #what-we-keep opens that answer.
  const [faqOpen, setFaqOpen] = useState<string[]>(() =>
    typeof window !== 'undefined' && window.location.hash === `#${WHAT_WE_KEEP}`
      ? [WHAT_WE_KEEP]
      : [],
  );
  const openWhatWeKeep = () =>
    setFaqOpen((open) =>
      open.includes(WHAT_WE_KEEP) ? open : [...open, WHAT_WE_KEEP],
    );

  return (
    <>
      <SiteHeader home />
      <main className="mx-auto w-full max-w-[1344px] px-4 pt-1 sm:px-8 sm:pt-8">
        <div className="grid grid-cols-1 gap-x-14 gap-y-7 sm:gap-y-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:gap-x-16">
          <div className="flex min-w-0 flex-col gap-3.5 sm:gap-5 lg:col-start-1 lg:row-start-1">
            <span className="bg-night-raised inline-flex items-center gap-2 self-start rounded-full border border-[oklch(0.42_0.08_281)] px-3.5 py-1.5 text-[0.8125rem] font-semibold text-[oklch(0.9_0.03_281)]">
              <span
                aria-hidden="true"
                className="bg-sea-green size-2 rounded-full"
              />
              Experimental · builds schema 9 protocols
            </span>
            <ScreenHeading
              focusOnMount={focusHeading}
              className="font-display sm:text-hero text-[2.5rem] leading-[1.04] font-black tracking-[-0.025em]"
            >
              From research questions to a{' '}
              <span className="text-mustard relative inline-block">
                protocol.
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
            <p className="m-0 max-w-[620px] text-[1.0625rem] leading-[1.55] text-[oklch(0.88_0.025_281)] sm:text-[1.1875rem]">
              Enter your research questions and a synopsis of the study. Sketch
              derives the alters, ties and measures they call for, designs a
              complete Network Canvas interview, and opens it in Architect for
              you to review and refine.
            </p>
          </div>

          <figure className="m-0 flex min-w-0 flex-col items-center gap-3 lg:sticky lg:top-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:pt-2">
            <div className="w-full max-w-[460px] lg:max-w-none">
              <HeroArt />
            </div>
            <figcaption className="text-night-muted flex max-w-[400px] flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-[0.8125rem] sm:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="bg-neon-coral size-2.5 rounded-full"
                />
                People
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="bg-sea-green size-2.5 rounded-full"
                />
                Places
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="bg-mustard size-2.5 rounded-full"
                />
                Measures
              </span>
              <span className="hidden w-full sm:block">
                The terms in your questions become the interview.
              </span>
            </figcaption>
          </figure>

          <div className="flex min-w-0 flex-col gap-5 sm:gap-6 lg:col-start-1 lg:row-start-2">
            <form
              aria-label="Your study"
              onSubmit={submit}
              className="bg-paper text-ink shadow-card-lip flex flex-col gap-3.5 rounded-3xl p-[18px] scheme-light sm:gap-[18px] sm:rounded-[28px] sm:p-7"
            >
              <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
                <legend className="mb-1 flex flex-col gap-1 p-0">
                  <span className="font-display text-xl font-extrabold sm:text-[1.375rem]">
                    Research questions
                  </span>
                </legend>
                <span
                  id={questionsHintId}
                  className="-mt-2 text-sm text-[oklch(0.42_0.06_281)] sm:text-[0.9375rem]"
                >
                  State each question as you would in a proposal or paper.
                  Sketch works out whom participants should name, which
                  relationships among them matter and what to measure.
                </span>
                <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {form.questions.map((question, index) => (
                    // Questions have no identity beyond their position.
                    // oxlint-disable-next-line react/no-array-index-key
                    <li key={index} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="font-display mt-3 w-6 flex-none text-right text-base font-extrabold text-[oklch(0.42_0.06_281)]"
                      >
                        {index + 1}.
                      </span>
                      <textarea
                        ref={(element) => {
                          questionInputs.current[index] = element;
                        }}
                        rows={2}
                        value={question}
                        maxLength={MAX_QUESTION_LENGTH}
                        aria-label={`Research question ${index + 1}`}
                        aria-describedby={`${questionsHintId} ${questionsCountId}${refusal ? ` ${refusalId}` : ''}`}
                        aria-invalid={refusal ? true : undefined}
                        onChange={(event) =>
                          setQuestion(index, event.target.value)
                        }
                        placeholder={
                          index === 0
                            ? 'For example: Is the drinking behaviour of a student’s close friends associated with the student’s own alcohol use?'
                            : undefined
                        }
                        className={`${textareaClass} field-sizing-content min-h-[76px] ${
                          refusal ? 'border-tangerine' : 'border-paper-line'
                        }`}
                      />
                      {form.questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(index)}
                          aria-label={`Remove research question ${index + 1}`}
                          className="text-ink-muted hover:text-ink-strong mt-1.5 grid size-11 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent"
                        >
                          <CloseIcon size={18} />
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center justify-between gap-2 pl-8 text-[0.8125rem] text-[oklch(0.45_0.05_281)]">
                  <span id={questionsCountId}>
                    {questionsLine(form.questions)}
                  </span>
                  {form.questions.length < MAX_QUESTIONS && (
                    <button
                      ref={addButton}
                      type="button"
                      onClick={addQuestion}
                      className="-my-1.5 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-3 font-[inherit] font-semibold text-[oklch(0.42_0.1_281)]"
                    >
                      <PlusIcon size={16} />
                      Add a research question
                    </button>
                  )}
                </div>
              </fieldset>

              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={populationId}
                    className="font-display text-xl font-extrabold sm:text-[1.375rem]"
                  >
                    Research population
                  </label>
                  <span
                    id={populationHintId}
                    className="text-sm text-[oklch(0.42_0.06_281)] sm:text-[0.9375rem]"
                  >
                    Who will be interviewed: eligibility criteria, age range,
                    setting and how participants are recruited.
                  </span>
                </div>
                <textarea
                  id={populationId}
                  rows={2}
                  value={form.population}
                  maxLength={MAX_POPULATION_LENGTH}
                  aria-describedby={`${populationHintId} ${populationCountId}`}
                  onChange={(event) =>
                    update({ population: event.target.value, picked: null })
                  }
                  placeholder="For example: First-year undergraduates aged 18 to 21 at a large public university, recruited from residence halls."
                  className={`${textareaClass} border-paper-line field-sizing-content min-h-[76px]`}
                />
                <span
                  id={populationCountId}
                  className="px-1 text-[0.8125rem] text-[oklch(0.45_0.05_281)]"
                >
                  {populationLength > 0 &&
                  populationLength < MIN_POPULATION_LENGTH
                    ? `Describe the population in at least ${MIN_POPULATION_LENGTH} characters.`
                    : populationLength === 0
                      ? 'Required.'
                      : `${form.population.length} of ${MAX_POPULATION_LENGTH} characters`}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={synopsisId}
                    className="font-display text-xl font-extrabold sm:text-[1.375rem]"
                  >
                    Study synopsis{' '}
                    <span className="font-body text-base font-semibold text-[oklch(0.45_0.05_281)]">
                      (optional)
                    </span>
                  </label>
                  <span
                    id={synopsisHintId}
                    className="text-sm text-[oklch(0.42_0.06_281)] sm:text-[0.9375rem]"
                  >
                    Setting, design, sampling, reference period and any
                    instruments you plan to use. What you specify is kept; where
                    you leave something out, Sketch makes the standard choice
                    and explains it.
                  </span>
                </div>
                <textarea
                  id={synopsisId}
                  rows={5}
                  value={form.synopsis}
                  maxLength={MAX_SYNOPSIS_LENGTH}
                  aria-describedby={`${synopsisHintId} ${synopsisCountId}`}
                  onChange={(event) =>
                    update({ synopsis: event.target.value, picked: null })
                  }
                  placeholder="For example: A cross-sectional egocentric network survey of first-year undergraduates, administered in week 10 of the first semester. Alcohol use is measured with the AUDIT-C."
                  className={`${textareaClass} border-paper-line min-h-[140px]`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[0.8125rem] text-[oklch(0.45_0.05_281)]">
                  <span id={synopsisCountId}>
                    {synopsisLine(form.synopsis.length)}
                  </span>
                  {hasText && (
                    <button
                      type="button"
                      onClick={() => {
                        focusQuestion.current = 0;
                        update({
                          questions: [''],
                          population: '',
                          synopsis: '',
                          picked: null,
                        });
                      }}
                      className="-my-1.5 min-h-11 min-w-11 cursor-pointer rounded-md border-0 bg-transparent px-3 font-[inherit] font-semibold text-[oklch(0.42_0.1_281)]"
                    >
                      Clear all
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
                  Or start from an example study
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
                            questions: example.questions,
                            population: example.population,
                            synopsis: example.synopsis,
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

              {(config.status === 'error' || noProviders) && (
                <div
                  role="alert"
                  className="bg-danger-wash flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm"
                >
                  <InfoIcon size={20} className="text-danger flex-none" />
                  <span className="flex-1">
                    {config.status === 'error'
                      ? config.message
                      : NO_PROVIDERS_MESSAGE}
                  </span>
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

                  {current && labels && (
                    <div className="flex flex-wrap items-center gap-3 sm:gap-[18px]">
                      <span className="text-sm text-[oklch(0.38_0.06_281)]">
                        Design · {shortLabel(labels.design, current)}
                      </span>
                      <span className="text-ink-muted text-sm">
                        Wording · {shortLabel(labels.wording, current)}
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
                  {comparing
                    ? resumable
                      ? 'Back to your comparison'
                      : 'Generate with both'
                    : resumable
                      ? 'Back to your sketch'
                      : 'Generate protocol'}
                  <ArrowRightIcon />
                </button>
              </div>
            </form>

            <div className="flex max-w-[760px] items-start gap-3 text-sm text-[oklch(0.84_0.03_281)]">
              <LockIcon className="mt-px flex-none" />
              <p className="m-0">
                Sketch keeps a log of every study you submit and the protocol it
                generates, so we can improve it. Please leave out names and
                anything that could identify a real person.{' '}
                <a href={`#${WHAT_WE_KEEP}`} onClick={openWhatWeKeep}>
                  What we keep
                </a>
              </p>
            </div>
          </div>
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
        </section>

        <Faq open={faqOpen} onOpenChange={setFaqOpen} />
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

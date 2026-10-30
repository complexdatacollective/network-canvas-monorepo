// Sketch is one page with a small state machine: describe → generating →
// ready (or failed), with the compare flow running two jobs side by side.

import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

import { getConfig } from './api/client.ts';
import { EXAMPLES } from './lib/examples.ts';
import { composeStudyText } from './lib/study.ts';
import {
  type CompareSeed,
  CompareScreen,
  type UnfinishedComparison,
} from './screens/CompareScreen.tsx';
import {
  type ConfigState,
  type DescribeForm,
  DescribeScreen,
} from './screens/DescribeScreen.tsx';
import { FailedScreen } from './screens/FailedScreen.tsx';
import { GeneratingScreen } from './screens/GeneratingScreen.tsx';
import { ReadyScreen } from './screens/ReadyScreen.tsx';
import type {
  CreateJobRequest,
  JobResult,
  JobStatus,
  Provider,
  ProviderConfig,
} from './shared/api.ts';

type View =
  | { name: 'describe'; refusal: { hint: string | null } | null }
  | {
      name: 'generating';
      request: CreateJobRequest;
      resumeJobId: string | null;
    }
  | {
      name: 'ready';
      job: JobStatus;
      result: JobResult;
      request: CreateJobRequest;
    }
  | { name: 'failed'; message: string; request: CreateJobRequest }
  | {
      name: 'compare';
      description: string;
      id: number;
      // A finished run to keep as one side of the comparison.
      seed: CompareSeed | null;
      resume: UnfinishedComparison | null;
    };

const firstExample = EXAMPLES[0];

const initialForm: DescribeForm = {
  questions: firstExample?.questions ?? [''],
  population: firstExample?.population ?? '',
  synopsis: firstExample?.synopsis ?? '',
  picked: firstExample?.id ?? null,
  provider: 'anthropic',
  compare: false,
};

const CONFIG_ERROR =
  'Sketch could not load its settings. Check your connection and try again.';

export const App = () => {
  const [form, setForm] = useState<DescribeForm>(initialForm);
  const [view, setView] = useState<View>({ name: 'describe', refusal: null });
  const [config, setConfig] = useState<ConfigState>({ status: 'loading' });
  const [configAttempt, setConfigAttempt] = useState(0);
  // A job left running when the researcher went back. Generating the same
  // study again follows it instead of paying for another run.
  const [unfinished, setUnfinished] = useState<{
    request: CreateJobRequest;
    jobId: string;
  } | null>(null);
  const [unfinishedComparison, setUnfinishedComparison] =
    useState<UnfinishedComparison | null>(null);
  // Once the researcher has moved between screens, each new screen takes focus.
  const [navigated, setNavigated] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    getConfig(controller.signal)
      .then(({ providers }) => {
        setConfig({ status: 'ready', providers });
        // Fall back to a provider that has a key.
        setForm((current) => {
          const chosen = providers.find((p) => p.provider === current.provider);
          if (chosen?.available) return current;
          const fallback = providers.find((p) => p.available);
          return fallback
            ? { ...current, provider: fallback.provider }
            : current;
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setConfig({
          status: 'error',
          message:
            error instanceof Error && error.message
              ? error.message
              : CONFIG_ERROR,
        });
      });
    return () => controller.abort();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `configAttempt` is bumped by Retry to ask for the configuration again; its value is not needed
  }, [configAttempt]);

  const providers: ProviderConfig[] =
    config.status === 'ready' ? config.providers : [];
  const providerConfig = (provider: Provider) =>
    providers.find((p) => p.provider === provider);

  const go = useCallback((next: View) => {
    setNavigated(true);
    setView(next);
  }, []);

  const backToDescribe = useCallback(
    () => go({ name: 'describe', refusal: null }),
    [go],
  );

  const startNew = () => {
    setForm((current) => ({
      ...current,
      questions: [''],
      population: '',
      synopsis: '',
      picked: null,
    }));
    backToDescribe();
  };

  const bothAvailable = providers.filter((p) => p.available).length >= 2;

  const resumableFor = (description: string, provider: Provider) =>
    unfinished?.request.description === description &&
    unfinished.request.provider === provider
      ? unfinished
      : null;

  const generate = () => {
    const description = composeStudyText(form);
    if (form.compare && bothAvailable) {
      go({
        name: 'compare',
        description,
        id: Date.now(),
        seed: null,
        resume:
          unfinishedComparison?.description === description
            ? unfinishedComparison
            : null,
      });
      return;
    }
    const resume = resumableFor(description, form.provider);
    go({
      name: 'generating',
      request: resume?.request ?? { description, provider: form.provider },
      resumeJobId: resume?.jobId ?? null,
    });
  };

  const changeForm = (next: DescribeForm) => {
    setForm(next);
    // Editing the text clears a "not a study" verdict.
    if (
      view.name === 'describe' &&
      view.refusal &&
      composeStudyText(next) !== composeStudyText(form)
    ) {
      setView({ name: 'describe', refusal: null });
    }
  };

  const otherProvider = (provider: Provider) =>
    providers.find((p) => p.provider !== provider && p.available) ?? null;

  let screen;
  switch (view.name) {
    case 'describe':
      screen = (
        <DescribeScreen
          form={form}
          onChange={changeForm}
          config={config}
          onRetryConfig={() => {
            setConfig({ status: 'loading' });
            setConfigAttempt((n) => n + 1);
          }}
          refusal={view.refusal}
          onGenerate={generate}
          resumable={
            form.compare && bothAvailable
              ? unfinishedComparison?.description === composeStudyText(form)
              : resumableFor(composeStudyText(form), form.provider) !== null
          }
          focusHeading={navigated}
        />
      );
      break;
    case 'generating': {
      const { request, resumeJobId } = view;
      screen = (
        <GeneratingScreen
          request={request}
          resumeJobId={resumeJobId}
          onStarted={(jobId) => setUnfinished({ request, jobId })}
          expectedLabels={
            providerConfig(request.provider)?.models.labels ?? null
          }
          onCancel={backToDescribe}
          onReady={(job) => {
            setUnfinished(null);
            if (job.result)
              go({ name: 'ready', job, result: job.result, request });
          }}
          onRefused={(hint) => {
            setUnfinished(null);
            go({ name: 'describe', refusal: { hint } });
          }}
          onFailed={(message, stillRunning) => {
            if (!stillRunning) setUnfinished(null);
            go({ name: 'failed', message, request });
          }}
        />
      );
      break;
    }
    case 'ready': {
      const other = otherProvider(view.request.provider);
      screen = (
        <ReadyScreen
          job={view.job}
          result={view.result}
          compareWith={other?.label ?? null}
          onNew={startNew}
          onEdit={backToDescribe}
          onCompare={() =>
            go({
              name: 'compare',
              description: view.request.description,
              id: Date.now(),
              seed: { provider: view.request.provider, job: view.job },
              resume: null,
            })
          }
        />
      );
      break;
    }
    case 'failed':
      screen = (
        <FailedScreen
          message={view.message}
          description={view.request.description}
          onEdit={backToDescribe}
          onRetry={() => {
            const resume = resumableFor(
              view.request.description,
              view.request.provider,
            );
            go({
              name: 'generating',
              request: resume?.request ?? { ...view.request },
              resumeJobId: resume?.jobId ?? null,
            });
          }}
        />
      );
      break;
    case 'compare':
      screen = (
        <CompareScreen
          key={view.id}
          description={view.description}
          seed={view.seed}
          resume={view.resume}
          onUnfinished={setUnfinishedComparison}
          providers={providers.filter((p) => p.available)}
          onNew={startNew}
          onRefused={(hint) => go({ name: 'describe', refusal: { hint } })}
        />
      );
      break;
  }

  return (
    <motion.div
      key={view.name}
      className="flex min-h-screen flex-col"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {screen}
    </motion.div>
  );
};

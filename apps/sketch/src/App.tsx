// Sketch is one page with a small state machine: describe → generating →
// ready (or failed), with the compare flow running two jobs side by side.

import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

import { getConfig } from './api/client.ts';
import { EXAMPLES } from './lib/examples.ts';
import { CompareScreen } from './screens/CompareScreen.tsx';
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
  | { name: 'generating'; request: CreateJobRequest }
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
      tier: CreateJobRequest['tier'];
      id: number;
    };

const firstExample = EXAMPLES[0];

const initialForm: DescribeForm = {
  description: firstExample?.text ?? '',
  picked: firstExample?.id ?? null,
  provider: 'anthropic',
  tier: 'standard',
  compare: false,
};

const CONFIG_ERROR =
  'Sketch could not load its settings. Check your connection and try again.';

export const App = () => {
  const [form, setForm] = useState<DescribeForm>(initialForm);
  const [view, setView] = useState<View>({ name: 'describe', refusal: null });
  const [config, setConfig] = useState<ConfigState>({ status: 'loading' });
  const [configAttempt, setConfigAttempt] = useState(0);
  // Once the researcher has moved between screens, each new screen takes focus.
  const [navigated, setNavigated] = useState(false);
  const reduceMotion = useReducedMotion();

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
    setForm((current) => ({ ...current, description: '', picked: null }));
    backToDescribe();
  };

  const generate = () => {
    const description = form.description.trim();
    const bothAvailable = providers.filter((p) => p.available).length >= 2;
    if (form.compare && bothAvailable) {
      go({ name: 'compare', description, tier: form.tier, id: Date.now() });
      return;
    }
    go({
      name: 'generating',
      request: { description, provider: form.provider, tier: form.tier },
    });
  };

  const changeForm = (next: DescribeForm) => {
    setForm(next);
    // Editing the text clears a "not a study" verdict.
    if (
      view.name === 'describe' &&
      view.refusal &&
      next.description !== form.description
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
          focusHeading={navigated}
        />
      );
      break;
    case 'generating': {
      const { request } = view;
      screen = (
        <GeneratingScreen
          request={request}
          expectedLabels={
            providerConfig(request.provider)?.models[request.tier].labels ??
            null
          }
          onCancel={backToDescribe}
          onReady={(job) => {
            if (job.result)
              go({ name: 'ready', job, result: job.result, request });
          }}
          onRefused={(hint) => go({ name: 'describe', refusal: { hint } })}
          onFailed={(message) => go({ name: 'failed', message, request })}
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
              tier: view.request.tier,
              id: Date.now(),
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
          onRetry={() =>
            go({ name: 'generating', request: { ...view.request } })
          }
        />
      );
      break;
    case 'compare':
      screen = (
        <CompareScreen
          key={view.id}
          description={view.description}
          tier={view.tier}
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

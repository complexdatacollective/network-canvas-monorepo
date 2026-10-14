import { getRouteApi } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Shell } from '@codaco/interview';
import type {
  InterviewAnalyticsMetadata,
  StepChangeHandler,
} from '@codaco/interview/contract';

import { useErrorTelemetry } from '../runtime/telemetry.ts';
import { createParticipantAnalyticsClient } from './analyticsClient.ts';
import { type AssetResolver, createAssetResolver } from './assetUrl.ts';
import {
  createParticipantHandlers,
  pageRevisionBase,
  type SaveOutcome,
} from './interviewHandlers.ts';
import {
  logAnswerSaveFailed,
  logAnswerSaveRetried,
  createAssetObserver,
  logStageFailedToRender,
  type ParticipantLog,
  type ParticipantStage,
  isStorageUrl,
  participantStage,
  renderedStep,
  useParticipantLogs,
  watchParticipantConnection,
} from './participantLogs.ts';
import ParticipantNotice, {
  type ParticipantNoticeKind,
} from './ParticipantNotice.tsx';
import { reportStageCrashesTo } from './stageCrashes.ts';

const route = getRouteApi('/participant/session/$sessionToken');

const ANALYTICS: InterviewAnalyticsMetadata = {
  installationId: 'studio',
  hostApp: 'studio',
};

function StageCrashReporter({
  log,
  renderedStage,
}: {
  readonly log: ParticipantLog;
  readonly renderedStage: () => ParticipantStage | undefined;
}): null {
  useLayoutEffect(
    () =>
      reportStageCrashesTo(() => logStageFailedToRender(log, renderedStage())),
    [log, renderedStage],
  );
  return null;
}

export default function InterviewSession() {
  const { sessionToken } = route.useParams();
  return <InterviewSessionView key={sessionToken} />;
}

function InterviewSessionView() {
  const loaded = route.useLoaderData();
  const [notice, setNotice] = useState<ParticipantNoticeKind>();
  const [currentStep, setCurrentStep] = useState(loaded.stageIndex);
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  const { payload } = loaded;

  const { sessionToken } = route.useParams();
  useErrorTelemetry('participant', loaded.analytics);
  const log = useParticipantLogs(sessionToken, loaded.logLevel);
  const analyticsClient = useMemo(
    () =>
      loaded.analytics
        ? createParticipantAnalyticsClient(sessionToken)
        : undefined,
    [loaded.analytics, sessionToken],
  );
  const stageTypes = useMemo(
    () => payload.protocol.stages.map((stage) => stage.type),
    [payload],
  );
  const renderedStage = useCallback(
    (element?: Element) => participantStage(stageTypes, renderedStep(element)),
    [stageTypes],
  );
  useEffect(
    () => watchParticipantConnection(log, renderedStage),
    [log, renderedStage],
  );
  const assetObserver = useMemo(
    () => createAssetObserver(log, renderedStage),
    [log, renderedStage],
  );

  const { onSync, onFinish, saveStep, flushStep } = useMemo(
    () =>
      createParticipantHandlers({
        holderEpoch: loaded.holderEpoch,
        revision: loaded.revision,
        numberSavesFrom: pageRevisionBase(),
        session: payload.session,
        stageIds: payload.protocol.stages.map((stage) => stage.id),
        getCurrentStep: () => currentStepRef.current,
        onNotice: setNotice,
        onSaveOutcome: (outcome: SaveOutcome) => {
          const stage = participantStage(stageTypes, outcome.stageIndex);
          if (stage === undefined) return;
          if (outcome.kind === 'retried') {
            logAnswerSaveRetried(log, stage, outcome.attempts);
          } else if (outcome.kind === 'failed') {
            logAnswerSaveFailed(log, stage, outcome.code, outcome.attempts);
          }
        },
      }),
    [loaded, payload, stageTypes, log],
  );

  useEffect(() => {
    const onLeave = () => {
      flushStep();
      analyticsClient?.flush({ unloading: true });
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') onLeave();
    };
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onHidden);
      analyticsClient?.flush();
    };
  }, [flushStep, analyticsClient]);

  const onStepChange = useCallback<StepChangeHandler>(
    (step) => {
      currentStepRef.current = step;
      setCurrentStep(step);
      saveStep();
    },
    [saveStep],
  );

  const onRequestAsset = useMemo<AssetResolver>(
    () => createAssetResolver(payload.protocol.assets, assetObserver.atRequest),
    [payload, assetObserver],
  );

  useEffect(
    () =>
      assetObserver.watch(
        (source) => isStorageUrl(source) || onRequestAsset.produced(source),
      ),
    [assetObserver, onRequestAsset],
  );

  if (notice !== undefined) return <ParticipantNotice kind={notice} />;

  return (
    <>
      <StageCrashReporter log={log} renderedStage={renderedStage} />
      <Shell
        requestedLocales={navigator.languages}
        payload={payload}
        currentStep={currentStep}
        onStepChange={onStepChange}
        onSync={onSync}
        onFinish={onFinish}
        onRequestAsset={onRequestAsset}
        analytics={ANALYTICS}
        posthogClient={analyticsClient}
        disableAnalytics={analyticsClient === undefined}
        allowUserScaling
      />
    </>
  );
}

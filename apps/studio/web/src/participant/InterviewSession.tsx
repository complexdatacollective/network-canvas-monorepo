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

import { faultCodeOf } from '../runtime/errors.ts';
import { useErrorTelemetry } from '../runtime/telemetry.ts';
import { createParticipantAnalyticsClient } from './analyticsClient.ts';
import { type AssetResolver, createAssetResolver } from './assetUrl.ts';
import {
  createParticipantHandlers,
  pageRevisionBase,
  type SaveFault,
} from './interviewHandlers.ts';
import {
  logAnswerSaveFailed,
  logAnswerSaveRetried,
  logAssetFailed,
  logStageFailedToRender,
  type ParticipantLog,
  type ParticipantStage,
  isStorageUrl,
  participantStage,
  renderedStep,
  useParticipantLogs,
  watchParticipantConnection,
  watchParticipantMedia,
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
  const currentStage = useCallback(
    () => participantStage(stageTypes, currentStepRef.current),
    [stageTypes],
  );
  useEffect(
    () => watchParticipantConnection(log, currentStage),
    [log, currentStage],
  );
  const renderedStage = useCallback(
    (element?: Element) =>
      participantStage(
        stageTypes,
        renderedStep(element) ?? currentStepRef.current,
      ),
    [stageTypes],
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
        onSaveFault: (fault: SaveFault) => {
          const stage = participantStage(stageTypes, fault.stageIndex);
          if (stage === undefined) return;
          if (fault.kind === 'retried') {
            logAnswerSaveRetried(log, stage, fault.attempts);
          } else {
            logAnswerSaveFailed(
              log,
              stage,
              faultCodeOf(fault.error),
              fault.attempts,
            );
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
    () =>
      createAssetResolver(payload.protocol.assets, () => {
        const stage = renderedStage();
        return (code) => {
          if (stage !== undefined) logAssetFailed(log, stage, code);
        };
      }),
    [payload, renderedStage, log],
  );

  useEffect(
    () =>
      watchParticipantMedia(
        log,
        renderedStage,
        (source) => isStorageUrl(source) || onRequestAsset.produced(source),
      ),
    [log, renderedStage, onRequestAsset],
  );

  if (notice !== undefined) return <ParticipantNotice kind={notice} />;

  return (
    <>
      <StageCrashReporter log={log} renderedStage={renderedStage} />
      <Shell
        requestedLocale={navigator.languages}
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

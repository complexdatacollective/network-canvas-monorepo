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
  AssetRequestHandler,
  InterviewAnalyticsMetadata,
  StepChangeHandler,
} from '@codaco/interview/contract';

import { faultCodeOf } from '../runtime/errors.ts';
import { useErrorTelemetry } from '../runtime/telemetry.ts';
import { createParticipantAnalyticsClient } from './analyticsClient.ts';
import { createAssetResolver } from './assetUrl.ts';
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
  participantStage,
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
  currentStage,
}: {
  readonly log: ParticipantLog;
  readonly currentStage: () => ParticipantStage | undefined;
}): null {
  useLayoutEffect(
    () =>
      reportStageCrashesTo(() => logStageFailedToRender(log, currentStage())),
    [log, currentStage],
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
  useEffect(
    () => watchParticipantMedia(log, currentStage),
    [log, currentStage],
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

  const onRequestAsset = useMemo<AssetRequestHandler>(
    () =>
      createAssetResolver(payload.protocol.assets, () => {
        const stage = currentStage();
        return (code) => {
          if (stage !== undefined) logAssetFailed(log, stage, code);
        };
      }),
    [payload, currentStage, log],
  );

  if (notice !== undefined) return <ParticipantNotice kind={notice} />;

  return (
    <>
      <StageCrashReporter log={log} currentStage={currentStage} />
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

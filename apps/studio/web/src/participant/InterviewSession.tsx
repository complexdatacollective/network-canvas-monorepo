import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  faultObservingClient,
  logAnswerSaveFailed,
  logAnswerSaveRetried,
  logAssetFailed,
  participantStage,
  useParticipantLogs,
  watchParticipantConnection,
} from './participantLogs.ts';
import ParticipantNotice, {
  type ParticipantNoticeKind,
} from './ParticipantNotice.tsx';

const route = getRouteApi('/participant/session/$sessionToken');

const ANALYTICS: InterviewAnalyticsMetadata = {
  installationId: 'studio',
  hostApp: 'studio',
};

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
  const logging = useParticipantLogs(sessionToken, loaded.logLevel);
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
  const interviewClient = useMemo(
    () =>
      analyticsClient === undefined && !logging
        ? undefined
        : faultObservingClient(analyticsClient, stageTypes),
    [analyticsClient, logging, stageTypes],
  );

  useEffect(() => watchParticipantConnection(currentStage), [currentStage]);

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
          const stage = currentStage();
          if (stage === undefined) return;
          if (fault.kind === 'retried') {
            logAnswerSaveRetried(stage, fault.attempts);
          } else {
            logAnswerSaveFailed(
              stage,
              faultCodeOf(fault.error),
              fault.attempts,
            );
          }
        },
      }),
    [loaded, payload, currentStage],
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
      createAssetResolver(payload.protocol.assets, (code) => {
        const stage = currentStage();
        if (stage !== undefined) logAssetFailed(stage, code);
      }),
    [payload, currentStage],
  );

  if (notice !== undefined) return <ParticipantNotice kind={notice} />;

  return (
    <Shell
      requestedLocale={navigator.languages}
      payload={payload}
      currentStep={currentStep}
      onStepChange={onStepChange}
      onSync={onSync}
      onFinish={onFinish}
      onRequestAsset={onRequestAsset}
      analytics={ANALYTICS}
      posthogClient={interviewClient}
      disableAnalytics={interviewClient === undefined}
      allowUserScaling
    />
  );
}

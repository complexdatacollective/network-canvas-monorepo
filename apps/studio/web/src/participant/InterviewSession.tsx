import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Shell } from '@codaco/interview';
import type {
  AssetRequestHandler,
  InterviewAnalyticsMetadata,
  StepChangeHandler,
} from '@codaco/interview/contract';

import { createParticipantHandlers } from './interviewHandlers.ts';
import ParticipantNotice, {
  type ParticipantNoticeKind,
} from './ParticipantNotice.tsx';

const route = getRouteApi('/participant/session/$sessionToken');

const ANALYTICS: InterviewAnalyticsMetadata = {
  installationId: 'studio',
  hostApp: 'studio',
};

const storageUrl = (source: string): string =>
  `/storage/${source.split('.')[0]}`;

export default function InterviewSession() {
  const loaded = route.useLoaderData();
  const [notice, setNotice] = useState<ParticipantNoticeKind>();
  const [currentStep, setCurrentStep] = useState(loaded.stageIndex);
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  const { payload } = loaded;

  const { onSync, onFinish, saveStep } = useMemo(
    () =>
      createParticipantHandlers({
        holderEpoch: loaded.holderEpoch,
        revision: loaded.revision,
        session: payload.session,
        stageIds: payload.protocol.stages.map((stage) => stage.id),
        getCurrentStep: () => currentStepRef.current,
        onNotice: setNotice,
      }),
    [loaded, payload],
  );

  const onStepChange = useCallback<StepChangeHandler>(
    (step) => {
      currentStepRef.current = step;
      setCurrentStep(step);
      saveStep();
    },
    [saveStep],
  );

  const onRequestAsset = useCallback<AssetRequestHandler>(
    async (assetId) => {
      const asset = payload.protocol.assets.find(
        (candidate) => candidate.assetId === assetId,
      );
      if (asset?.source === undefined) {
        throw new Error(`No stored file for asset ${assetId}`);
      }
      return storageUrl(asset.source);
    },
    [payload],
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
      disableAnalytics
      allowUserScaling
    />
  );
}

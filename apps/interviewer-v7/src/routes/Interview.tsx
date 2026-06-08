import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type InterviewPayload,
  type SessionPayload,
  Shell,
} from '@codaco/interview';
import { InterviewComplete } from '~/components/InterviewComplete';
import {
  buildResolvedAssets,
  makeAssetResolver,
} from '~/lib/assets/assetResolver';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import {
  getProtocolByHash,
  getSession,
  getSettings,
  markSessionFinished,
  updateSession,
  updateSettings,
} from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';
import { getInstallationId } from '~/lib/platform/installationId';
import { hostAppName } from '~/lib/platform/platform';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | {
      kind: 'ready';
      payload: InterviewPayload;
      resolver: (id: string) => Promise<string>;
    };

export function InterviewRoute({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [, navigate] = useLocation();
  const { requireFreshUnlock } = useStepUpAuth();
  const [finished, setFinished] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  // SessionPayload from @codaco/interview's onSync does not carry the current
  // step. Mirror it into a ref so handleSync sees the latest value rather
  // than the stale closure value.
  const currentStepRef = useRef(0);

  // Gated exit shared by the Shell exit button and the completion screen.
  const handleExit = useCallback(async () => {
    const settings = await getSettings();
    if (settings.requireUnlockOnExit) {
      const result = await requireFreshUnlock();
      if (!result.ok) return;
    }
    navigate('/');
  }, [requireFreshUnlock, navigate]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const settings = await getSettings();
      if (settings.requireUnlockOnEnter) {
        const result = await requireFreshUnlock();
        if (!result.ok) {
          if (active) navigate('/');
          return;
        }
      }
      if (!active) return;
      const session = await getSession(sessionId);
      if (!session) {
        if (active) setState({ kind: 'missing' });
        return;
      }
      if (session.finishedAt) {
        if (active) setFinished(true);
        return;
      }
      const protocol = await getProtocolByHash(session.protocolHash);
      if (!protocol) {
        if (active) setState({ kind: 'missing' });
        return;
      }
      const assets = await buildResolvedAssets(session.protocolHash);
      const payload: InterviewPayload = {
        session: hydrateSession(session),
        protocol: {
          ...protocol.protocol,
          id: protocol.id,
          hash: protocol.hash,
          importedAt: protocol.importedAt,
          assets,
        },
      };
      if (!active) return;
      const initialStep = session.currentStep ?? 0;
      setCurrentStep(initialStep);
      currentStepRef.current = initialStep;
      setState({
        kind: 'ready',
        payload,
        resolver: makeAssetResolver(session.protocolHash, protocol.importedAt),
      });
      void updateSettings({
        lastActiveSessionId: session.id,
        lastActiveProtocolHash: session.protocolHash,
      });
    };
    void load();
    return () => {
      active = false;
    };
  }, [sessionId, navigate, requireFreshUnlock]);

  const analytics = useMemo(
    () => ({ installationId: getInstallationId(), hostApp: hostAppName }),
    [],
  );

  const handleSync = useCallback(
    async (id: string, session: SessionPayload) => {
      await updateSession(id, {
        network: session.network,
        currentStep: currentStepRef.current,
        stageMetadata: session.stageMetadata as
          | Record<string, unknown>
          | undefined,
        finishedAt: session.finishTime,
      });
    },
    [],
  );

  const handleFinish = useCallback(async (id: string) => {
    await markSessionFinished(id);
    setFinished(true);
  }, []);

  const handleStepChange = useCallback(
    (step: number) => {
      currentStepRef.current = step;
      setCurrentStep(step);
      void updateSession(sessionId, { currentStep: step });
    },
    [sessionId],
  );

  if (finished) {
    return <InterviewComplete onExit={() => void handleExit()} />;
  }

  if (state.kind === 'loading') {
    return (
      <div className="bg-background flex h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (state.kind === 'missing') {
    return (
      <div className="mx-auto flex h-dvh max-w-lg items-center justify-center p-8">
        <Surface
          level={1}
          spacing="lg"
          shadow="lg"
          className="flex flex-col items-center gap-4 text-center"
        >
          <Heading level="h1">Interview not found</Heading>
          <Paragraph>
            This interview may have been deleted, or the protocol it used is no
            longer installed.
          </Paragraph>
          <Button onClick={() => navigate('/')}>Return home</Button>
        </Surface>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-dvw">
      <Shell
        payload={state.payload}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onSync={handleSync}
        onFinish={handleFinish}
        onRequestAsset={state.resolver}
        analytics={analytics}
        disableAnalytics
        onExit={() => void handleExit()}
      />
    </div>
  );
}

function hydrateSession(stored: StoredSession): SessionPayload {
  return {
    id: stored.id,
    startTime: stored.startedAt,
    finishTime: stored.finishedAt,
    exportTime: stored.exportedAt,
    lastUpdated: stored.lastUpdatedAt,
    network: stored.network,
    promptIndex: 0,
    stageMetadata: stored.stageMetadata as SessionPayload['stageMetadata'],
  };
}

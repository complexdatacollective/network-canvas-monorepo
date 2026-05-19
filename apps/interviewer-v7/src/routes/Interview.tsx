import { LogOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useHistoryState } from 'wouter/use-browser-location';

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

type InterviewLocationState = { fresh?: boolean } | undefined;

export function InterviewRoute({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [location, navigate] = useLocation();
  const historyState = useHistoryState<InterviewLocationState>();
  const { requireFreshUnlock } = useStepUpAuth();
  const [currentStep, setCurrentStep] = useState(0);
  // SessionPayload from @codaco/interview's onSync does not carry the current
  // step. Mirror it into a ref so handleSync sees the latest value rather
  // than the stale closure value (which would overwrite a step that
  // handleStepChange just persisted).
  const currentStepRef = useRef(0);

  useEffect(() => {
    let active = true;
    // `requireUnlockOnResume` should only fire when *resuming* — i.e. opening
    // a session that wasn't just created. The new-session flow signals "fresh"
    // by passing `{ state: { fresh: true } }` to `navigate`. We replace the
    // history entry to clear the flag, so a subsequent refresh re-enters as
    // a resume.
    const isFreshSession = historyState?.fresh === true;
    if (isFreshSession) {
      navigate(location, { replace: true, state: null });
    }
    const load = async () => {
      const settings = await getSettings();
      if (!isFreshSession && settings.requireUnlockOnResume) {
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
    // `historyState` and `location` are read once at mount to consume the
    // fresh-session signal; we deliberately do not re-fire the gate when the
    // history state changes after the replace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleFinish = useCallback(
    async (id: string) => {
      await markSessionFinished(id);
      navigate('/sessions');
    },
    [navigate],
  );

  const handleStepChange = useCallback(
    (step: number) => {
      currentStepRef.current = step;
      setCurrentStep(step);
      void updateSession(sessionId, { currentStep: step });
    },
    [sessionId],
  );

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
    <div className="relative flex h-dvh w-dvw">
      <Shell
        payload={state.payload}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onSync={handleSync}
        onFinish={handleFinish}
        onRequestAsset={state.resolver}
        analytics={analytics}
        disableAnalytics
      />
      <Button
        variant="outline"
        size="sm"
        icon={<LogOut className="size-4" />}
        className="bg-background/90 absolute top-3 left-3 z-50 backdrop-blur"
        onClick={() => navigate('/')}
        aria-label="Exit interview and return to dashboard"
      >
        Exit
      </Button>
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

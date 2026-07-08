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
  type StepChangeHandler,
} from '@codaco/interview';
import { InterviewComplete } from '~/components/InterviewComplete';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';
import { APP_VERSION } from '~/lib/appVersion';
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
import { getInstallationId } from '~/lib/installationId';
import { useHistoryBackGuard } from '~/lib/pwa/useHistoryBackGuard';

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
  const {
    requireFreshUnlock,
    getAuthorizedInterviewId,
    setAuthorizedInterviewId,
  } = useStepUpAuth();
  const [finished, setFinished] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [allowStageNavigation, setAllowStageNavigation] = useState(false);
  // SessionPayload from @codaco/interview's onSync does not carry the current
  // step. Mirror it into a ref so handleSync sees the latest value rather
  // than the stale closure value.
  const currentStepRef = useRef(0);

  // A history-back (browser button or a swipe gesture the CSS/wheel guards
  // can't intercept, e.g. iPadOS edge swipe) would leave the interview WITHOUT
  // the requireUnlockOnExit gate. Pin the history for the life of the route;
  // gated forward exits go through `exitToHome` so the pinned entry is consumed
  // rather than left buried (which would let Back from Home re-enter).
  const exitToHome = useHistoryBackGuard(true);
  const goHome = useCallback(
    () => exitToHome(() => navigate('/', { replace: true })),
    [exitToHome, navigate],
  );

  // Gated exit shared by the Shell exit button and the completion screen.
  const handleExit = useCallback(async () => {
    const settings = await getSettings();
    if (settings.requireUnlockOnExit) {
      const result = await requireFreshUnlock();
      if (!result.ok) return;
    }
    setAuthorizedInterviewId(null);
    goHome();
  }, [requireFreshUnlock, goHome, setAuthorizedInterviewId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const settings = await getSettings();
      // Skip the enter gate when this interview's entry was already authorized
      // in the current unlock session — i.e. an idle-lock/unlock cycle remounted
      // the same interview. The user just authenticated at the LockScreen, so a
      // second step-up prompt would be redundant.
      const alreadyAuthorized = getAuthorizedInterviewId() === sessionId;
      if (settings.requireUnlockOnEnter && !alreadyAuthorized) {
        const result = await requireFreshUnlock();
        if (!result.ok) {
          if (active) goHome();
          return;
        }
      }
      if (!active) return;
      const session = await getSession(sessionId);
      if (!session) {
        if (active) setState({ kind: 'missing' });
        return;
      }
      // Bail if a sessionId change / unmount tore down this load while we
      // awaited — otherwise a stale load could write the shared authorization
      // ref and skip the enter gate for the wrong session on a later mount.
      if (!active) return;
      // Entry is now authorized for the rest of the unlock session, so a
      // subsequent lock/unlock remount of this interview won't re-prompt.
      setAuthorizedInterviewId(sessionId);
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
      setAllowStageNavigation(settings.allowStageNavigation);
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
  }, [
    sessionId,
    goHome,
    requireFreshUnlock,
    getAuthorizedInterviewId,
    setAuthorizedInterviewId,
  ]);

  const { client: posthogClient, enabled: analyticsEnabled } = useAnalytics();

  const analytics = useMemo(
    () => ({
      installationId: getInstallationId(),
      // No Electron/Capacitor host remains; this app is the only host.
      hostApp: 'interviewer',
      hostVersion: APP_VERSION,
    }),
    [],
  );

  // `finishedAt` is written solely by markSessionFinished (via handleFinish).
  // The engine never sets session.finishTime for an in-progress session, so a
  // trailing debounced sync landing after finish would otherwise rewrite it
  // back to null and un-finish the interview.
  const handleSync = useCallback(
    async (id: string, session: SessionPayload) => {
      await updateSession(id, {
        network: session.network,
        currentStep: currentStepRef.current,
        stageMetadata: session.stageMetadata as
          | Record<string, unknown>
          | undefined,
      });
    },
    [],
  );

  const handleFinish = useCallback(async (id: string) => {
    await markSessionFinished(id);
    setFinished(true);
  }, []);

  const handleStepChange = useCallback<StepChangeHandler>(
    (step, meta) => {
      currentStepRef.current = step;
      setCurrentStep(step);
      // Persist the participant-facing progress alongside the step so the
      // dashboard shows exactly what the participant saw, without re-deriving it
      // (and without needing to know about the engine's appended finish stage).
      void updateSession(sessionId, {
        currentStep: step,
        progress: meta.progress,
      });
    },
    [sessionId],
  );

  if (finished) {
    return <InterviewComplete onExit={() => void handleExit()} />;
  }

  if (state.kind === 'loading') {
    return (
      <div className="bg-background flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (state.kind === 'missing') {
    return (
      <div className="mx-auto flex h-full max-w-lg items-center justify-center p-8">
        <Surface
          floating
          spacing="lg"
          shadow="lg"
          className="flex flex-col items-center gap-4 text-center"
        >
          <Heading level="h1">Interview not found</Heading>
          <Paragraph>
            This interview may have been deleted, or the protocol it used is no
            longer installed.
          </Paragraph>
          <Button
            onClick={() => {
              // Not gated (don't trap the user on an error screen), but clear
              // the entry authorization so a transient load failure can't leave
              // a stale id that would later skip the enter gate.
              setAuthorizedInterviewId(null);
              goHome();
            }}
          >
            Return home
          </Button>
        </Surface>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* The animated blob backdrop (App.tsx, fixed -z-10) is unmounted during
          an interview, so paint an opaque themed base across the full viewport
          — fixed, so it covers the safe-area regions too — behind the
          edge-to-edge Shell. This guarantees a solid background wherever the
          Shell's own surfaces don't reach (e.g. beside the navigation rail). */}
      <div
        aria-hidden
        className="bg-background pointer-events-none fixed inset-0 z-[-1]"
      />
      <Shell
        payload={state.payload}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onSync={handleSync}
        onFinish={handleFinish}
        onRequestAsset={state.resolver}
        analytics={analytics}
        posthogClient={posthogClient ?? undefined}
        disableAnalytics={!analyticsEnabled}
        onExit={() => void handleExit()}
        allowStageNavigation={allowStageNavigation}
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

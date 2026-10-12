import {
  type ComponentProps,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import type {
  AssetRequestHandler,
  InterviewPayload,
  StepChangeHandler,
} from '@codaco/interview';
import { Shell } from '@codaco/interview';

import { mockFinish, mockSync } from './mockCallbacks';
import {
  createInterview as createInterviewHook,
  getAllowStageNavigation,
  getMountGeneration,
  getRequestedLocale,
  getTestState,
  installProtocol as installProtocolHook,
  installTestHooks,
  setAssetUrl as setAssetUrlHook,
  subscribe,
} from './testHooks';

const ASSET_SERVER_URL = 'http://localhost:4200';

type BootstrapPayload = {
  protocol: Parameters<typeof installProtocolHook>[0];
  assetUrls: Record<string, string>;
};

// Auto-bootstrap path: `?bootstrap=<slug>` fetches a prepared bundle from the
// asset server and installs it via the same hooks Playwright uses, then
// redirects to `?interviewId=<id>&step=0`. Used by `pnpm dev:host` so devs
// can land in an interview without a console paste.
async function autoBootstrap(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${ASSET_SERVER_URL}/${slug}/bootstrap.json`);
    if (!res.ok) return null;
    const { protocol, assetUrls } = (await res.json()) as BootstrapPayload;
    installProtocolHook(protocol);
    for (const [id, url] of Object.entries(assetUrls)) {
      setAssetUrlHook(id, url);
    }
    return createInterviewHook(protocol.id, 'dev-host');
  } catch {
    return null;
  }
}

const mockAssetReq: AssetRequestHandler = async (assetId: string) => {
  const url = getTestState().assetUrls.get(assetId);
  if (!url) throw new Error(`No URL registered for asset ${assetId}`);
  return url;
};

installTestHooks();

function useTestState() {
  return useSyncExternalStore(
    subscribe,
    () =>
      // Include allowStageNavigation so a mid-test setAllowStageNavigation()
      // toggle changes the snapshot and re-renders App (which re-reads the flag
      // and passes it to Shell). Without it useSyncExternalStore would bail out.
      // The mount generation likewise re-renders App for remountInterview().
      `${Array.from(getTestState().interviews.entries())
        .map(([id]) => id)
        .join(
          ',',
        )}|${getAllowStageNavigation()}|${JSON.stringify(getRequestedLocale())}|${getMountGeneration()}`,
    () => '',
  );
}

function getStepFromUrl(): number | undefined {
  const params = new URLSearchParams(window.location.search);
  const step = params.get('step');
  return step !== null ? Number(step) : undefined;
}

// The URL is a synchronous source, so an interview named in it is the initial
// state rather than something an effect assigns on a second render. Only the
// `?bootstrap=` path is asynchronous, and that one keeps its effect below.
function getInterviewIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('interviewId') || null;
}

export default function App() {
  const [activeId, setActiveId] = useState<string | null>(
    getInterviewIdFromUrl,
  );
  const [currentStep, setCurrentStep] = useState<number | undefined>(() =>
    getInterviewIdFromUrl() !== null ? getStepFromUrl() : undefined,
  );
  useTestState();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('interviewId')) {
      return;
    }
    const bootstrapSlug = params.get('bootstrap');
    if (bootstrapSlug) {
      autoBootstrap(bootstrapSlug).then((id) => {
        if (id) {
          window.history.replaceState(null, '', `?interviewId=${id}&step=0`);
          setActiveId(id);
          setCurrentStep(0);
        }
      });
    }
  }, []);

  const onStepChange = useCallback<StepChangeHandler>((step) => {
    setCurrentStep(step);
    const params = new URLSearchParams(window.location.search);
    params.set('step', String(step));
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, []);

  const entry = activeId ? getTestState().interviews.get(activeId) : undefined;
  const protocol = entry
    ? getTestState().protocols.get(entry.protocolId)
    : undefined;

  if (!activeId) {
    return <div>No interview selected. Use ?interviewId=... in the URL.</div>;
  }

  if (!entry) {
    return <div>Unknown interview ID: {activeId}</div>;
  }

  if (!protocol) {
    return <div>Unknown protocol for interview: {entry.protocolId}</div>;
  }

  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {/*
        Each key is one mount of an interview: selecting another interview, or
        remountInterview() bumping the generation, starts a fresh Shell from the
        session held at that moment.
      */}
      <MountedInterview
        key={`${activeId}:${getMountGeneration()}`}
        session={entry.session}
        protocol={protocol}
        requestedLocale={getRequestedLocale()}
        allowStageNavigation={getAllowStageNavigation()}
        currentStep={currentStep}
        onStepChange={onStepChange}
      />
    </AnimationProvider>
  );
}

type MountedInterviewProps = InterviewPayload &
  Pick<
    ComponentProps<typeof Shell>,
    'requestedLocale' | 'allowStageNavigation' | 'currentStep' | 'onStepChange'
  >;

function MountedInterview({
  session,
  protocol,
  ...shellProps
}: MountedInterviewProps) {
  // The payload seeds the Shell's store, so it is fixed for the life of this
  // mount; the session the host goes on to hold reaches the Shell only by a
  // remount, never by re-seeding a running one.
  const [payload] = useState<InterviewPayload>(() => ({ session, protocol }));

  return (
    <Shell
      {...shellProps}
      payload={payload}
      onSync={mockSync}
      onFinish={mockFinish}
      onRequestAsset={mockAssetReq}
      flags={{ isE2E: true }}
      analytics={{ installationId: 'e2e', hostApp: 'e2e' }}
      disableAnalytics={true}
    />
  );
}

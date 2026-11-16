'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type CompletedAction,
  type FinishHandler,
  type InterviewPayload,
  Shell,
  useContentLocaleIn,
} from '@codaco/interview';
import {
  type AssetUrlOwner,
  createAssetUrlOwner,
} from '@codaco/interview/contract';
import { defaultLocale, type Locale, locales } from '~/lib/i18n/locales';
import {
  createPreviewPayload,
  installPreviewProtocol,
  type PreviewInstallFailure,
  type PreviewProtocolInstall,
} from '~/lib/protocolPreview';

import { PreviewLoadingScreen, PreviewMessageScreen } from './PreviewScreen';

export type PreviewWave = {
  wave: number;
  protocolFilename: string;
  protocolPath: string;
};

/**
 * The finish confirmation's explanation and the completed state's action
 * labels in every site language, so they can be shown in the interview's
 * language rather than the page's.
 */
export type CompletionLabels = Readonly<
  Record<
    Locale,
    Readonly<{
      finishConfirmation: string;
      restart: string;
      backToProtocol: string;
    }>
  >
>;

// The outcome of loading one wave's protocol.
type LoadedPreview = {
  install: PreviewProtocolInstall | null;
  payload: InterviewPayload | null;
  requestedLocales: readonly string[] | null;
  failure: PreviewFailure | null;
};

export type ProtocolPreviewProps = {
  waves: PreviewWave[];
  backHref: string;
  completionLabels: CompletionLabels;
};

type PreviewFailure = PreviewInstallFailure | 'unavailable';

// One install per window, so every request is for the same generation and a
// cached URL always satisfies it.
const PREVIEW_GENERATION = 'preview';

const noopSync = async () => {};

function useWave(waves: PreviewWave[]): PreviewWave | undefined {
  const requested = Number(useSearchParams().get('wave'));
  return waves.find(({ wave }) => wave === requested) ?? waves[0];
}

async function fetchProtocolBytes(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

// Rendered inside the Shell, in the language the interview shows, which it
// negotiates from the protocol's languages and which can change while it runs
// (a language chooser, the visitor's choice), best fitted to the site's
// languages: es for a protocol in es-MX. The interview's English is US
// English, the site's default.
function InterviewLanguageLabel({
  labels,
  name,
}: {
  labels: CompletionLabels;
  name: keyof CompletionLabels[Locale];
}) {
  return labels[useContentLocaleIn(locales, defaultLocale)][name];
}

export function ProtocolPreview({
  waves,
  backHref,
  completionLabels,
}: ProtocolPreviewProps) {
  const t = useTranslations('ProtocolGallery.preview');
  const wave = useWave(waves);

  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Every change of wave starts a new load, so what the last one produced is
  // forgotten as the wave changes — even on a return to a wave loaded before,
  // whose earlier install the new load has already let go of. The loading
  // screen therefore shows at once, never the previous load's interview or
  // failure. Retrying forgets it the same way, from its click handler.
  const [loadedWave, setLoadedWave] = useState(wave);
  if (wave !== loadedWave) {
    setLoadedWave(wave);
    setLoaded(null);
  }
  const payload = loaded?.payload ?? null;
  const requestedLocales = loaded?.requestedLocales ?? null;
  const failure = loaded?.failure ?? null;

  // The install lives in a ref as well as state so the asset resolver, which
  // the Shell holds for its lifetime, reads the current one without being
  // recreated.
  const installRef = useRef<PreviewProtocolInstall | null>(null);
  const ownerRef = useRef<AssetUrlOwner | null>(null);

  useEffect(() => {
    const existing = ownerRef.current;
    const owner =
      existing !== null && !existing.closed ? existing : createAssetUrlOwner();
    ownerRef.current = owner;
    return () => {
      owner.release();
    };
  }, []);

  useEffect(() => {
    if (!wave) return undefined;
    let cancelled = false;
    installRef.current = null;

    const fail = (reason: PreviewFailure) =>
      setLoaded({
        install: null,
        payload: null,
        requestedLocales: null,
        failure: reason,
      });

    const load = async () => {
      let bytes: Uint8Array;
      try {
        bytes = await fetchProtocolBytes(wave.protocolPath);
      } catch {
        if (!cancelled) fail('unavailable');
        return;
      }
      const result = await installPreviewProtocol(bytes, wave.protocolFilename);
      if (cancelled) return;
      if (!result.ok) {
        fail(result.reason);
        return;
      }
      installRef.current = result.install;
      setCurrentStep(0);
      setLoaded({
        install: result.install,
        payload: createPreviewPayload(result.install),
        // Read here, after the protocol has loaded in the browser, so the
        // server render never depends on the visitor's languages.
        requestedLocales: navigator.languages,
        failure: null,
      });
    };
    void load();

    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `attempt` is bumped by Try again to load the wave afresh; its value is not needed
  }, [wave, attempt]);

  const onRequestAsset = useCallback(async (assetId: string) => {
    ownerRef.current ??= createAssetUrlOwner();
    return ownerRef.current.resolve({
      key: assetId,
      scope: PREVIEW_GENERATION,
      read: async () => {
        const data = installRef.current?.assets.get(assetId);
        if (data === undefined) {
          throw new Error(`Asset ${assetId} is not part of this protocol`);
        }
        return data;
      },
    });
  }, []);

  // Nothing is recorded, so finishing always succeeds and the Shell shows the
  // protocol's own completed state: its finish stage's text and the notice.
  const onFinish = useCallback<FinishHandler>(async () => {}, []);

  // Offered on that completed state, in the interview's language like the rest
  // of it. Starting again is a new session, so the Shell starts a new interview
  // rather than reopening the finished one.
  const completedActions = useMemo<readonly CompletedAction[]>(
    () => [
      {
        label: (
          <InterviewLanguageLabel labels={completionLabels} name="restart" />
        ),
        onAction: () => {
          if (!loaded?.install) return;
          setCurrentStep(0);
          setLoaded({
            ...loaded,
            payload: createPreviewPayload(loaded.install),
          });
        },
      },
      {
        label: (
          <InterviewLanguageLabel
            labels={completionLabels}
            name="backToProtocol"
          />
        ),
        onAction: () => window.location.assign(backHref),
      },
    ],
    [completionLabels, loaded, backHref],
  );

  const backAction = (
    <Button asChild color="default">
      <a href={backHref}>{t('backToProtocol')}</a>
    </Button>
  );

  if (!wave || failure) {
    return (
      <PreviewMessageScreen
        heading={t('errorHeading')}
        actions={
          <>
            {failure && failure !== 'unsupported-version' ? (
              <Button
                color="primary"
                onClick={() => {
                  setLoaded(null);
                  setAttempt((count) => count + 1);
                }}
              >
                {t('retry')}
              </Button>
            ) : null}
            {backAction}
          </>
        }
      >
        <Paragraph margin="none">
          {t(`errors.${failure ?? 'unavailable'}`)}
        </Paragraph>
      </PreviewMessageScreen>
    );
  }

  if (!payload || !requestedLocales) {
    return <PreviewLoadingScreen label={t('loading')} />;
  }

  return (
    <div className="h-dvh">
      <Shell
        requestedLocales={requestedLocales}
        payload={payload}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        onSync={noopSync}
        onFinish={onFinish}
        onRequestAsset={onRequestAsset}
        finishConfirmationDescription={
          <InterviewLanguageLabel
            labels={completionLabels}
            name="finishConfirmation"
          />
        }
        completedActions={completedActions}
        flags={{ isDevelopment: process.env.NODE_ENV === 'development' }}
        allowStageNavigation
        allowUserScaling
        disableAnalytics
        analytics={{
          installationId: 'website-protocol-gallery',
          hostApp: 'website-protocol-gallery-preview',
          appName: 'Website',
        }}
      />
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type CompletedAction,
  type FinishHandler,
  type InterviewPayload,
  Shell,
} from '@codaco/interview';
import { loadInterviewCatalog } from '@codaco/interview/catalog';
import {
  type AssetUrlOwner,
  createAssetUrlOwner,
} from '@codaco/interview/contract';
import { defaultLocale, isLocale, type Locale } from '~/lib/i18n/locales';
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

// The outcome of loading one wave's protocol, tagged with the wave and the
// attempt it was loaded for.
type LoadedPreview = {
  wave: PreviewWave;
  attempt: number;
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

// Rendered inside the Shell, whose interface language is the interview's own
// and can change while it runs (a language chooser, the visitor's choice). The
// interview's English is US English, the site's default.
function InterviewLanguageLabel({
  labels,
  name,
}: {
  labels: CompletionLabels;
  name: keyof CompletionLabels[Locale];
}) {
  const { locale } = useAppIntl();
  return labels[isLocale(locale) ? locale : defaultLocale][name];
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

  // What a load produced counts only for the wave and attempt it was started
  // for. Changing either, or retrying, therefore shows the loading screen at
  // once instead of the previous wave's interview or failure.
  const current =
    loaded !== null && loaded.wave === wave && loaded.attempt === attempt
      ? loaded
      : null;
  const payload = current?.payload ?? null;
  const requestedLocales = current?.requestedLocales ?? null;
  const failure = current?.failure ?? null;

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

  // The interview's messages load while the protocol downloads and installs,
  // rather than once the Shell mounts, for the browser's languages the Shell
  // is later given. A failure here is retried by the Shell itself.
  useEffect(() => {
    loadInterviewCatalog(navigator.languages).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!wave) return;
    let cancelled = false;
    installRef.current = null;

    const fail = (reason: PreviewFailure) =>
      setLoaded({
        wave,
        attempt,
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
        wave,
        attempt,
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
          if (!current?.install) return;
          setCurrentStep(0);
          setLoaded({
            ...current,
            payload: createPreviewPayload(current.install),
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
    [completionLabels, current, backHref],
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
                onClick={() => setAttempt((count) => count + 1)}
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

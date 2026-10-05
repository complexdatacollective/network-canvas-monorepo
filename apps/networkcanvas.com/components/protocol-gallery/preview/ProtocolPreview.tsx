'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type FinishHandler,
  type InterviewPayload,
  Shell,
} from '@codaco/interview';
import {
  type AssetUrlOwner,
  createAssetUrlOwner,
} from '@codaco/interview/contract';
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

export type ProtocolPreviewProps = {
  waves: PreviewWave[];
  backHref: string;
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

export function ProtocolPreview({ waves, backHref }: ProtocolPreviewProps) {
  const t = useTranslations('ProtocolGallery.preview');
  const locale = useLocale();
  const wave = useWave(waves);

  const [install, setInstall] = useState<PreviewProtocolInstall | null>(null);
  const [payload, setPayload] = useState<InterviewPayload | null>(null);
  const [failure, setFailure] = useState<PreviewFailure | null>(null);
  const [finished, setFinished] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const finishedHeadingRef = useRef<HTMLHeadingElement>(null);
  const finishedDescriptionId = useId();

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
    if (!wave) return;
    let cancelled = false;
    setInstall(null);
    installRef.current = null;
    setPayload(null);
    setFailure(null);
    setFinished(false);
    setCurrentStep(0);

    const load = async () => {
      let bytes: Uint8Array;
      try {
        bytes = await fetchProtocolBytes(wave.protocolPath);
      } catch {
        if (!cancelled) setFailure('unavailable');
        return;
      }
      const result = await installPreviewProtocol(bytes, wave.protocolFilename);
      if (cancelled) return;
      if (!result.ok) {
        setFailure(result.reason);
        return;
      }
      installRef.current = result.install;
      setInstall(result.install);
      setPayload(createPreviewPayload(result.install));
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [wave, attempt]);

  useEffect(() => {
    if (finished) finishedHeadingRef.current?.focus();
  }, [finished]);

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

  const onFinish = useCallback<FinishHandler>(async () => {
    setFinished(true);
  }, []);

  const restart = () => {
    if (!install) return;
    setFinished(false);
    setCurrentStep(0);
    setPayload(createPreviewPayload(install));
  };

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

  if (finished) {
    return (
      <PreviewMessageScreen
        heading={t('finishedHeading')}
        headingRef={finishedHeadingRef}
        describedById={finishedDescriptionId}
        actions={
          <>
            <Button color="primary" onClick={restart}>
              {t('restart')}
            </Button>
            {backAction}
          </>
        }
      >
        <Paragraph id={finishedDescriptionId} margin="none">
          {t('finishedDescription')}
        </Paragraph>
      </PreviewMessageScreen>
    );
  }

  if (!payload) {
    return <PreviewLoadingScreen label={t('loading')} />;
  }

  return (
    <div className="h-dvh">
      <Shell
        requestedLocale={locale}
        payload={payload}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        onSync={noopSync}
        onFinish={onFinish}
        onRequestAsset={onRequestAsset}
        finishConfirmationDescription={t('finishConfirmation')}
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

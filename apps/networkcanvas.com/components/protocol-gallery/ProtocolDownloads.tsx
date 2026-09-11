import { BookOpenText, Download, ExternalLink, Images } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
import type {
  ProtocolDownload,
  ProtocolSupplementaryMaterial,
} from '~/lib/protocolGallery';

function WaveActions({
  download,
  children,
}: {
  download: ProtocolDownload;
  children?: React.ReactNode;
}) {
  const t = useTranslations('ProtocolGallery.detail');

  return (
    <>
      <Button
        asChild
        color="primary"
        variant="raised"
        icon={<Download aria-hidden />}
      >
        <a href={download.protocolPath} download={download.protocolFilename}>
          {t('downloadProtocol')}
        </a>
      </Button>
      {children}
      <Button
        asChild
        color="warning"
        variant="raised"
        icon={<BookOpenText aria-hidden />}
      >
        <a href={download.codebookPath} target="_blank" rel="noreferrer">
          {t('viewCodebook')}
        </a>
      </Button>
    </>
  );
}

function WaveGroup({
  download,
  label,
}: {
  download: ProtocolDownload;
  label: string;
}) {
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className="min-w-0">
      <Eyebrow id={labelId}>{label}</Eyebrow>
      <div className="mt-2 flex flex-wrap gap-3">
        <WaveActions download={download} />
      </div>
    </div>
  );
}

export function ProtocolDownloads({
  downloads,
  supplementaryMaterials,
  sandboxUrl,
}: {
  downloads: ProtocolDownload[];
  supplementaryMaterials: ProtocolSupplementaryMaterial[];
  sandboxUrl?: string;
}) {
  const t = useTranslations('ProtocolGallery.detail');
  const [firstWave, ...laterWaves] = downloads;
  if (!firstWave) return null;

  const sandboxAction = sandboxUrl ? (
    <Button
      asChild
      color="secondary"
      variant="raised"
      icon={<ExternalLink aria-hidden />}
    >
      <a href={sandboxUrl} target="_blank" rel="noreferrer">
        {t('openSandbox')}
      </a>
    </Button>
  ) : null;
  const materialActions = supplementaryMaterials.map((material) => (
    <Button
      key={material.filename}
      asChild
      color="secondary"
      variant="raised"
      icon={<Images aria-hidden />}
    >
      <a href={material.path} target="_blank" rel="noreferrer">
        {material.label}
      </a>
    </Button>
  ));

  if (laterWaves.length === 0) {
    return (
      <div className="flex flex-wrap gap-3">
        <WaveActions download={firstWave}>{sandboxAction}</WaveActions>
        {materialActions}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sandboxAction ? (
        <div className="flex flex-wrap gap-3">{sandboxAction}</div>
      ) : null}
      {downloads.map((download) => (
        <WaveGroup
          key={download.wave}
          download={download}
          label={t('wave', { wave: download.wave })}
        />
      ))}
      {materialActions.length > 0 ? (
        <div className="flex flex-wrap gap-3">{materialActions}</div>
      ) : null}
    </div>
  );
}

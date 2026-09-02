import { BookOpenText, Download, ExternalLink, Images } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { Eyebrow } from '~/components/protocol-gallery/Eyebrow';
import { ButtonLink } from '~/components/ui/ButtonLink';
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
      <ButtonLink
        native
        href={download.protocolPath}
        download={download.protocolFilename}
        color="primary"
        variant="raised"
      >
        <Download aria-hidden />
        {t('downloadProtocol')}
      </ButtonLink>
      {children}
      <ButtonLink
        external
        href={download.codebookPath}
        color="warning"
        variant="raised"
      >
        <BookOpenText aria-hidden />
        {t('viewCodebook')}
      </ButtonLink>
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
    <ButtonLink external href={sandboxUrl} color="secondary" variant="raised">
      {t('openSandbox')}
      <ExternalLink aria-hidden />
    </ButtonLink>
  ) : null;
  const materialActions = supplementaryMaterials.map((material) => (
    <ButtonLink
      key={material.filename}
      external
      href={material.path}
      color="secondary"
      variant="raised"
    >
      <Images aria-hidden />
      {material.label}
    </ButtonLink>
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

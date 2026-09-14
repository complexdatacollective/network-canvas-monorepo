import { BookOpenText, Download, Images } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
import { PreviewProtocolButton } from '~/components/protocol-gallery/PreviewProtocolButton';
import type {
  ProtocolDownload,
  ProtocolSupplementaryMaterial,
} from '~/lib/protocolGallery';
import { protocolGalleryPreviewHref } from '~/lib/siteUrls';

function WaveActions({
  download,
  previewHref,
}: {
  download: ProtocolDownload;
  previewHref: string;
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
      <PreviewProtocolButton href={previewHref} />
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
  previewHref,
  label,
}: {
  download: ProtocolDownload;
  previewHref: string;
  label: string;
}) {
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className="min-w-0">
      <Eyebrow id={labelId}>{label}</Eyebrow>
      <div className="mt-2 flex flex-wrap gap-3">
        <WaveActions download={download} previewHref={previewHref} />
      </div>
    </div>
  );
}

export function ProtocolDownloads({
  locale,
  slug,
  downloads,
  supplementaryMaterials,
}: {
  locale: string;
  slug: string;
  downloads: ProtocolDownload[];
  supplementaryMaterials: ProtocolSupplementaryMaterial[];
}) {
  const t = useTranslations('ProtocolGallery.detail');
  const [firstWave, ...laterWaves] = downloads;
  if (!firstWave) return null;

  const previewHref = (wave: number) =>
    protocolGalleryPreviewHref(locale, slug, wave);
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
        <WaveActions
          download={firstWave}
          previewHref={previewHref(firstWave.wave)}
        />
        {materialActions}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {downloads.map((download) => (
        <WaveGroup
          key={download.wave}
          download={download}
          previewHref={previewHref(download.wave)}
          label={t('wave', { wave: download.wave })}
        />
      ))}
      {materialActions.length > 0 ? (
        <div className="flex flex-wrap gap-3">{materialActions}</div>
      ) : null}
    </div>
  );
}

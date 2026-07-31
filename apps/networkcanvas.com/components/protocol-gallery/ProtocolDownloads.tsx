'use client';

import { BookOpenText, Download, ExternalLink, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cn } from '~/lib/cn';
import type { ProtocolDownload } from '~/lib/protocolGallery';

export function ProtocolDownloads({
  downloads,
  sandboxUrl,
}: {
  downloads: ProtocolDownload[];
  sandboxUrl: string;
}) {
  const t = useTranslations('ProtocolGallery.detail');

  return (
    <Surface spacing="lg" shadow="lg" className="overflow-visible">
      <Heading level="h2" margin="none" className="text-3xl">
        {t('downloads')}
      </Heading>
      <Paragraph margin="none" className="text-text/70 mt-4 max-w-3xl">
        {t('downloadDescription')}
      </Paragraph>

      <div className="mt-8 space-y-6">
        {downloads.map((download) => (
          <div
            key={download.wave}
            className="border-outline/45 border-t pt-6 first:border-t-0 first:pt-0"
          >
            {downloads.length > 1 ? (
              <Heading level="h3" margin="none" className="text-xl">
                {t('wave', { wave: download.wave })}
              </Heading>
            ) : null}
            <div
              className={cn(
                'flex flex-wrap gap-3',
                downloads.length > 1 && 'mt-4',
              )}
            >
              <a
                href={download.protocolPath}
                download={download.protocolFilename}
                className={buttonVariants({
                  color: 'primary',
                  variant: 'raised',
                })}
              >
                <Download aria-hidden className="size-5" />
                {t('downloadProtocol')}
              </a>
              <a
                href={download.codebookPath}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({
                  color: 'secondary',
                  variant: 'outline',
                })}
              >
                <BookOpenText aria-hidden className="size-5" />
                {t('viewCodebook')}
              </a>
            </div>
          </div>
        ))}
      </div>

      <a
        href={sandboxUrl}
        target="_blank"
        rel="noreferrer"
        className={cn(
          buttonVariants({ color: 'default', variant: 'text' }),
          'mt-7',
        )}
      >
        <FileText aria-hidden className="size-5" />
        {t('openSandbox')}
        <ExternalLink aria-hidden className="size-4" />
      </a>
    </Surface>
  );
}

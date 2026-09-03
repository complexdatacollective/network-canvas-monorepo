import { ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@codaco/fresco-ui/Badge';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Eyebrow from '@codaco/fresco-ui/typography/Eyebrow';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { StageBar } from '~/components/protocol-gallery/StageBar';
import { cn } from '~/lib/cn';
import type { GalleryProtocol } from '~/lib/protocolGallery';
import { protocolGalleryHref } from '~/lib/siteUrls';
import { summarizeStages } from '~/lib/stageTypes';

function CardFacetRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
      <Eyebrow render={<span />}>{label}</Eyebrow>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant="outline">
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function ProtocolGalleryCard({
  protocol,
  itemProps,
}: {
  protocol: GalleryProtocol;
  itemProps: ItemProps;
}) {
  const t = useTranslations('ProtocolGallery');
  const locale = useLocale();
  const firstWave = protocol.downloads[0];
  const stages = firstWave?.stages ?? [];
  const summary = summarizeStages(stages);
  const caption = [
    t('stages.count', { count: summary.total }),
    ...summary.edgeCounts.map(({ type, count }) =>
      t(`stages.edgeStageCounts.${type}`, { count }),
    ),
    ...(protocol.downloads.length > 1
      ? [t('stages.waves', { count: protocol.downloads.length })]
      : []),
  ].join(' · ');
  const dateAdded = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${protocol.dateAdded}T00:00:00Z`));

  return (
    <a
      {...itemProps}
      href={protocolGalleryHref(locale, protocol.slug)}
      aria-label={t('collection.openProtocol', { title: protocol.shortName })}
      className="focusable group block size-full rounded transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transform-none"
    >
      <Surface
        noContainer
        spacing="none"
        shadow="lg"
        className={cn(
          'flex size-full flex-col',
          protocol.featured && 'border-primary border-2',
        )}
      >
        <div className="flex flex-col gap-3 px-6 py-6">
          {protocol.featured ? (
            <Eyebrow tone="primary">{t('intro.featured')}</Eyebrow>
          ) : null}
          <Heading level="h3" margin="none">
            {protocol.shortName}
          </Heading>
          <Heading
            level="label"
            variant="subtitle"
            margin="none"
            render={<p />}
          >
            {protocol.title}
          </Heading>
          <Paragraph margin="none" intent="meta" emphasis="muted">
            {protocol.authors}
          </Paragraph>
          <Paragraph margin="none" intent="smallText">
            {protocol.description}
          </Paragraph>
        </div>

        <Surface
          noContainer
          spacing="md"
          shadow="none"
          className="bg-platinum [[data-theme=dark]_&]:bg-surface-1 mt-auto flex flex-col gap-4 rounded-t-none"
        >
          <div>
            <StageBar stages={stages} />
            <Paragraph
              margin="none"
              intent="meta"
              emphasis="muted"
              className="mt-2"
            >
              {caption}
            </Paragraph>
          </div>
          <hr className="my-0" />
          <CardFacetRow
            label={t('card.edges')}
            values={protocol.edgeGeneration}
          />
          <CardFacetRow label={t('card.fields')} values={protocol.fields} />
          <hr className="my-0" />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Paragraph
              margin="none"
              intent="meta"
              emphasis="muted"
              render={<span />}
              className="whitespace-nowrap"
            >
              {t('card.added', { date: dateAdded })}
            </Paragraph>
            <Eyebrow
              render={<span />}
              tone="primary"
              aria-hidden
              className="flex shrink-0 items-center gap-1 whitespace-nowrap"
            >
              {t('collection.viewDetails')}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5 motion-reduce:transform-none" />
            </Eyebrow>
          </div>
        </Surface>
      </Surface>
    </a>
  );
}

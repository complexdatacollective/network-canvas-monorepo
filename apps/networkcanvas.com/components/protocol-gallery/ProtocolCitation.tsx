import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { OverlineHeading } from '~/components/protocol-gallery/OverlineHeading';
import { NativeLink } from '~/components/ui/NativeLink';

export function ProtocolCitation({
  citation,
  publicationUrl,
}: {
  citation: string;
  publicationUrl: string;
}) {
  const t = useTranslations('ProtocolGallery.detail');

  return (
    <Surface
      noContainer
      spacing="lg"
      shadow="md"
      className="bg-neutral-contrast text-neutral"
    >
      <OverlineHeading>{t('citation')}</OverlineHeading>
      <Paragraph margin="none" className="mt-4 whitespace-pre-line">
        {citation}
      </Paragraph>
      <span className="mt-5 inline-flex items-center gap-2">
        <NativeLink
          href={publicationUrl}
          target="_blank"
          rel="noreferrer"
          className="text-current"
        >
          {t('viewPublication')}
        </NativeLink>
        <ExternalLink aria-hidden className="size-4" />
      </span>
    </Surface>
  );
}

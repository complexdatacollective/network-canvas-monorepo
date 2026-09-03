import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { OverlineHeading } from '~/components/protocol-gallery/OverlineHeading';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { contactEmail } from '~/lib/content';

export function SubmitProtocolCard() {
  const t = useTranslations('ProtocolGallery.submit');

  return (
    <Surface
      noContainer
      spacing="md"
      shadow="sm"
      className="tablet-portrait:flex-row tablet-portrait:items-center tablet-portrait:gap-6 flex flex-col gap-3"
    >
      <div className="min-w-0 flex-1">
        <OverlineHeading>{t('heading')}</OverlineHeading>
        <Paragraph margin="none" intent="smallText" className="mt-1">
          {t('description')}
        </Paragraph>
      </div>
      <ButtonLink
        native
        href={`mailto:${contactEmail}`}
        color="secondary"
        variant="raised"
        size="sm"
        className="tablet-portrait:self-center shrink-0 self-start"
      >
        <Mail aria-hidden />
        {t('action')}
      </ButtonLink>
    </Surface>
  );
}

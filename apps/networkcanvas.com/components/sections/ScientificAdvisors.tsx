import { useTranslations } from 'next-intl';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { scientificAdvisors } from '~/lib/content';

export function ScientificAdvisors() {
  const t = useTranslations('ScientificAdvisors');

  return (
    <div
      data-homepage-weave-target
      className="mx-auto mt-16 max-w-3xl text-center"
    >
      <Heading
        level="h3"
        margin="none"
        className="font-heading text-text text-xl font-bold"
      >
        {t('heading')}
      </Heading>
      <Paragraph margin="none" className="text-text/70 mt-3 text-base">
        {scientificAdvisors.join(', ')}
      </Paragraph>
    </div>
  );
}

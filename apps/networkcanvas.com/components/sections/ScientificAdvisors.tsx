import { useTranslations } from 'next-intl';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Reveal } from '~/components/ui/Reveal';
import { scrollDrivenRevealMotion } from '~/components/ui/scrollDrivenMotion';
import { scientificAdvisors } from '~/lib/content';

export function ScientificAdvisors() {
  const t = useTranslations('ScientificAdvisors');

  return (
    <Reveal
      {...scrollDrivenRevealMotion}
      className="mx-auto mt-16 max-w-3xl text-center"
    >
      <Heading
        level="h3"
        variant="subheading"
        margin="none"
        className="text-text"
      >
        {t('heading')}
      </Heading>
      <Paragraph margin="none" className="text-text/70 mt-3 text-base">
        {scientificAdvisors.join(', ')}
      </Paragraph>
    </Reveal>
  );
}

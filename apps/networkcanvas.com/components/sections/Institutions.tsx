import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { institutions } from '~/lib/content';

function renderPriorLink(chunks: ReactNode) {
  return (
    <NativeLink
      href="https://reporter.nih.gov/search/MPUhMnE1GkqRHltT4rj3TQ/project-details/10405582"
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

function renderOngoingLink(chunks: ReactNode) {
  return (
    <NativeLink
      href="https://reporter.nih.gov/search/vo3bW-y-mE6OeQAQvDNH5g/project-details/10233551"
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

export function Institutions() {
  const t = useTranslations('Institutions');

  return (
    <Container className="tablet-landscape:py-24 py-20">
      <SectionHeading title={t('heading')}>
        <Paragraph margin="none">
          {t.rich('paragraph1', {
            prior: renderPriorLink,
            ongoing: renderOngoingLink,
          })}
        </Paragraph>
        <Paragraph margin="none" className="mt-3">
          {t('paragraph2')}
        </Paragraph>
      </SectionHeading>

      <div className="mt-14 flex flex-wrap items-center justify-center gap-x-16 gap-y-10">
        {institutions.map((inst) => (
          <img
            key={inst.name}
            src={inst.logo}
            alt={inst.name}
            className="tablet-landscape:h-20 h-16 w-auto object-contain"
          />
        ))}
      </div>
    </Container>
  );
}

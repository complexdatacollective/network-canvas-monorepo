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

      <div
        data-homepage-weave-target
        data-homepage-weave-moving-target
        className="mt-14 flex flex-wrap items-center justify-center gap-x-16 gap-y-10"
      >
        {institutions.map((inst) => (
          // Partner logos are fixed-colour brand assets. In dark mode they sit on
          // a light plate so dark marks (e.g. the Oxford wordmark) stay legible;
          // in light mode the plate is absent and the logos render as before.
          <div
            key={inst.name}
            className="[[data-theme=dark]_&]:rounded [[data-theme=dark]_&]:bg-white/90 [[data-theme=dark]_&]:px-5 [[data-theme=dark]_&]:py-3"
          >
            <img
              src={inst.logo}
              alt={inst.name}
              className="tablet-landscape:h-20 h-16 w-auto object-contain"
            />
          </div>
        ))}
      </div>
    </Container>
  );
}

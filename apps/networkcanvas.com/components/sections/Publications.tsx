import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { externalLinks } from '~/lib/content';
import type { Publication } from '~/lib/siteContent';

import { PublicationRail } from './PublicationRail';

const headingId = 'recent-publications-heading';

function renderArticleLink(chunks: ReactNode) {
  return (
    <NativeLink
      href={externalLinks.publications}
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

function renderThreadLink(chunks: ReactNode) {
  return (
    <NativeLink
      href={externalLinks.shareYourWork}
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

export function Publications({
  publications,
}: {
  publications: readonly Publication[];
}) {
  const t = useTranslations('Publications');

  return (
    <PublicationRail
      publications={publications}
      headingId={headingId}
      railLabel={t('carouselLabel')}
    >
      <SectionHeading title={t('heading')} id={headingId}>
        <Paragraph margin="none">
          {t.rich('introduction', { article: renderArticleLink })}
        </Paragraph>
        <Paragraph margin="none" className="mt-3">
          {t.rich('submission', { thread: renderThreadLink })}
        </Paragraph>
      </SectionHeading>
    </PublicationRail>
  );
}

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { externalLinks } from '~/lib/content';
import type { Publication } from '~/lib/siteContent';

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
    <Container maxWidth="full" className="tablet-landscape:py-28 py-20">
      <SectionHeading title={t('heading')}>
        <Paragraph margin="none">
          {t.rich('introduction', { article: renderArticleLink })}
        </Paragraph>
        <Paragraph margin="none" className="mt-3">
          {t.rich('submission', { thread: renderThreadLink })}
        </Paragraph>
      </SectionHeading>

      <div className="tablet-portrait:grid-cols-2 tablet-landscape:grid-cols-4 mt-14 grid w-full grid-cols-1 gap-5">
        {publications.map((pub, i) => (
          <Reveal key={pub.id} delay={(i % 4) * 0.04}>
            <a
              href={pub.href}
              target="_blank"
              rel="noreferrer"
              className="focusable bg-surface-3 text-surface-3-contrast tablet-portrait:p-7 flex h-full flex-col rounded p-6 shadow-lg transition-transform hover:-translate-y-1"
            >
              <Heading
                level="h3"
                margin="none"
                className="font-heading tablet-landscape:text-xl text-lg leading-snug font-bold"
              >
                {pub.title}
              </Heading>
              <Paragraph
                margin="none"
                className="font-heading text-surface-3-contrast/55 mt-4 text-xs font-bold tracking-[0.15em] uppercase"
              >
                {pub.source}
              </Paragraph>
              <Paragraph
                margin="none"
                className="text-surface-3-contrast/70 mt-3 text-sm"
              >
                {pub.authors}
              </Paragraph>
            </a>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}

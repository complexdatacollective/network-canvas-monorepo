import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { externalLinks } from '~/lib/content';
import type { Publication } from '~/lib/siteContent';

function renderArticleLink(chunks: ReactNode) {
  return (
    <a
      href={externalLinks.publications}
      target="_blank"
      rel="noreferrer"
      className="text-link font-bold hover:underline"
    >
      {chunks}
    </a>
  );
}

function renderThreadLink(chunks: ReactNode) {
  return (
    <a
      href={externalLinks.shareYourWork}
      target="_blank"
      rel="noreferrer"
      className="text-link font-bold hover:underline"
    >
      {chunks}
    </a>
  );
}

export function Publications({
  publications,
}: {
  publications: readonly Publication[];
}) {
  const t = useTranslations('Publications');

  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title={t('heading')}>
        <Paragraph margin="none">
          {t.rich('introduction', { article: renderArticleLink })}
        </Paragraph>
        <Paragraph margin="none" className="mt-3">
          {t.rich('submission', { thread: renderThreadLink })}
        </Paragraph>
      </SectionHeading>

      <div className="tablet-landscape:grid-cols-2 mt-14 grid gap-6">
        {publications.map((pub, i) => (
          <Reveal key={pub.id} delay={(i % 2) * 0.06}>
            <a
              href={pub.href}
              target="_blank"
              rel="noreferrer"
              className="focusable bg-cyber-grape tablet-landscape:p-10 flex h-full flex-col rounded-[1.75rem] p-8 text-white shadow-lg transition-transform hover:-translate-y-1"
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
                className="font-heading mt-4 text-xs font-bold tracking-[0.15em] text-white/55 uppercase"
              >
                {pub.source}
              </Paragraph>
              <Paragraph margin="none" className="mt-3 text-sm text-white/70">
                {pub.authors}
              </Paragraph>
            </a>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}

import { useTranslations } from 'next-intl';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { MailingListForm } from '~/components/sections/MailingListForm';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { externalLinks } from '~/lib/content';

export function WhatNext() {
  const t = useTranslations('WhatNext');
  const cards = [
    {
      id: 'documentation',
      title: t('documentation.title'),
      body: t('documentation.body'),
      icon: '/images/icons/docs.png',
      action: (
        <ButtonLink
          href={externalLinks.documentation}
          external
          color="default"
          className="bg-neon-coral mt-6 rounded-full text-white"
        >
          {t('documentation.action')}
        </ButtonLink>
      ),
    },
    {
      id: 'community',
      title: t('community.title'),
      body: t('community.body'),
      icon: '/images/icons/community.png',
      action: (
        <ButtonLink
          href={externalLinks.community}
          external
          color="default"
          className="bg-sea-green mt-6 rounded-full text-white"
        >
          {t('community.action')}
        </ButtonLink>
      ),
    },
    {
      id: 'keepInTouch',
      title: t('keepInTouch.title'),
      body: t('keepInTouch.body'),
      icon: '/images/icons/keep-in-touch.png',
      action: <MailingListForm />,
    },
    {
      id: 'collaboration',
      title: t('collaboration.title'),
      body: t('collaboration.body'),
      icon: '/images/icons/collaborate.png',
      action: (
        <ButtonLink
          href={externalLinks.collaboration}
          external
          color="default"
          className="bg-mustard mt-6 rounded-full text-white"
        >
          {t('collaboration.action')}
        </ButtonLink>
      ),
    },
  ];

  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionTitle title={t('heading')} />
      <div className="mt-12 flex flex-col gap-6">
        {cards.map((card) => (
          <Reveal
            key={card.id}
            data-homepage-weave-target
            data-homepage-weave-moving-target
            className="bg-surface tablet-landscape:gap-10 tablet-landscape:p-10 flex items-center gap-6 rounded p-8 shadow-lg"
          >
            <div className="flex-1">
              <Heading
                level="h3"
                variant="subheading"
                margin="none"
                className="text-text"
              >
                {card.title}
              </Heading>
              <Paragraph
                margin="none"
                className="text-text/80 mt-3 max-w-xl text-base leading-relaxed"
              >
                {card.body}
              </Paragraph>
              {card.action}
            </div>
            <img
              src={card.icon}
              alt=""
              aria-hidden="true"
              className="phone-landscape:block tablet-landscape:size-28 hidden size-24 shrink-0"
            />
          </Reveal>
        ))}
      </div>
    </Container>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Heading
      level="h2"
      variant="section-heading"
      margin="none"
      className="text-text text-center"
    >
      {title}
    </Heading>
  );
}

import { useTranslations } from 'next-intl';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { MailingListForm } from '~/components/sections/MailingListForm';
import { Container } from '~/components/ui/Container';
import { PillLink } from '~/components/ui/PillLink';
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
        <PillLink
          href={externalLinks.documentation}
          external
          tone="neon-coral"
          className="mt-6"
        >
          {t('documentation.action')}
        </PillLink>
      ),
    },
    {
      id: 'community',
      title: t('community.title'),
      body: t('community.body'),
      icon: '/images/icons/community.png',
      action: (
        <PillLink
          href={externalLinks.community}
          external
          tone="sea-green"
          className="mt-6"
        >
          {t('community.action')}
        </PillLink>
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
        <PillLink
          href={externalLinks.collaboration}
          external
          tone="mustard"
          className="mt-6"
        >
          {t('collaboration.action')}
        </PillLink>
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
            className="bg-surface tablet-landscape:gap-10 tablet-landscape:p-10 flex items-center gap-6 rounded-[1.75rem] p-8 shadow-lg"
          >
            <div className="flex-1">
              <Heading
                level="h3"
                margin="none"
                className="font-heading text-cyber-grape text-2xl font-bold"
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
      margin="none"
      className="font-heading text-cyber-grape tablet-landscape:text-4xl text-center text-3xl font-bold"
    >
      {title}
    </Heading>
  );
}

import { useTranslations } from 'next-intl';

import Button from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { MailingListForm } from '~/components/sections/MailingListForm';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { scrollDrivenRevealMotion } from '~/components/ui/scrollDrivenMotion';
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
        <Button
          asChild
          color="default"
          className="bg-neon-coral mt-6 rounded-full text-white"
        >
          <a
            href={externalLinks.documentation}
            target="_blank"
            rel="noreferrer"
          >
            {t('documentation.action')}
          </a>
        </Button>
      ),
    },
    {
      id: 'community',
      title: t('community.title'),
      body: t('community.body'),
      icon: '/images/icons/community.png',
      action: (
        <Button
          asChild
          color="default"
          className="bg-sea-green mt-6 rounded-full text-white"
        >
          <a href={externalLinks.community} target="_blank" rel="noreferrer">
            {t('community.action')}
          </a>
        </Button>
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
        <Button
          asChild
          color="default"
          className="bg-mustard mt-6 rounded-full text-white"
        >
          <a
            href={externalLinks.collaboration}
            target="_blank"
            rel="noreferrer"
          >
            {t('collaboration.action')}
          </a>
        </Button>
      ),
    },
  ];

  return (
    <Container className="">
      <Reveal {...scrollDrivenRevealMotion}>
        <SectionTitle title={t('heading')} />
      </Reveal>
      <div className="tablet-landscape:gap-12 mt-16 flex flex-col gap-8">
        {cards.map((card, index) => (
          <Reveal
            key={card.id}
            {...scrollDrivenRevealMotion}
            delay={index * 0.07}
            className="bg-surface/55 tablet-landscape:gap-10 tablet-landscape:p-10 flex items-center gap-6 rounded p-8 shadow-lg backdrop-blur-md"
          >
            <div key="content" className="flex-1">
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
              key="icon"
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

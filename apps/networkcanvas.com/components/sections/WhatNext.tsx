import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { MailingListForm } from '~/components/sections/MailingListForm';
import { Container } from '~/components/ui/Container';
import { PillLink } from '~/components/ui/PillLink';
import { Reveal } from '~/components/ui/Reveal';
import { externalLinks } from '~/lib/content';

type Card = {
  title: string;
  body: ReactNode;
  icon: string;
  action: ReactNode;
};

const cards: Card[] = [
  {
    title: 'Want to learn more?',
    body: 'We have created extensive documentation, covering all aspects of creating, deploying, and managing a study using Network Canvas.',
    icon: '/images/icons/docs.png',
    action: (
      <PillLink
        href={externalLinks.documentation}
        external
        tone="neon-coral"
        className="mt-6"
      >
        Visit Documentation Site
      </PillLink>
    ),
  },
  {
    title: 'Looking for help?',
    body: 'We have also recently launched a community website, where you can ask questions, report bugs, share your work, and get help from other researchers.',
    icon: '/images/icons/community.png',
    action: (
      <PillLink
        href={externalLinks.community}
        external
        tone="sea-green"
        className="mt-6"
      >
        Visit Community Website
      </PillLink>
    ),
  },
  {
    title: 'Keep in touch',
    body: 'If you would like to stay in touch with the project, and find out about events and releases as soon as they happen, we encourage you to join our mailing list, and to follow us on Twitter. We are considerate email partners, and will only ever use this list for important announcements.',
    icon: '/images/icons/keep-in-touch.png',
    action: <MailingListForm />,
  },
  {
    title: 'Want to collaborate?',
    body: "If you are interested in a formal academic or consultancy-based collaboration, please see our documentation article on the subject. Unfortunately, we're unable to offer unpaid consultancies due to limited bandwidth of a small team.",
    icon: '/images/icons/collaborate.png',
    action: (
      <PillLink
        href={externalLinks.collaboration}
        external
        tone="mustard"
        className="mt-6"
      >
        Explore Collaboration Options
      </PillLink>
    ),
  },
];

export function WhatNext() {
  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionTitle />
      <div className="mt-12 flex flex-col gap-6">
        {cards.map((card) => (
          <Reveal
            key={card.title}
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

function SectionTitle() {
  return (
    <Heading
      level="h2"
      margin="none"
      className="font-heading text-cyber-grape tablet-landscape:text-4xl text-center text-3xl font-bold"
    >
      What next?
    </Heading>
  );
}

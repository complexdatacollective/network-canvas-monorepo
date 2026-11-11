'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Button, type ButtonProps } from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { useOnceInView } from '~/components/ui/useOnceInView';
import { cn } from '~/lib/cn';
import { externalLinks } from '~/lib/content';

import { KeepInTouch } from './KeepInTouch';
import { ForumDrawing, OutlineDrawing, TriadDrawing } from './WhatNextDrawings';

// Two doors lead on from the homepage: documentation and the community forum
// are two large panels side by side, each headed by a drawing that plays once
// as they come into view. Collaboration follows as a quieter row, and the
// mailing list closes the section. Nothing loops.

const glass = 'bg-surface/55 elevation-medium rounded backdrop-blur-md';

type Action = {
  label: string;
  href: string;
  // Fresco Button colours whose label is white in both themes, one per door.
  color: Extract<ButtonProps['color'], 'primary' | 'success' | 'info'>;
};

/** A panel's action: Fresco's Button, opening the link in a new tab. */
function ActionLink({
  action,
  className,
}: {
  action: Action;
  className?: string;
}) {
  return (
    <Button asChild color={action.color} className={className}>
      <a href={action.href} target="_blank" rel="noreferrer">
        {action.label}
      </a>
    </Button>
  );
}

function Door({
  title,
  body,
  action,
  drawing,
}: {
  title: string;
  body: string;
  action: Action;
  drawing: ReactNode;
}) {
  return (
    <article
      className={cn(
        glass,
        'tablet-landscape:px-12 tablet-landscape:pt-10 tablet-landscape:pb-12 flex flex-col items-start px-6 pt-8 pb-9',
      )}
    >
      {drawing}
      <Heading
        level="h3"
        variant="subheading"
        margin="none"
        className="text-text"
      >
        {title}
      </Heading>
      <Paragraph
        margin="none"
        className="text-text/80 mt-3 mb-7 max-w-xl text-base leading-relaxed"
      >
        {body}
      </Paragraph>
      <ActionLink action={action} className="mt-auto" />
    </article>
  );
}

export function WhatNext() {
  const t = useTranslations('WhatNext');
  const { ref, play, timing } = useOnceInView<HTMLDivElement>();

  return (
    <Container>
      <SectionHeading title={t('heading')} />
      <div
        ref={ref}
        className="tablet-portrait:grid-cols-2 tablet-portrait:gap-8 mt-16 grid gap-6"
      >
        <Door
          title={t('documentation.title')}
          body={t('documentation.body')}
          action={{
            label: t('documentation.action'),
            href: externalLinks.documentation,
            color: 'primary',
          }}
          drawing={<OutlineDrawing play={play} timing={timing} />}
        />
        <Door
          title={t('community.title')}
          body={t('community.body')}
          action={{
            label: t('community.action'),
            href: externalLinks.community,
            color: 'success',
          }}
          drawing={<ForumDrawing play={play} timing={timing} />}
        />
      </div>

      <article
        className={cn(
          glass,
          'tablet-portrait:mt-8 tablet-portrait:grid-cols-[4rem_1fr_auto] tablet-portrait:px-10 tablet-portrait:py-7 mt-6 grid items-center gap-x-8 gap-y-4 p-6',
        )}
      >
        <TriadDrawing />
        <div>
          <Heading
            level="h3"
            margin="none"
            className="text-text text-xl font-black"
          >
            {t('collaboration.title')}
          </Heading>
          <Paragraph
            margin="none"
            className="text-text/80 mt-1.5 max-w-[46rem] text-base leading-relaxed"
          >
            {t('collaboration.body')}
          </Paragraph>
        </div>
        <ActionLink
          action={{
            label: t('collaboration.action'),
            href: externalLinks.collaboration,
            color: 'info',
          }}
          className="justify-self-start"
        />
      </article>

      <KeepInTouch />
    </Container>
  );
}

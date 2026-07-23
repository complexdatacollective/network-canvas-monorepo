import type { ReactNode } from 'react';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Reveal } from '~/components/ui/Reveal';
import { cn } from '~/lib/cn';

import { summerUpdateRevealMotion } from './summerUpdateMotion';

export function BenefitCard({
  children,
  delay,
  icon,
  title,
}: {
  children: ReactNode;
  delay: number;
  icon: 'blue' | 'cyan' | 'green' | 'coral' | 'mustard';
  title: string;
}) {
  const iconClass = {
    blue: 'border-cerulean-blue/35 bg-cerulean-blue/10',
    cyan: 'border-sea-serpent/35 bg-sea-serpent/10',
    green: 'border-sea-green/35 bg-sea-green/10',
    coral: 'border-neon-coral/35 bg-neon-coral/10',
    mustard: 'border-mustard/35 bg-mustard/10',
  }[icon];
  const iconDotClass = {
    blue: 'bg-cerulean-blue',
    cyan: 'bg-sea-serpent',
    green: 'bg-sea-green',
    coral: 'bg-neon-coral',
    mustard: 'bg-mustard',
  }[icon];

  return (
    <Reveal {...summerUpdateRevealMotion} delay={delay} scrollStagger={2.2}>
      <Surface
        as="article"
        noContainer
        spacing="lg"
        shadow="sm"
        className="h-full"
      >
        <div
          className={cn(
            'tablet-portrait:grid relative mb-6 hidden size-12 place-items-center rounded-full border',
            iconClass,
          )}
          aria-hidden
        >
          <span className={cn('size-4 rounded-full', iconDotClass)} />
        </div>
        <Heading level="h3" className="mt-0!">
          {title}
        </Heading>
        <Paragraph className="text-current/75">{children}</Paragraph>
      </Surface>
    </Reveal>
  );
}

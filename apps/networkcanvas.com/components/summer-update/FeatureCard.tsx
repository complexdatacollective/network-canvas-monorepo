import type { ReactNode } from 'react';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Reveal } from '~/components/ui/Reveal';
import { cn } from '~/lib/cn';

import {
  accentBackgroundClasses,
  type AccentColor,
} from './summerUpdateColors';
import { summerUpdateRevealMotion } from './summerUpdateMotion';

export function FeatureCard({
  children,
  color,
  delay,
  title,
}: {
  children: ReactNode;
  color: AccentColor;
  delay: number;
  title: string;
}) {
  return (
    <Reveal {...summerUpdateRevealMotion} direction="right" delay={delay}>
      <Surface
        as="article"
        noContainer
        spacing="sm"
        shadow="xs"
        className="flex gap-4"
      >
        <span
          aria-hidden
          className={cn(
            'mt-2 size-2.5 shrink-0 rounded-full',
            accentBackgroundClasses[color],
          )}
        />
        <div>
          <Heading level="h4">{title}</Heading>
          <Paragraph intent="smallText">{children}</Paragraph>
        </div>
      </Surface>
    </Reveal>
  );
}

import { ExternalLink } from 'lucide-react';
import Image from 'next/image';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cn } from '~/lib/cn';

import {
  accentSoftBackgroundClasses,
  accentTextClasses,
} from './summerUpdateColors';
import { type destinationLinks } from './summerUpdateContent';

export function DestinationCard({
  destination,
  index,
}: {
  destination: (typeof destinationLinks)[number];
  index: number;
}) {
  return (
    <Surface
      as="a"
      href={destination.href}
      noContainer
      spacing="lg"
      shadow="sm"
      className="spring-discrete-medium effect-shadow-sm group hover:effect-shadow-md relative flex h-full flex-col overflow-hidden border transition hover:-translate-y-1"
    >
      <div className="flex items-start justify-between gap-6">
        <span
          aria-hidden
          className={cn(
            'flex size-14 items-center justify-center rounded-sm',
            accentSoftBackgroundClasses[destination.color],
          )}
        >
          <Image
            src={destination.icon}
            alt=""
            width={40}
            height={40}
            className="rounded-xs"
          />
        </span>
        <span className="font-monospace text-xs tracking-widest text-current/35">
          {String(index + 1).padStart(2, '0')} / 04
        </span>
      </div>
      <div className="mt-8 flex flex-1 flex-col">
        <span
          className={cn(
            'font-monospace text-xs font-semibold tracking-widest uppercase',
            accentTextClasses[destination.color],
          )}
        >
          {destination.category}
        </span>
        <div className="mb-4">
          <Heading level="h3" variant="subheading" margin="none">
            {destination.title}
          </Heading>
        </div>
        <Paragraph intent="smallText" emphasis="muted">
          {destination.description}
        </Paragraph>
        <div className="border-text/10 mt-auto flex items-center justify-between gap-4 border-t pt-5">
          <ExternalLink
            aria-hidden
            className={cn(
              'size-4 shrink-0 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1',
              accentTextClasses[destination.color],
            )}
          />
        </div>
      </div>
    </Surface>
  );
}

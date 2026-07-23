import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { cn } from '~/lib/cn';

type SectionHeadingProps = {
  title: string;
  children?: ReactNode;
  className?: string;
  id?: string;
};

export function SectionHeading({
  title,
  children,
  className,
  id,
}: SectionHeadingProps) {
  return (
    <div className={cn('mx-auto max-w-2xl text-center', className)}>
      <Heading
        level="h2"
        variant="section-heading"
        margin="none"
        id={id}
        className="text-text"
      >
        {title}
      </Heading>
      {children ? (
        <div className="text-text/80 tablet-landscape:text-lg mt-5 text-base">
          {children}
        </div>
      ) : null}
    </div>
  );
}

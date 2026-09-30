import type { ReactNode, Ref } from 'react';

import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

/**
 * The preview window shows exactly one thing at a time: the interview, or a
 * centred message about it. These are the message layouts.
 */
export function PreviewMessageScreen({
  heading,
  headingRef,
  describedById,
  children,
  actions,
}: {
  heading: string;
  headingRef?: Ref<HTMLHeadingElement>;
  describedById?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <Heading
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        aria-describedby={describedById}
        level="h1"
        variant="section-heading"
        margin="none"
      >
        {heading}
      </Heading>
      <div className="max-w-prose">{children}</div>
      {actions ? (
        <div className="flex flex-wrap justify-center gap-3">{actions}</div>
      ) : null}
    </div>
  );
}

export function PreviewLoadingScreen({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <Spinner size="lg" />
      <Paragraph margin="none">{label}</Paragraph>
    </div>
  );
}

import NextLink from 'next/link';
import type { ReactNode } from 'react';

import Definition from '@codaco/fresco-ui/Definition';

type TermEntry = {
  href: string;
  definition: string;
};

const TERMS: Record<string, TermEntry> = {
  'architect-classic': {
    href: '/en/design-protocols/installing-architect-classic',
    definition:
      'The original downloadable desktop app for designing schema 7 protocols. It remains available for in-progress studies and is fully supported, but is in maintenance mode and will not receive new features.',
  },
  'interviewer-classic': {
    href: '/en/collect-data/interviewer/installing-interviewer',
    definition:
      'The original downloadable desktop and tablet app for running schema 7 protocols offline. It remains available for in-progress studies and is fully supported, but is in maintenance mode and will not receive new features.',
  },
};

type TermProps = {
  name: string;
  currentSlug?: string;
  children: ReactNode;
};

const Term = ({ name, currentSlug, children }: TermProps) => {
  const term = TERMS[name];

  if (!term) {
    return <>{children}</>;
  }

  const onOwnPage =
    Boolean(currentSlug) && term.href.endsWith(`/${currentSlug}`);

  return (
    <Definition
      definition={term.definition}
      render={
        onOwnPage ? undefined : <NextLink href={{ pathname: term.href }} />
      }
    >
      {children}
    </Definition>
  );
};

export default Term;

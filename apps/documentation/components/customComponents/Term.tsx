import type { ReactNode } from 'react';

import Definition from '@codaco/fresco-ui/Definition';
import Link from '~/components/Link';

type TermEntry = {
  href: string;
  definition: string;
  linkLabel: string;
};

const TERMS: Record<string, TermEntry> = {
  'architect-classic': {
    href: '/en/design-protocols/installing-architect-classic',
    definition:
      'The original downloadable desktop app for designing schema 7 protocols. It remains available for in-progress studies and is fully supported, but is in maintenance mode and will not receive new features.',
    linkLabel: 'Download and install Architect Classic',
  },
  'interviewer-classic': {
    href: '/en/collect-data/interviewer/installing-interviewer',
    definition:
      'The original downloadable desktop and tablet app for running schema 7 protocols offline. It remains available for in-progress studies and is fully supported, but is in maintenance mode and will not receive new features.',
    linkLabel: 'Download and install Interviewer Classic',
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

  const definition = onOwnPage ? (
    term.definition
  ) : (
    <>
      {term.definition}{' '}
      <Link href={{ pathname: term.href }} tabIndex={-1}>
        {term.linkLabel}
      </Link>
    </>
  );

  return <Definition definition={definition}>{children}</Definition>;
};

export default Term;

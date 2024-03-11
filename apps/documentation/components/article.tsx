'use client';

import { Heading } from '@codaco/ui';
import { createPortal } from 'react-dom';
import { usePathname } from '~/navigation';
import TableOfContents from './TableOfContents';
import { useEffect, useState } from 'react';
import type { HeadingNode } from '~/lib/tableOfContents';
import FancyHeading from './FancyHeading';
import WorkInProgress from '~/app/[locale]/[project]/_components/customComponents/WorkInProgress';
import { useBreakpoint } from '~/hooks/useBreakpoint';

export default function Article({
  content,
  headings,
  title,
  showToc,
  wip,
}: {
  content: JSX.Element;
  headings: HeadingNode[];
  title: string;
  showToc: boolean;
  wip?: boolean;
}) {
  const { isBelowXl } = useBreakpoint('xl');
  const pathname = usePathname();
  const project = pathname.split('/')[1];
  const section = pathname.split('/')[2]?.replace(/-/g, ' '); // replace hyphens with spaces

  return (
    <>
      <article className="mx-4 mb-20 mt-2 w-full max-w-[75ch] flex-1 overflow-y-hidden lg:mx-8 xl:mx-10 2xl:mx-12">
        <header>
          <Heading variant="h4-all-caps" margin="none" className="text-accent">
            {project} {section && <>&#129046; {section}</>}
          </Heading>
          <FancyHeading variant="h1" className="!mt-0">
            {title}
          </FancyHeading>
        </header>
        {wip && <WorkInProgress />}
        {showToc && isBelowXl && <TableOfContents headings={headings} />}
        {content}
      </article>
      {showToc && !isBelowXl && <TableOfContents headings={headings} sideBar />}
    </>
  );
}

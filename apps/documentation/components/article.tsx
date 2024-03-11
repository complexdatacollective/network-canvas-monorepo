'use client';

import { Heading } from '@codaco/ui';
import { createPortal } from 'react-dom';
import { usePathname } from '~/navigation';
import TableOfContents from './TableOfContents';
import { useEffect, useState } from 'react';
import type { HeadingNode } from '~/lib/tableOfContents';
import FancyHeading from './FancyHeading';
import WorkInProgress from '~/app/[locale]/[project]/_components/customComponents/WorkInProgress';

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
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const project = pathname.split('/')[1];
  const section = pathname.split('/')[2]?.replace(/-/g, ' '); // replace hyphens with spaces

  useEffect(() => setMounted(true), []);

  return (
    <>
      <article className="mb-20 max-w-[75ch] flex-1">
        <header>
          <Heading variant="h4-all-caps" margin="none" className="text-accent">
            {project} {section && <>&#129046; {section}</>}
          </Heading>
          <FancyHeading variant="h1" className="!mt-0">
            {title}
          </FancyHeading>
        </header>
        {wip && <WorkInProgress />}
        {showToc && (
          <div className="xl:hidden">
            <TableOfContents headings={headings} />
          </div>
        )}
        {content}
      </article>
      {mounted &&
        showToc &&
        createPortal(
          <TableOfContents headings={headings} sideBar />,
          document.getElementById('toc-area')!,
        )}
    </>
  );
}

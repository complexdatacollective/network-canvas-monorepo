'use client';

import { Heading } from '@acme/ui';
import { createPortal } from 'react-dom';
import { usePathname } from '~/navigation';
import TableOfContents from './TableOfContents';
import { useEffect, useState } from 'react';
import type { HeadingNode } from '~/lib/tableOfContents';

export default function Article({
  content,
  headings,
  title,
}: {
  content: JSX.Element;
  headings?: HeadingNode[];
  title: string;
}) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const project = pathname.split('/')[1];
  const section = pathname.split('/')[2];

  useEffect(() => setMounted(true), []);

  return (
    <>
      <article className="max-w-[75ch] flex-1">
        <header>
          <Heading variant="h4-all-caps" margin="none" className="text-accent">
            {project} {section && <>&#129046; {section}</>}
          </Heading>
          <Heading variant="h1" margin="none" className="!mb-8">
            {title}
          </Heading>
        </header>
        {content}
      </article>
      {mounted &&
        headings &&
        headings.length > 0 &&
        createPortal(
          <TableOfContents headings={headings} />,
          document.getElementById('toc-area'),
        )}
    </>
  );
}

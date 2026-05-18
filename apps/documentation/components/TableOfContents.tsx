'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import Heading from '~/components/ui/typography/Heading';
import useHighlighted from '~/hooks/useHighlighted';
import type { HeadingNode } from '~/lib/tableOfContents';
import { cn } from '~/lib/utils';

const TOCLink = ({
  node,
  sideBar,
}: {
  node: HeadingNode;
  sideBar: boolean;
}) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const [highlighted] = useHighlighted(node.id);

  useEffect(() => {
    if (!sideBar) return;

    if (highlighted && ref.current) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [highlighted, sideBar]);

  return (
    <Link
      ref={ref}
      href={`#${node.id}`}
      className={cn(
        'focusable text-base-sm hover:text-accent my-2 block transition-colors',
        sideBar && 'm-2 text-sm',
        node.level === 3 && 'ml-6 font-normal',
        sideBar && highlighted && 'text-accent font-semibold',
      )}
    >
      {node.value}
    </Link>
  );
};

const TableOfContents = ({
  headings,
  sideBar = false,
}: {
  headings: HeadingNode[];
  sideBar?: boolean;
}) => {
  return (
    <aside
      className={cn(
        'hidden shrink-0',
        sideBar &&
          'sticky top-2 max-h-[calc(100vh-1rem)] w-64 overflow-x-hidden overflow-y-auto xl:block',
        !sideBar &&
          'border-border bg-input mb-5 block rounded-lg border px-6 py-4 xl:hidden',
      )}
    >
      <Heading
        variant={sideBar ? 'h4-all-caps' : 'h3'}
        className={cn(sideBar && 'mb-2')}
      >
        Table of Contents
      </Heading>
      {renderNodes(headings, sideBar)}
    </aside>
  );
};

function renderNodes(nodes: HeadingNode[], sideBar: boolean) {
  return (
    <ol>
      {nodes.map((node) => (
        <li key={node.id} className={cn('list-none')}>
          <TOCLink node={node} sideBar={sideBar} />
          {node.children?.length > 0 && renderNodes(node.children, sideBar)}
        </li>
      ))}
    </ol>
  );
}

export default TableOfContents;

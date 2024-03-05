'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

import useHighlighted from '~/hooks/useHighlighted';
import { type HeadingNode } from '~/lib/tableOfContents';
import { Heading } from '@acme/ui';
import { cn } from '~/lib/utils';

const TOCLink = ({ node }: { node: HeadingNode }) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const [highlighted] = useHighlighted(node.data.id);

  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [highlighted]);

  return (
    <Link
      ref={ref}
      href={`#${node.data.id}`}
      className={cn(
        'block py-1 transition-colors hover:text-accent',
        node.depth === 2 ? 'text-sm' : 'text-xs',
        highlighted && 'text-accent',
      )}
    >
      {node.value}
    </Link>
  );
};

const TableOfContents = ({ headings }: { headings: HeadingNode[] }) => {
  return (
    <div
      className={cn(
        'group sticky top-2 w-80 overflow-y-auto overflow-x-hidden pb-5',
        headings.length > 10 && 'h-[750px]',
      )}
    >
      <Heading variant="h4-all-caps">Table of contents</Heading>
      {renderNodes(headings)}
    </div>
  );
};

function renderNodes(nodes: HeadingNode[]) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.data.id}>
          <TOCLink node={node} />
          {node.children?.length > 0 && renderNodes(node.children)}
        </li>
      ))}
    </ul>
  );
}

export default TableOfContents;

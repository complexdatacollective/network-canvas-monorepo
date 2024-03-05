'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

import useHighlighted from '~/hooks/useHighlighted';
import { type HeadingNode } from '~/lib/tableOfContents';
import { Heading } from '@acme/ui';

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
      className={`block ${
        node.depth === 2 ? 'text-base' : 'text-sm'
      } hover:text-black py-1 transition-colors dark:hover:text-white ${
        highlighted ? 'text-black dark:text-white' : 'text-slate-400'
      }`}
    >
      {node.value}
    </Link>
  );
};

const TableOfContents = ({ headings }: { headings: HeadingNode[] }) => {
  return (
    <div
      className={`toc-component group overflow-x-hidden pb-5 ${
        headings.length > 10 && 'h-[750px]'
      } min-w-[300px] overflow-y-auto`}
    >
      <Heading variant="h4-all-caps">Table of contents</Heading>
      {renderNodes(headings)}
    </div>
  );
};

function renderNodes(nodes: HeadingNode[]) {
  return (
    <ul className="mx-6">
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

'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

import useHighlighted from '~/hooks/useHighlighted';
import { type HeadingNode } from '~/lib/tableOfContents';
import { Heading, ListItem, OrderedList } from '@acme/ui';
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
        'block text-base transition-colors hover:text-accent',
        sideBar && 'my-2 text-sm',
        sideBar && node.level === 3 && 'ml-4',
        highlighted && 'text-accent',
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
    <div
      className={cn(
        'group',
        sideBar && 'sticky top-2 w-80 overflow-y-auto overflow-x-hidden pb-5',
        sideBar && headings.length > 10 && 'h-[750px]',
      )}
    >
      <Heading
        variant={sideBar ? 'h4-all-caps' : 'h2'}
        className={cn(sideBar && 'mb-2')}
      >
        Table of Contents
      </Heading>
      {renderNodes(headings, sideBar)}
    </div>
  );
};

function renderNodes(nodes: HeadingNode[], sideBar: boolean) {
  const ULComponent = sideBar ? 'ul' : OrderedList;
  const LIComponent = sideBar ? 'li' : ListItem;

  return (
    <ULComponent>
      {nodes.map((node) => (
        <LIComponent key={node.id}>
          <TOCLink node={node} sideBar={sideBar} />
          {node.children?.length > 0 && renderNodes(node.children, sideBar)}
        </LIComponent>
      ))}
    </ULComponent>
  );
}

export default TableOfContents;

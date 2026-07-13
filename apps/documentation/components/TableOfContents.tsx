'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import useHighlighted from '~/hooks/useHighlighted';
import type { HeadingNode } from '~/lib/tableOfContents';

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
      className={cx(
        'focusable hover:text-accent my-2 block text-base transition-colors',
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
      className={cx(
        'hidden shrink-0',
        sideBar &&
          // Sticky offset clears the sticky section switcher (68px) plus an 8px
          // gap; max height subtracts that offset and the 8px bottom margin.
          'laptop:block sticky top-19 max-h-[calc(100vh-84px)] w-64 overflow-x-hidden overflow-y-auto',
        !sideBar &&
          'border-outline bg-input laptop:hidden mb-5 block rounded-lg border px-6 py-4',
      )}
    >
      <Heading
        {...(sideBar
          ? ({ level: 'h4', variant: 'all-caps' } as const)
          : ({ level: 'h3' } as const))}
        className={cx(sideBar && 'mb-2')}
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
        <li key={node.id} className={cx('list-none')}>
          <TOCLink node={node} sideBar={sideBar} />
          {node.children?.length > 0 && renderNodes(node.children, sideBar)}
        </li>
      ))}
    </ol>
  );
}

export default TableOfContents;

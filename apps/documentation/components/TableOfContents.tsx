'use client';

import Link from 'next/link';
import { type RefObject, useEffect, useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import useHighlighted from '~/hooks/useHighlighted';
import type { HeadingNode } from '~/lib/tableOfContents';

const TOCLink = ({
  node,
  sideBar,
  sideBarRef,
}: {
  node: HeadingNode;
  sideBar: boolean;
  sideBarRef: RefObject<HTMLElement | null>;
}) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const [highlighted] = useHighlighted(node.id);

  useEffect(() => {
    if (!sideBar) return;

    const link = ref.current;
    const container = sideBarRef.current;
    if (!highlighted || !link || !container) return;

    const containerRect = container.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const linkTop = linkRect.top - containerRect.top + container.scrollTop;
    const linkBottom = linkTop + linkRect.height;
    const visibleTop = container.scrollTop;
    const visibleBottom = visibleTop + container.clientHeight;

    if (linkTop < visibleTop) {
      container.scrollTop = linkTop;
    } else if (linkBottom > visibleBottom) {
      container.scrollTop = linkBottom - container.clientHeight;
    }
  }, [highlighted, sideBar, sideBarRef]);

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
  const sideBarRef = useRef<HTMLElement>(null);

  return (
    <aside
      ref={sideBarRef}
      className={cx(
        'hidden shrink-0',
        sideBar &&
          // Sticky offset clears the sticky section switcher (68px) plus an 8px
          // gap; max height subtracts that offset and the 8px bottom margin.
          'laptop:block sticky top-19 max-h-[calc(100vh-84px)] w-64 overflow-x-hidden overflow-y-auto',
        !sideBar &&
          'border-outline bg-input laptop:hidden mb-5 block rounded border px-6 py-4',
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
      {renderNodes(headings, sideBar, sideBarRef)}
    </aside>
  );
};

function renderNodes(
  nodes: HeadingNode[],
  sideBar: boolean,
  sideBarRef: RefObject<HTMLElement | null>,
) {
  return (
    <ol>
      {nodes.map((node) => (
        <li key={node.id} className={cx('list-none')}>
          <TOCLink node={node} sideBar={sideBar} sideBarRef={sideBarRef} />
          {node.children?.length > 0 &&
            renderNodes(node.children, sideBar, sideBarRef)}
        </li>
      ))}
    </ol>
  );
}

export default TableOfContents;

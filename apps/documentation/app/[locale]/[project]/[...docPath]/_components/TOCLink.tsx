'use client';

import useHighlighted from '@/hooks/useHighlighted';
import { type HeadingNode } from '@/lib/tableOfContents';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

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
      } py-1 transition-colors hover:text-black dark:hover:text-white ${
        highlighted ? 'text-black dark:text-white' : 'text-slate-400'
      }`}
    >
      {node.value}
    </Link>
  );
};

export default TOCLink;

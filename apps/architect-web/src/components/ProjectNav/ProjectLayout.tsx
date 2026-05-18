import { type UIEvent, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { useLocation } from 'wouter';

import ProjectNav from '~/components/ProjectNav/ProjectNav';
import { cx } from '~/utils/cva';

type ProjectLayoutProps = {
  children: React.ReactNode;
  className?: string;
  extraActions?: React.ReactNode;
};

const scrollPositions = new Map<string, number>();

const ProjectLayout = ({
  children,
  className,
  extraActions,
}: ProjectLayoutProps) => {
  const [location] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = scrollPositions.get(location);
    if (saved !== undefined) {
      el.scrollTop = saved;
    }
  }, [location]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    scrollPositions.set(location, e.currentTarget.scrollTop);
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className={cx(
        'relative h-dvh overflow-y-auto pb-32 print:h-auto print:overflow-visible print:pb-0',
        className,
      )}
    >
      <ProjectNav extraActions={extraActions} />
      {children}
    </div>
  );
};

export default ProjectLayout;

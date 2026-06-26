import { type UIEvent, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { useLocation } from 'wouter';

import ProjectNav from '~/components/ProjectNav/ProjectNav';
import StorageUnavailableBanner from '~/components/StorageUnavailableBanner';
import { cx } from '~/utils/cva';
import { getScrollPosition, setScrollPosition } from '~/utils/scrollPositions';

import PrintProtocolAction from './PrintProtocolAction';
import ProjectActions from './ProjectActions';

type ProjectLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

const ProjectLayout = ({ children, className }: ProjectLayoutProps) => {
  const [location] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = getScrollPosition(location);
    if (saved !== undefined) {
      el.scrollTop = saved;
    }
  }, [location]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollPosition(location, e.currentTarget.scrollTop);
  };

  const isSummary = location === '/protocol/summary';

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className={cx(
        'relative h-dvh overflow-y-auto pb-32 print:h-auto print:overflow-visible print:pb-0',
        className,
      )}
    >
      <ProjectNav />
      <StorageUnavailableBanner />
      {children}
      <ProjectActions
        readOnly={isSummary}
        additionalActions={isSummary ? <PrintProtocolAction /> : null}
      />
    </div>
  );
};

export default ProjectLayout;

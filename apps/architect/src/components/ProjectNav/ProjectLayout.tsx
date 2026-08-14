import { type UIEvent, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { useLocation } from 'wouter';

import ProjectNav from '~/components/ProjectNav/ProjectNav';
import StorageUnavailableBanner from '~/components/StorageUnavailableBanner';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { cx } from '~/utils/cva';
import { getScrollPosition, setScrollPosition } from '~/utils/scrollPositions';

import { usePrintProtocolAction } from './PrintProtocolAction';
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

  // A tab that has lost the editor lock renders the same whole-protocol
  // read-only view the summary route does (see ProtocolRouteGuard), so it drops
  // Undo/Redo and gains Print for exactly the same reason the summary does.
  const accessMode = useProtocolAccessMode();
  const readOnly =
    location === '/protocol/summary' || accessMode === 'read-only';
  const printAction = usePrintProtocolAction();

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className={cx(
        'relative h-full overflow-y-auto pb-32 print:h-auto print:overflow-visible print:pb-0',
        className,
      )}
    >
      <ProjectNav />
      <StorageUnavailableBanner />
      {children}
      <ProjectActions
        readOnly={readOnly}
        additionalItems={readOnly ? [printAction] : undefined}
      />
    </div>
  );
};

export default ProjectLayout;

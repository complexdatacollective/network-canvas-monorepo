import { type UIEvent, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { useLocation } from 'wouter';

import ProjectNav from '~/components/ProjectNav/ProjectNav';
import StorageUnavailableBanner from '~/components/StorageUnavailableBanner';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { cx } from '~/utils/cva';
import { getScrollPosition, setScrollPosition } from '~/utils/scrollPositions';

import { PrintProtocolAction } from './PrintProtocolAction';
import ProjectActions, { type ProjectActionsMode } from './ProjectActions';

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
  // read-only view the summary route does (see ProtocolRouteGuard) — but for a
  // different reason, and the toolbar has to tell them apart. The summary is
  // read-only because it is a report, and this tab still owns the saved copy,
  // so its Undo reaches disk. A demoted tab owns nothing: its Undo would rewind
  // the screen and be dropped. Both gain Print, because printing only reads.
  const accessMode = useProtocolAccessMode();
  const mode: ProjectActionsMode =
    accessMode !== 'editable'
      ? 'locked'
      : location === '/protocol/summary'
        ? 'report'
        : 'authoring';
  const presenting = mode !== 'authoring';

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
        mode={mode}
        additionalActions={presenting ? <PrintProtocolAction /> : undefined}
      />
    </div>
  );
};

export default ProjectLayout;

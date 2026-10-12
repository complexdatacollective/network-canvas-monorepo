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

  // Two kinds of page offer no editing, for different reasons, and the toolbar
  // has to tell them apart. The summary is read-only because it is a report,
  // and this tab still owns the saved copy, so its Undo reaches disk. Any page
  // in a tab another tab has taken the protocol from is read-only because this
  // tab owns nothing: its Undo would rewind the screen and be dropped. Print
  // follows the route, not the mode: the print styles are written for the
  // Summary, and printing any other page would print its editing chrome.
  const accessMode = useProtocolAccessMode();
  const mode: ProjectActionsMode =
    accessMode !== 'editable'
      ? 'locked'
      : location === '/protocol/summary'
        ? 'report'
        : 'authoring';

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
        additionalActions={
          location === '/protocol/summary' ? <PrintProtocolAction /> : undefined
        }
      />
    </div>
  );
};

export default ProjectLayout;

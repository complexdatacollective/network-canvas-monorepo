import {
  type UIEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type React from 'react';
import { useLocation } from 'wouter';

import { ProjectMountAnimationContext } from '~/components/ProjectNav/projectMountAnimationContext';
import ProjectNav from '~/components/ProjectNav/ProjectNav';
import { cx } from '~/utils/cva';

type ProjectLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

const scrollPositions = new Map<string, number>();

const ProjectLayout = ({ children, className }: ProjectLayoutProps) => {
  const [location] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  const markAnimated = useCallback(() => {
    setHasAnimated(true);
  }, []);

  const animationContextValue = useMemo(
    () => ({
      isInitialLoad: !hasAnimated,
      markAnimated,
    }),
    [hasAnimated, markAnimated],
  );

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
    <ProjectMountAnimationContext.Provider value={animationContextValue}>
      <div
        ref={ref}
        onScroll={handleScroll}
        className={cx(
          'relative h-dvh overflow-y-auto pb-32 print:h-auto print:overflow-visible print:pb-0',
          className,
        )}
      >
        <ProjectNav />
        {children}
      </div>
    </ProjectMountAnimationContext.Provider>
  );
};

export default ProjectLayout;

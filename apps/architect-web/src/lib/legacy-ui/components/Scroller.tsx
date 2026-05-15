import { clamp } from 'es-toolkit/compat';
import type { ReactNode } from 'react';
import React, { useCallback, useImperativeHandle, useRef } from 'react';

import { cx } from '~/utils/cva';

type ScrollerProps = {
  className?: string;
  children: ReactNode;
  useSmoothScrolling?: boolean;
  onScroll?: (
    scrollTop: number,
    clampedScrollAmount: number,
    scrollAmount: number,
  ) => void;
};

type ScrollerRef = {
  scrollTo: (...args: Parameters<Element['scrollTo']>) => void;
};

const Scroller = React.forwardRef<ScrollerRef, ScrollerProps>(
  (
    {
      className = '',
      children,
      useSmoothScrolling = true,
      onScroll = () => {},
    },
    ref,
  ) => {
    const scrollableRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      scrollTo: (...args) => scrollableRef.current?.scrollTo(...args),
    }));

    const handleScroll = useCallback(() => {
      if (!scrollableRef.current) {
        return;
      }
      const element = scrollableRef.current;
      const { scrollTop } = element;
      const maxScrollPosition = element.scrollHeight - element.clientHeight;
      const scrollAmount = scrollTop / maxScrollPosition;

      // iOS inertial scrolling takes values out of range
      const clampedScrollAmount = clamp(scrollAmount, 0, 1);

      // eslint-disable-next-line react/destructuring-assignment
      onScroll(scrollTop, clampedScrollAmount, scrollAmount);
    }, [onScroll]);

    return (
      <div
        className={cx('scrollable flex-1', className)}
        onScroll={handleScroll}
        style={{ scrollBehavior: useSmoothScrolling ? 'smooth' : 'unset' }}
        ref={scrollableRef}
      >
        {children}
      </div>
    );
  },
);

export default Scroller;

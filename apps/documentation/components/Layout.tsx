'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { PageBackgroundProvider } from '@codaco/art';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { Sidebar } from '~/components/Sidebar';
import WorkflowNav from '~/components/WorkflowNav';

import DocumentationFooter from './DocumentationFooter';
import SharedNav from './SharedNav/SharedNav';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();
  const workflowNavSentinelRef = useRef<HTMLDivElement>(null);
  const [isWorkflowNavStuck, setIsWorkflowNavStuck] = useState(false);
  const [fallbackConvergence, setFallbackConvergence] = useState({
    x: 0.5,
    y: 0.6,
  });

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  useEffect(() => {
    if (isHomePage) return;

    setFallbackConvergence({
      x: 0.08 + Math.random() * 0.84,
      y: 0.12 + Math.random() * 0.76,
    });
  }, [isHomePage, pathname]);

  useEffect(() => {
    const sentinel = workflowNavSentinelRef.current;
    if (!sentinel) {
      setIsWorkflowNavStuck(false);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setIsWorkflowNavStuck(
          entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0),
        );
      },
      { threshold: 1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isHomePage]);

  return (
    <div className="bg-background publish-colors relative isolate flex min-h-dvh w-full flex-auto flex-col">
      <PageBackgroundProvider
        fallbackConvergence={fallbackConvergence}
        intensity={isHomePage ? 0.4 : 0.1}
        motionMode="target"
        waitForTarget={isHomePage}
      >
        <div className="relative z-10 flex min-h-dvh w-full flex-auto flex-col">
          <SharedNav />
          {!isHomePage && (
            <>
              <div
                ref={workflowNavSentinelRef}
                aria-hidden="true"
                className="-mb-px h-px"
              />
              <WorkflowNav
                variant="collapsed"
                className={cx(
                  'sticky top-0 z-40 w-full px-4 py-2',
                  isWorkflowNavStuck && 'bg-background',
                )}
              />
            </>
          )}
          <main
            className={cx(
              'flex h-full w-full flex-auto justify-center',
              // Space content away from the nav on content pages; the margin scales
              // down on smaller viewports.
              isHomePage
                ? 'mt-4'
                : 'phone-landscape:mt-8 tablet-landscape:mt-12 mt-6',
            )}
          >
            {!isHomePage && (
              // Sticky offset clears the sticky section switcher (68px tall) plus an
              // 8px gap; max height subtracts that offset and the 8px bottom margin.
              <Sidebar className="tablet-landscape:sticky tablet-landscape:top-[76px] tablet-landscape:flex tablet-landscape:max-h-[calc(100dvh-84px)] mx-4 hidden max-w-80" />
            )}

            {children}
          </main>
          <DocumentationFooter />
        </div>
      </PageBackgroundProvider>
    </div>
  );
}

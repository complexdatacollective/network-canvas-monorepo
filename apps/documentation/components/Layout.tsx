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

  const isHomePage = pathname === `/${locale}`;

  useEffect(() => {
    const sentinel = workflowNavSentinelRef.current;
    if (!sentinel) {
      setIsWorkflowNavStuck(false);
      return undefined;
    }

    const updateStickyState = () => {
      setIsWorkflowNavStuck(sentinel.getBoundingClientRect().top <= 0);
    };

    updateStickyState();
    window.addEventListener('scroll', updateStickyState, { passive: true });
    window.addEventListener('resize', updateStickyState);

    return () => {
      window.removeEventListener('scroll', updateStickyState);
      window.removeEventListener('resize', updateStickyState);
    };
  }, [isHomePage]);

  return (
    <div className="bg-background text-text publish-colors relative isolate flex min-h-dvh w-full flex-auto flex-col">
      <PageBackgroundProvider
        intensity={isHomePage ? 0.4 : 0.1}
        motionMode="target"
        waitForTarget
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
                  'tablet-landscape:flex sticky top-0 z-40 hidden w-full px-4 py-2',
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

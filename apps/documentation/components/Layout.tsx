'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';

import { PageBackground } from '@codaco/art';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { Sidebar } from '~/components/Sidebar';
import WorkflowNav from '~/components/WorkflowNav';

import DocumentationFooter from './DocumentationFooter';
import SharedNav from './SharedNav/SharedNav';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  return (
    <div className="relative isolate flex min-h-dvh w-full flex-auto flex-col">
      <PageBackground />
      <div className="relative z-10 flex min-h-dvh w-full flex-auto flex-col">
        <SharedNav isHomePage={isHomePage} />
        {!isHomePage && (
          // Sticky so the section switcher stays visible while scrolling. On
          // large screens the main nav scrolls away, so it pins to the top; on
          // smaller screens the nav stays sticky, so it pins just below it.
          <WorkflowNav
            variant="collapsed"
            className="bg-background/50 tablet-landscape:top-0 sticky top-16 z-40 w-full px-4 py-2 backdrop-blur-sm"
          />
        )}
        <main
          className={cx(
            'flex h-full w-full flex-auto justify-center',
            // Space content away from the nav on content pages; the margin scales
            // down on smaller viewports.
            isHomePage
              ? 'mt-4'
              : 'phone-landscape:mt-16 tablet-landscape:mt-24 mt-10',
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
    </div>
  );
}

'use client';

import { motion } from 'motion/react';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';

import { BackgroundBlobs } from '@codaco/art';
import { Sidebar } from '~/components/Sidebar';
import WorkflowNav from '~/components/WorkflowNav';
import { cn } from '~/lib/utils';

import SharedNav from './SharedNav/SharedNav';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  return (
    <>
      <SharedNav isHomePage={isHomePage} />
      {!isHomePage && (
        // Sticky so the section switcher stays visible while scrolling. On
        // large screens the main nav scrolls away, so it pins to the top; on
        // smaller screens the nav stays sticky, so it pins just below it.
        <WorkflowNav
          variant="collapsed"
          className="dark:bg-background sticky top-16 z-40 w-full bg-[#ffffff7d] px-4 py-2 backdrop-blur-sm lg:top-0"
        />
      )}
      <motion.div
        className="fixed inset-0 z-[-1]"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHomePage ? 0.15 : 0.05 }}
        transition={{
          duration: isHomePage ? 2 : 0,
        }}
      >
        <BackgroundBlobs
          large={0}
          medium={3}
          small={3}
          // speedFactor={20}
          // filter={isHomePage ? '' : 'blur(10rem)'}
          compositeOperation="screen"
          // compositeOperation="lighten"
        />
      </motion.div>
      <main
        className={cn(
          'flex h-full w-full flex-auto justify-center',
          // Space content away from the nav on content pages; the margin scales
          // down on smaller viewports.
          isHomePage ? 'mt-4' : 'mt-10 sm:mt-16 lg:mt-24',
        )}
      >
        {!isHomePage && (
          // Sticky offset clears the sticky section switcher (68px tall) plus an
          // 8px gap; max height subtracts that offset and the 8px bottom margin.
          <Sidebar className="mx-4 hidden max-w-80 lg:sticky lg:top-[76px] lg:flex lg:max-h-[calc(100dvh-84px)]" />
        )}

        {children}
      </main>
      <footer>
        <div className="mt-10 flex flex-col items-center gap-2 py-4 text-sm sm:flex-row sm:justify-center">
          <span>© {new Date().getFullYear()} Complex Data Collective</span>
          <span className="hidden sm:inline">|</span>
          <span>
            This site is powered by{' '}
            <a
              href="https://www.netlify.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent underline"
            >
              Netlify
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}

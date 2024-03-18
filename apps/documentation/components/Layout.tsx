'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Sidebar } from '~/components/Sidebar';
import { cn } from '~/lib/utils';
import SharedNav from './SharedNav/SharedNav';
import { motion } from 'framer-motion';
import { BackgroundBlobs } from '@codaco/art';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  return (
    <>
      <SharedNav />
      <motion.div
        className="fixed inset-0 z-[-1] bg-gradient-to-br opacity-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHomePage ? 0.3 : 0.05 }}
        transition={{
          duration: 2,
        }}
      >
        <BackgroundBlobs
          large={1}
          medium={3}
          small={2}
          // speedFactor={1}
          // filter="blur(10rem)"
          // compositeOperation="hard-light"
          // compositeOperation="lighten"
        />
      </motion.div>
      <main className={cn('mt-4 flex w-full flex-auto justify-center')}>
        {!isHomePage && (
          <Sidebar className="hidden max-w-80 lg:sticky lg:top-2 lg:flex lg:max-h-[calc(100dvh-1rem)]" />
        )}

        {children}
      </main>
    </>
  );
}

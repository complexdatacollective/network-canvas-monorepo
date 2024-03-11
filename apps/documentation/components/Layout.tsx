'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Hero } from '~/components/Hero';
import { Sidebar } from '~/components/Sidebar';
import { cn } from '~/lib/utils';
import SharedNav from './SharedNav/SharedNav';
import { useBreakpoint } from '~/hooks/useBreakpoint';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  const { isAboveLg } = useBreakpoint('lg');

  return (
    <>
      <SharedNav />
      {isHomePage && <Hero />}
      <main className={cn('flex w-full flex-auto justify-center', 'lg:px-2')}>
        {!isHomePage && isAboveLg && <Sidebar />}

        {children}
      </main>
    </>
  );
}

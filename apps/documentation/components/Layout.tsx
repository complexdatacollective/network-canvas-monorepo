'use client';

import { usePathname } from 'next/navigation';

import { Hero } from '~/components/Hero';
import { Sidebar } from '~/components/Sidebar';
import { cn } from '~/lib/utils';
import SharedNav from './SharedNav';
import { useLocale } from 'next-intl';
import MobileNavBar from '~/components/MobileNavBar';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  return (
    <div className="flex w-full flex-col">
      {/* <SharedNav active="Documentation" /> */}
      <MobileNavBar />
      {isHomePage && <Hero />}
      <div
        className={cn(
          'relative mx-auto flex flex-auto justify-center gap-2 px-4 py-2',
          'lg:gap-4 xl:gap-8',
        )}
      >
        {!isHomePage && <Sidebar />}

        <main className="flex flex-1">{children}</main>
        <aside id="toc-area" className="hidden xl:block" />
      </div>
    </div>
  );
}

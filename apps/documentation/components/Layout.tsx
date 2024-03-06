'use client';

import { usePathname } from 'next/navigation';

import { Hero } from '~/components/Hero';
// import { MobileNavigation } from '~/components/MobileSidebar';
import { Sidebar } from '~/components/Sidebar';
import { cn } from '~/lib/utils';
import SharedNav from './SharedNav/SharedNav';
import { useLocale } from 'next-intl';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  return (
    <div className="flex w-full flex-col">
      <SharedNav active="Documentation" />
      {isHomePage && <Hero />}
      <div
        className={cn(
          'justify-cente relative mx-auto flex flex-auto gap-2 px-4 py-2',
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

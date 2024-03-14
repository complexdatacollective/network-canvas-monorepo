'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Hero } from '~/components/Hero';
import { Sidebar } from '~/components/Sidebar';
import { cn } from '~/lib/utils';
import SharedNav from './SharedNav/SharedNav';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  return (
    <>
      <SharedNav />
      {isHomePage && <Hero />}
      <main className={cn('mt-4 flex w-full flex-auto justify-center')}>
        {!isHomePage && (
          <Sidebar className="hidden max-w-80 lg:sticky lg:top-2 lg:flex lg:max-h-[calc(100dvh-1rem)]" />
        )}

        {children}
      </main>
    </>
  );
}

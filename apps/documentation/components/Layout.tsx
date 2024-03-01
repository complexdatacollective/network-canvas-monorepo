'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

import { Hero } from '~/components/Hero';
// import { MobileNavigation } from '~/components/MobileSidebar';
import { Sidebar } from '~/components/Sidebar';
import { cn } from '~/lib/utils';
import SharedNav from './SharedNav';

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHomePage = pathname === '/en';

  return (
    <div className="flex w-full flex-col">
      <SharedNav active="Documentation" />
      {isHomePage && <Hero />}
      <div
        className={cn(
          'max-w-8xl justify-cente relative mx-auto flex flex-auto gap-6 p-4',
          'lg:px-8 xl:px-12',
        )}
      >
        <Sidebar />
        <main className="flex flex-1">{children}</main>
        <aside id="toc-area" />
      </div>
    </div>
  );
}

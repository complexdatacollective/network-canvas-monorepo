'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

import DocSearchComponent from '~/components/DocSearchComponent';
import { Hero } from '~/components/Hero';
// import { MobileNavigation } from '~/components/MobileSidebar';
import { Sidebar } from '~/components/Sidebar';
import { cn } from '~/lib/utils';
import SharedNav from './SharedNav';

function DocsNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  const isHomePage = pathname === '/en';

  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 0);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <nav
      className={clsx(
        'sticky top-0 z-50 flex flex-none flex-wrap items-center justify-between px-4 py-5 sm:px-6 lg:px-8',
        isScrolled
          ? 'bg-cyber-grape/95 backdrop-blur [@supports(backdrop-filter:blur(0))]:bg-cyber-grape/75'
          : 'bg-transparent',
      )}
    >
      <div className="mr-6 flex lg:hidden">{/* <MobileNavigation /> */}</div>
      <div className="-my-5 mr-6 sm:mr-8 md:mr-0">
        {(isScrolled || !isHomePage) && <DocSearchComponent />}
      </div>
      {/* <div className="relative flex basis-0 justify-end gap-6 sm:gap-8 md:flex-grow">
        <LanguageSwitcher />
        <ThemeToggle />
      </div> */}
    </nav>
  );
}

export function LayoutComponent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHomePage = pathname === '/en';

  return (
    <div className="flex w-full flex-col">
      <SharedNav active="Documentation" />
      <DocsNav />
      {isHomePage && <Hero />}
      <div
        className={cn(
          'max-w-8xl justify-cente relative mx-auto flex w-full flex-auto gap-6 p-4',
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

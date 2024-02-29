'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

import LanguageSwitcher from '~/app/[locale]/_components/Navbar/languageSwitcher';
import DocSearchComponent from '~/app/[locale]/_components/Navbar/Search/DocSearchComponent';
import { ThemeToggle } from '~/app/[locale]/_components/Navbar/themeToggle';
import { Hero } from '~/components/Hero';
import { MobileNavigation } from '~/components/MobileSidebar';
import { Navigation } from '~/components/Sidebar';
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
    <header
      className={clsx(
        'sticky top-0 z-50 flex flex-none flex-wrap items-center justify-between px-4 py-5 sm:px-6 lg:px-8',
        isScrolled
          ? 'bg-cyber-grape/95 backdrop-blur [@supports(backdrop-filter:blur(0))]:bg-cyber-grape/75'
          : 'bg-transparent',
      )}
    >
      <div className="mr-6 flex lg:hidden">
        <MobileNavigation />
      </div>
      <div className="-my-5 mr-6 sm:mr-8 md:mr-0">
        {(isScrolled || !isHomePage) && <DocSearchComponent />}
      </div>
      {/* <div className="relative flex basis-0 justify-end gap-6 sm:gap-8 md:flex-grow">
        <LanguageSwitcher />
        <ThemeToggle />
      </div> */}
    </header>
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
      <div className="max-w-8xl relative mx-auto flex w-full flex-auto justify-center sm:px-2 lg:px-8 xl:px-12">
        <aside className="sticky top-[4.75rem] -ml-0.5 hidden h-[calc(100vh-4.75rem)] w-64 overflow-y-auto overflow-x-hidden py-16 pl-0.5 pr-8 lg:relative lg:block lg:flex-none xl:w-72 xl:pr-16">
          <Navigation />
        </aside>
        <main className="flex flex-1">{children}</main>
      </div>
    </div>
  );
}

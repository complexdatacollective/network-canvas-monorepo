import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import sidebarData from '~/public/sidebar.json' assert { type: 'json' };
import { Heading } from '@acme/ui';
import DocSearchComponent from './DocSearchComponent';
import { cn } from '~/lib/utils';

const navigation = [];

export function Sidebar({
  className,
  onLinkClick,
}: {
  className?: string;
  onLinkClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  let pathname = usePathname();

  return (
    <nav className={cn(
      'sticky hidden h-[calc(100vh-4.75rem)] w-72 overflow-y-auto overflow-x-hidden lg:block',
      className
      )}>
      <DocSearchComponent />
      <ul role="list" className="space-y-9">
        {navigation.map((section) => (
          <li key={section.title}>
            <h2 className="font-display text-slate-900 font-medium dark:text-white">
              {section.title}
            </h2>
            <ul
              role="list"
              className="border-slate-100 lg:border-slate-200 dark:border-slate-800 mt-2 space-y-2 border-l-2 lg:mt-4 lg:space-y-4"
            >
              {section.links.map((link) => (
                <li key={link.href} className="relative">
                  <Link
                    href={link.href}
                    onClick={onLinkClick}
                    className={clsx(
                      'block w-full pl-3.5 before:pointer-events-none before:absolute before:-left-1 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:rounded-full',
                      link.href === pathname
                        ? 'text-sky-500 before:bg-sky-500 font-semibold'
                        : 'text-slate-500 before:bg-slate-300 hover:text-slate-600 dark:text-slate-400 dark:before:bg-slate-700 dark:hover:text-slate-300 before:hidden hover:before:block',
                    )}
                  >
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

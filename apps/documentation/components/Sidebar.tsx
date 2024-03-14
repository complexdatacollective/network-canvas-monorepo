import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useLocale } from 'next-intl';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@codaco/ui';

import type {
  LocalesEnum,
  SidebarPage,
  TSideBar,
  SidebarFolder as TSidebarFolder,
} from '~/app/types';
import { cn } from '~/lib/utils';
import sidebarData from '~/public/sidebar.json';
import DocSearchComponent from './DocSearchComponent';
import ProjectSwitcher from './ProjectSwitcher';

const MotionCollapsibleContent = motion(CollapsibleContent);
const MotionChevron = motion(ChevronRight);

// Used by sidebar to process sourceFile values into usable routes
export const processSourceFile = (
  type: 'folder' | 'page',
  locale: LocalesEnum,
  sourceFile?: string,
) => {
  if (!sourceFile) return;
  // We can't use path.sep because the webpack node shim always returns '/'.
  // Because this might be running on Windows, we need to use a regex to split
  // by either / or \.
  const pathSegments = sourceFile.split(/[\\/]/).slice(2);

  let returnPath = '';

  if (type === 'folder') {
    returnPath = pathSegments.slice(0, -1).join('/');
  } else {
    returnPath = pathSegments
      // Process the last item to remove the locale and file extension
      .map((segment, index, array) => {
        if (index === array.length - 1) {
          return segment.split('.')[0]!;
        }
        return segment;
      })
      .join('/');
  }

  return `/${locale}/${returnPath}`;
};

const SidebarFolder = ({
  label,
  href,
  defaultOpen,
  alwaysOpen,
  children,
}: {
  label: string;
  href?: string;
  defaultOpen?: boolean;
  alwaysOpen?: boolean;
  children?: React.ReactNode;
}) => {
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(() => {
    if (alwaysOpen) return true;

    if (defaultOpen) return true;

    return (children as React.ReactElement<{ href?: string }>[]).some(
      (child) => child.props.href === pathname,
    );
  });

  return (
    <Collapsible
      defaultOpen={defaultOpen ?? alwaysOpen}
      open={isOpen}
      onOpenChange={() => {
        if (alwaysOpen) return;
        setIsOpen(!isOpen);
      }}
      className={cn('my-4 flex flex-col')}
    >
      <CollapsibleTrigger
        className={cn(
          'focusable my-1 flex flex-1 items-center justify-between text-base font-semibold capitalize',
          !alwaysOpen && 'cursor-pointer',
        )}
        asChild
      >
        {href ? (
          <Link href={href}>
            {label}{' '}
            {!alwaysOpen && (
              <MotionChevron
                className="h-4 w-4"
                initial={{ rotate: isOpen ? 90 : 0 }}
                animate={{ rotate: isOpen ? 90 : 0 }}
                aria-hidden
              />
            )}
          </Link>
        ) : (
          <div>
            {label}{' '}
            {!alwaysOpen && (
              <MotionChevron
                className="h-4 w-4"
                initial={{ rotate: isOpen ? 90 : 0 }}
                animate={{ rotate: isOpen ? 90 : 0 }}
                aria-hidden
              />
            )}
          </div>
        )}
      </CollapsibleTrigger>
      <MotionCollapsibleContent
        className="ml-4 flex flex-col overflow-y-hidden"
        forceMount
        initial={{ height: isOpen ? 'auto' : 0 }}
        animate={{ height: isOpen ? 'auto' : 0 }}
      >
        {children}
      </MotionCollapsibleContent>
    </Collapsible>
  );
};

const SidebarLink = ({ href, label }: { href: string; label: string }) => {
  const pathname = usePathname();
  const isActive = pathname === href;
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [isActive]);

  if (href === undefined) {
    return (
      <div className="focusable flex flex-1 border-l-[2px] border-foreground/5 py-2 pl-4 text-sm transition-colors">
        {label}
      </div>
    );
  }

  return (
    <Link
      ref={ref}
      href={href}
      className={cn(
        'focusable flex flex-1 border-l-[2px] border-foreground/5 py-2 pl-4 text-sm transition-colors',
        'hover:border-accent/100 hover:text-accent',
        isActive && 'border-accent/100 font-semibold text-accent',
      )}
    >
      {label}
    </Link>
  );
};

const renderSidebarItem = (
  item: TSidebarFolder | SidebarPage,
  locale: LocalesEnum,
) => {
  const sourceFile = processSourceFile(item.type, locale, item.sourceFile);
  if (item.type === 'folder') {
    return (
      <SidebarFolder
        key={item.label}
        label={item.label}
        alwaysOpen={item.expanded}
        href={sourceFile}
      >
        {Object.values(item.children).map((child) =>
          renderSidebarItem(child, locale),
        )}
      </SidebarFolder>
    );
  } else {
    return (
      <SidebarLink key={item.label} href={sourceFile!} label={item.label} />
    );
  }
};

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const locale = useLocale() as LocalesEnum;
  const project = pathname.split('/')[2]!;
  const typedSidebarData = sidebarData as TSideBar;

  const formattedSidebarData = typedSidebarData[locale]![project]!.children;

  return (
    <nav className={cn('flex w-full grow flex-col', className)}>
      <DocSearchComponent className="hidden lg:flex" />
      <ProjectSwitcher />

      <div className="flex-1 basis-[0] overflow-y-auto">
        {Object.values(formattedSidebarData).map((item) =>
          renderSidebarItem(item, locale),
        )}
      </div>
    </nav>
  );
}

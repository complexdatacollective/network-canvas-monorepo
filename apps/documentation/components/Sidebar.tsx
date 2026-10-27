import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { Route } from 'next';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  type Locale,
  type Section,
  type SidebarPage,
  toLocale,
  toSection,
  type TSideBar,
  type SidebarFolder as TSidebarFolder,
} from '~/app/types';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { routing } from '~/lib/i18n/routing';

const PATH_SEPARATOR_REGEX = /[\\/]/;

import DocSearchComponent from './DocSearchComponent';

const MotionCollapsibleContent = motion.create(CollapsibleContent);
const MotionChevron = motion.create(ChevronRight);

/**
 * Given a list of sidebar items (folder/files), sort them based on `navOrder`,
 * and alphabetically by label.
 *
 * @param sidebarItems {(TSidebarFolder | SidebarPage)[]}
 * @returns {(TSidebarFolder | SidebarPage)[]}
 */
const sortSidebarItems = (sidebarItems: (TSidebarFolder | SidebarPage)[]) =>
  sidebarItems.toSorted((a, b) => {
    // If both items have navOrder, sort by that
    if (a.navOrder !== null && b.navOrder !== null) {
      return a.navOrder - b.navOrder;
      // if only 'a' has navOrder, make it first
    }
    if (a.navOrder !== null) {
      return -1;
      // if only 'b' has navOrder, make it first
    }
    if (b.navOrder !== null) {
      return 1;
    }
    // If neither has navOrder, sort alphabetically by label
    return a.label.localeCompare(b.label);
  });

function processSourceFile(
  type: 'page',
  locale: Locale,
  sourceFile: string,
): Route;
function processSourceFile(
  type: 'folder',
  locale: Locale,
  sourceFile: string | undefined,
): Route | undefined;

// Used by sidebar to process sourceFile values into usable routes
function processSourceFile(
  type: 'folder' | 'page',
  locale: Locale,
  sourceFile?: string,
) {
  if (!sourceFile) return undefined;
  // We can't use path.sep because the webpack node shim always returns '/'.
  // Because this might be running on Windows, we need to use a regex to split
  // by either / or \.
  const pathSegments = sourceFile.split(PATH_SEPARATOR_REGEX).slice(2);

  let returnPath = '';

  if (type === 'folder') {
    returnPath = pathSegments.slice(0, -1).join('/');
  } else {
    returnPath = pathSegments
      // Process the last item to remove the locale and file extension
      .map((segment, index, array) => {
        if (index === array.length - 1) {
          return segment.split('.')[0];
        }
        return segment;
      })
      .join('/');
  }

  return `/${locale}/${returnPath}` as Route;
}

const FolderChevron = ({
  isOpen,
  alwaysOpen,
}: {
  isOpen: boolean;
  alwaysOpen?: boolean;
}) => {
  if (alwaysOpen) return null;
  return (
    <MotionChevron
      className="h-4 w-4"
      initial={{ rotate: isOpen ? 90 : 0 }}
      animate={{ rotate: isOpen ? 90 : 0 }}
      aria-hidden
    />
  );
};

const FolderTriggerContent = ({
  label,
  href,
  isOpen,
  alwaysOpen,
}: {
  label: string;
  href?: Route | URL;
  isOpen: boolean;
  alwaysOpen?: boolean;
} & React.HTMLAttributes<HTMLElement>) => {
  const className = 'flex flex-1 items-center justify-between';
  const children = (
    <>
      {label} <FolderChevron isOpen={isOpen} alwaysOpen={alwaysOpen} />
    </>
  );

  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
};

const SidebarFolder = ({
  label,
  href,
  childHrefs,
  defaultOpen,
  alwaysOpen,
  children,
}: {
  label: string;
  href?: Route | URL;
  // The links the folder's direct children render, so the folder opens when
  // one of them is the current page.
  childHrefs: readonly (Route | undefined)[];
  defaultOpen?: boolean;
  alwaysOpen?: boolean;
  children?: React.ReactNode;
}) => {
  const pathname = usePathname();

  const memoizedIsOpen = useMemo(() => {
    if (alwaysOpen) return true;
    if (defaultOpen) return true;
    return childHrefs.some((childHref) => childHref === pathname);
  }, [alwaysOpen, defaultOpen, childHrefs, pathname]);

  const [isOpen, setIsOpen] = useState(memoizedIsOpen);

  // Re-sync the (otherwise freely toggleable) open state whenever the
  // computed baseline changes — e.g. navigating to a page inside a
  // different folder. Adjusted during render rather than in an effect so
  // there is no extra paint where the folder is still shown in its old
  // open/closed state.
  const [prevMemoizedIsOpen, setPrevMemoizedIsOpen] = useState(memoizedIsOpen);
  if (memoizedIsOpen !== prevMemoizedIsOpen) {
    setPrevMemoizedIsOpen(memoizedIsOpen);
    setIsOpen(memoizedIsOpen);
  }

  return (
    <Collapsible
      defaultOpen={defaultOpen ?? alwaysOpen}
      open={isOpen}
      onOpenChange={() => {
        if (alwaysOpen) return;
        setIsOpen(!isOpen);
      }}
      className={cx('my-4 flex flex-col')}
    >
      <CollapsibleTrigger
        className={cx(
          'focusable my-1 flex flex-1 items-center justify-between text-base font-semibold text-balance capitalize',
          !alwaysOpen && 'cursor-pointer',
        )}
        asChild
      >
        <div>
          <FolderTriggerContent
            label={label}
            href={href}
            isOpen={isOpen}
            alwaysOpen={alwaysOpen}
          />
        </div>
      </CollapsibleTrigger>
      <MotionCollapsibleContent
        className="ml-2 flex flex-col overflow-y-hidden"
        forceMount
        initial={{ height: isOpen ? 'auto' : 0 }}
        animate={{ height: isOpen ? 'auto' : 0 }}
      >
        {children}
      </MotionCollapsibleContent>
    </Collapsible>
  );
};

const SidebarLink = ({
  href,
  label,
  sidebarContainerRef,
}: {
  href: Route | URL;
  label: string;
  sidebarContainerRef: RefObject<HTMLDivElement | null>;
}) => {
  const pathname = usePathname();
  const isActive = pathname === href;
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (isActive && ref.current && sidebarContainerRef.current) {
      // Calculate the distance from the top of the sidebar to the active link
      const top = ref.current.offsetTop - sidebarContainerRef.current.offsetTop;

      // Scroll the sidebar to the active link
      sidebarContainerRef.current.scrollTop = top;
    }
  }, [isActive, sidebarContainerRef]);

  return (
    <Link
      ref={ref}
      href={href}
      className={cx(
        'focusable border-text/5 flex flex-1 border-l-2 py-2 pl-4 text-sm transition-colors',
        'hover:border-accent/100 hover:text-accent',
        isActive && 'border-accent/100 text-accent font-semibold',
      )}
    >
      {label}
    </Link>
  );
};

type SidebarItemContext = {
  locale: Locale;
  section: Section;
  sectionSourceFile: string | undefined;
};

// The link an item renders: a folder's own page, or a page's route. A hidden
// page renders nothing, so it has none.
function sidebarItemHref(
  item: TSidebarFolder | SidebarPage,
  { locale, section, sectionSourceFile }: SidebarItemContext,
): Route | undefined {
  if (item.type === 'folder') {
    return processSourceFile(item.type, locale, item.sourceFile);
  }
  if (item.hidden) return undefined;
  // The section's index page is served at the section root, so link there
  // instead of the file-derived URL. Otherwise the sidebar entry is never
  // marked active when a reader lands on /{locale}/{section}.
  return item.sourceFile === sectionSourceFile
    ? (`/${locale}/${section}` as Route)
    : processSourceFile(item.type, locale, item.sourceFile);
}

const SidebarItem = ({
  item,
  sidebarContainerRef,
  ...context
}: SidebarItemContext & {
  item: TSidebarFolder | SidebarPage;
  sidebarContainerRef: RefObject<HTMLDivElement | null>;
}) => {
  const href = sidebarItemHref(item, context);

  if (item.type === 'folder') {
    const sortedChildren = sortSidebarItems(Object.values(item.children));
    return (
      <SidebarFolder
        label={item.label}
        alwaysOpen={item.expanded}
        href={href}
        childHrefs={sortedChildren.map((child) =>
          sidebarItemHref(child, context),
        )}
      >
        {sortedChildren.map((child) => (
          <SidebarItem
            key={child.label}
            item={child}
            sidebarContainerRef={sidebarContainerRef}
            {...context}
          />
        ))}
      </SidebarFolder>
    );
  }

  // Skip pages that are hidden from sidebar
  if (href === undefined) return null;

  return (
    <SidebarLink
      sidebarContainerRef={sidebarContainerRef}
      href={href}
      label={item.label}
    />
  );
};

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const locale = toLocale(useLocale()) ?? routing.defaultLocale;
  const segments = pathname.split('/');
  const section = toSection(segments[2]);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);
  const [sidebarData, setSidebarData] = useState<TSideBar | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    fetch('/sidebar.json')
      .then((res) => res.json())
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- sidebar.json is written by writeSidebarJson.ts in the TSideBar shape; a strict parse here would reject the partial trees this component deliberately tolerates (see Sidebar.test.tsx)
      .then((data) => setSidebarData(data as TSideBar))
      .catch((error) => {
        // A truncated or missing sidebar.json leaves nothing to navigate with.
        // Record that so the shell stops promising the tree is still arriving.
        setLoadFailed(true);
        // oxlint-disable-next-line no-console -- Error logging for sidebar data loading failure
        console.error('Failed to load sidebar data:', error);
      });
  }, []);

  // Rendered whenever the tree cannot be shown: while it loads, after the fetch
  // failed, and when the URL names no section we have data for. Search still
  // works, so the page keeps a way to reach the rest of the documentation.
  const shell = (children?: ReactNode) => (
    <nav className={cx('flex w-full grow flex-col', className)}>
      <DocSearchComponent
        backgroundTarget
        className="tablet-landscape:flex hidden"
      />
      {children}
    </nav>
  );

  if (!sidebarData) {
    return shell(
      loadFailed ? null : <div className="flex-1 p-2">Loading...</div>,
    );
  }

  // `section` is the third path segment, which is only a section on a
  // locale-prefixed documentation URL. A legacy or mistyped path (one that
  // reached the app without being redirected, for example) puts something else
  // there, and indexing the tree with it used to throw a TypeError that took
  // the whole page down. Degrade to the search-only shell instead.
  const sectionData = section ? sidebarData[locale]?.[section] : undefined;
  if (!section || !sectionData) return shell();

  const formattedSidebarData = sectionData.children;

  const sortedSidebarItems = sortSidebarItems(
    Object.values(formattedSidebarData),
  );

  return shell(
    <div ref={sidebarContainerRef} className="flex-1 overflow-y-auto p-2">
      {sortedSidebarItems.map((item) => (
        <SidebarItem
          key={item.label}
          item={item}
          locale={locale}
          sidebarContainerRef={sidebarContainerRef}
          section={section}
          sectionSourceFile={sectionData.sourceFile}
        />
      ))}
    </div>,
  );
}

'use client';

import type { Route } from 'next';
import Link from 'next/link';

import type { SidebarTab } from '~/app/types';
import { cn } from '~/lib/utils';

export default function AppTabs({
  tabs,
  activeSlug,
  locale,
  project,
}: {
  tabs: SidebarTab[];
  activeSlug: string | undefined;
  locale: string;
  project: string;
}) {
  return (
    <div className="border-border my-2 flex items-center gap-6 border-b">
      {tabs.map((tab) => {
        const isActive = tab.slug === activeSlug;
        return (
          <Link
            key={tab.slug}
            href={`/${locale}/${project}/${tab.slug}` as Route}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'focusable -mb-px border-b-2 border-transparent pb-2 text-sm font-semibold transition-colors',
              'text-muted-foreground hover:text-accent',
              isActive && 'border-accent text-accent',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

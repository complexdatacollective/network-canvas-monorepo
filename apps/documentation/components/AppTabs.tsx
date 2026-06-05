'use client';

import { Tabs } from '@base-ui/react/tabs';
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
    <Tabs.Root value={activeSlug} className="my-2">
      <Tabs.List className="border-accent/15 bg-accent/10 inline-grid w-full auto-cols-fr grid-flow-col gap-1 rounded-xl border p-1">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.slug}
            value={tab.slug}
            nativeButton={false}
            render={
              <Link href={`/${locale}/${project}/${tab.slug}` as Route} />
            }
            className={cn(
              'focusable text-muted-foreground flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors',
              'hover:text-foreground hover:bg-card/40',
              'data-active:bg-card data-active:text-foreground data-active:hover:bg-card data-active:shadow-sm',
            )}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

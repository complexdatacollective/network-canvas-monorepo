'use client';

import { Check, Globe, type LucideIcon, Monitor } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import type { SidebarTab } from '~/app/types';
import Heading from '~/components/ui/typography/Heading';
import Paragraph from '~/components/ui/typography/Paragraph';
import { cn } from '~/lib/utils';

const TAB_META: Record<string, { icon: LucideIcon; description: string }> = {
  'interviewer': { icon: Monitor, description: 'Desktop & tablet app' },
  'fresco': { icon: Globe, description: 'Web browser' },
  'architect-desktop': { icon: Monitor, description: 'Desktop app' },
  'architect-web': { icon: Globe, description: 'Web browser' },
};

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
    <div className="my-2 flex gap-3">
      {tabs.map((tab) => {
        const isActive = tab.slug === activeSlug;
        const meta = TAB_META[tab.slug];
        const Icon = meta?.icon;
        return (
          <Link
            key={tab.slug}
            href={`/${locale}/${project}/${tab.slug}` as Route}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'focusable bg-card relative flex flex-1 flex-col gap-3 rounded-xl border p-3 transition-colors',
              isActive ? 'border-accent' : 'border-border hover:border-accent',
            )}
          >
            {isActive && (
              <span className="bg-accent text-accent-foreground absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
              </span>
            )}
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {Icon && <Icon className="h-5 w-5" aria-hidden />}
            </span>
            <span className="flex flex-col">
              <Heading variant="h4" margin="none">
                {tab.label}
              </Heading>
              {meta && (
                <Paragraph
                  variant="smallText"
                  margin="none"
                  className="text-muted-foreground"
                >
                  {meta.description}
                </Paragraph>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

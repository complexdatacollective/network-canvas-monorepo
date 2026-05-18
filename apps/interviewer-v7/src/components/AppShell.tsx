import { FolderOpen, Home, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';

import { cx } from '@codaco/fresco-ui/utils/cva';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/protocols', label: 'Protocols', icon: FolderOpen },
  { path: '/sessions', label: 'Interviews', icon: Users },
  { path: '/settings', label: 'Settings', icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="bg-background text-text flex h-dvh w-dvw flex-col md:flex-row">
      <nav
        aria-label="Primary"
        className="border-surface-2 bg-surface-1 flex shrink-0 flex-row gap-1 border-b p-2 md:flex-col md:gap-2 md:border-r md:border-b-0 md:p-4"
      >
        <div className="hidden md:mb-4 md:block">
          <h1 className="text-base leading-tight font-bold">Network Canvas</h1>
          <p className="text-text/60 text-xs">Interviewer</p>
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            location === item.path ||
            (item.path !== '/' && location.startsWith(item.path));
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cx(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors md:flex-none md:justify-start',
                active
                  ? 'bg-primary text-primary-contrast'
                  : 'text-text hover:bg-surface-2',
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

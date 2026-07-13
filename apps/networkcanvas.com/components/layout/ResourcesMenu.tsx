'use client';

import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { ArrowUpRight, ChevronDown } from 'lucide-react';

import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cn } from '~/lib/cn';

export type ResourceLink = {
  id: string;
  label: string;
  href: string;
  active: boolean;
};

export function ResourcesMenu({
  active,
  label,
  links,
}: {
  active: boolean;
  label: string;
  links: ResourceLink[];
}) {
  return (
    <NavigationMenu.Root
      delay={100}
      closeDelay={120}
      render={<div />}
      className="relative"
    >
      <NavigationMenu.List className="flex">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger
            aria-current={active ? 'page' : undefined}
            className={cn(
              headingVariants({
                level: 'h4',
                variant: 'all-caps',
                margin: 'none',
              }),
              'focusable text-cyber-grape hover:text-neon-coral data-[popup-open]:text-neon-coral group flex items-center gap-1 transition-colors',
              active && 'text-neon-coral',
            )}
          >
            {label}
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform duration-200 group-data-[popup-open]:rotate-180"
            />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <ul className="flex min-w-64 flex-col gap-1 p-2">
              {links.map((link) => (
                <li key={link.id}>
                  <NavigationMenu.Link
                    active={link.active}
                    closeOnClick
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-current={link.active ? 'page' : undefined}
                    className={cn(
                      headingVariants({
                        level: 'h4',
                        variant: 'all-caps',
                        margin: 'none',
                      }),
                      'focusable text-cyber-grape hover:bg-platinum hover:text-neon-coral flex items-center justify-between gap-6 rounded-xl px-4 py-3 transition-colors',
                      link.active && 'text-neon-coral',
                    )}
                  >
                    {link.label}
                    <ArrowUpRight aria-hidden className="size-4 shrink-0" />
                  </NavigationMenu.Link>
                </li>
              ))}
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner
          sideOffset={14}
          align="center"
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <NavigationMenu.Popup
            className={cn(
              'bg-surface origin-top rounded-[1.75rem] p-3 shadow-2xl ring-1 ring-black/5',
              'transition-[opacity,transform,scale] duration-200 ease-out',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            )}
          >
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

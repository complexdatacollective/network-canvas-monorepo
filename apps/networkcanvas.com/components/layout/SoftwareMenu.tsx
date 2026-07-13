'use client';

import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Heading, { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cn } from '~/lib/cn';
import type { Tool } from '~/lib/content';
import { tools } from '~/lib/content';

const accentClasses: Record<Tool['id'], string> = {
  architect: 'text-sea-green',
  interviewer: 'text-neon-coral',
  fresco: 'text-slate-blue',
};

const hoverAccentClasses: Record<Tool['id'], string> = {
  architect: 'hover:bg-sea-green/10 focus-visible:bg-sea-green/10',
  interviewer: 'hover:bg-neon-coral/10 focus-visible:bg-neon-coral/10',
  fresco: 'hover:bg-slate-blue/10 focus-visible:bg-slate-blue/10',
};

function SoftwareCard({ tool }: { tool: Tool }) {
  const menuT = useTranslations('SoftwareMenu');
  const toolsT = useTranslations('Tools');

  return (
    <NavigationMenu.Link
      href={tool.href}
      target="_blank"
      rel="noreferrer"
      closeOnClick
      className={cn(
        'focusable tablet-landscape:w-[clamp(19rem,29vw,22rem)] block h-full w-[min(42rem,calc(100vw-4rem))] rounded p-4 transition-colors',
        hoverAccentClasses[tool.id],
      )}
      render={<a aria-label={tool.name} />}
    >
      <Heading
        level="h4"
        variant="all-caps"
        margin="none"
        className={accentClasses[tool.id]}
      >
        {tool.name}
      </Heading>
      <Paragraph
        margin="none"
        className="text-cyber-grape/85 mt-1.5 text-sm leading-snug"
      >
        {menuT(`${tool.id}.description`)}
      </Paragraph>
      <span
        className={cn(
          'font-heading mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.12em] uppercase',
          accentClasses[tool.id],
        )}
      >
        {toolsT(`${tool.id}.action`)}
        <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
      </span>
    </NavigationMenu.Link>
  );
}

/**
 * The desktop "Software" navigation entry. Hovering (or focusing) the trigger
 * reveals a popover of software cards built on Base UI's Navigation Menu.
 *
 * Rendered as a `<div>` rather than its default `<nav>` so it can be embedded
 * inside the header's existing `<nav>` without nesting landmark regions.
 */
export function SoftwareMenu({ active = false }: { active?: boolean }) {
  const t = useTranslations('Navigation');

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
            {t('software')}
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform duration-200 group-data-[popup-open]:rotate-180"
            />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <ul className="tablet-landscape:flex-row flex flex-col p-1">
              {tools.map((tool, index) => (
                <li
                  key={tool.id}
                  className={cn(
                    'tablet-landscape:flex tablet-landscape:px-2',
                    index > 0 &&
                      'border-cyber-grape/10 tablet-landscape:mt-0 tablet-landscape:border-t-0 tablet-landscape:border-l tablet-landscape:pt-0 mt-2 border-t pt-2',
                    index === 0 && 'tablet-landscape:pl-0',
                    index === tools.length - 1 && 'tablet-landscape:pr-0',
                  )}
                >
                  <SoftwareCard tool={tool} />
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
              'publish-colors max-h-[calc(100vh-7rem)] origin-top overflow-y-auto rounded bg-white p-3 shadow-2xl ring-1 ring-black/5',
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

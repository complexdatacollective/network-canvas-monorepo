import { Tabs as BaseTabs } from '@base-ui/react/tabs';

import { cx } from '~/utils/cva';

// Thin wrappers around Base UI's Tabs primitive. The active-tab "pill" is the
// built-in `Tabs.Indicator`, which Base UI positions for us via the
// `--active-tab-*` CSS vars — a CSS transition gives the slide for free, with no
// layout-animation library involved.

type TabsProps = React.ComponentProps<typeof BaseTabs.Root>;

export function Tabs({ className, ...rest }: TabsProps) {
  return <BaseTabs.Root className={className} {...rest} />;
}

type TabsListProps = React.ComponentProps<typeof BaseTabs.List>;

export function TabsList({ className, children, ...rest }: TabsListProps) {
  return (
    <BaseTabs.List
      className={cx('relative flex items-center gap-7', className)}
      {...rest}
    >
      {children}
      <BaseTabs.Indicator
        aria-hidden
        className={cx(
          'pointer-events-none absolute rounded-full ring-2 ring-current/30',
          'transition-all duration-300 ease-out',
          // Expand the measured tab box outwards into a surrounding pill.
          'top-[calc(var(--active-tab-top)-0.5rem)] left-[calc(var(--active-tab-left)-1rem)]',
          'h-[calc(var(--active-tab-height)+1rem)] w-[calc(var(--active-tab-width)+2rem)]',
        )}
      />
    </BaseTabs.List>
  );
}

type TabsTabProps = React.ComponentProps<typeof BaseTabs.Tab>;

export function TabsTab({ className, ...rest }: TabsTabProps) {
  return (
    <BaseTabs.Tab
      className={cx(
        'relative cursor-pointer text-base leading-none font-semibold text-current no-underline transition-colors',
        'aria-[selected=false]:hover:text-action',
        className,
      )}
      {...rest}
    />
  );
}

export const TabsPanel = BaseTabs.Panel;

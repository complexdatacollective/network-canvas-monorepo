import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { cx } from '../utils/cva';

export type TabItem = {
  value: string;
  label: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
};

export type TabsProps = {
  'value'?: string;
  'defaultValue'?: string;
  'onValueChange'?: (value: string) => void;
  'orientation'?: 'vertical' | 'horizontal';
  /** The tabs to render in the rail. */
  'tabs': TabItem[];
  /** Accessible name for the tab rail (`tablist`). */
  'aria-label': string;
  'className'?: string;
  'style'?: CSSProperties;
  /** One `TabsPanel` per tab `value`. */
  'children': ReactNode;
};

/**
 * A compound tabs component built on Base UI's Tabs (roving arrow-key focus,
 * `role=tablist/tab/tabpanel`, `aria-selected`/`aria-controls` for free).
 *
 * `Tabs` renders the rail itself from its `tabs` array (plus the moving active
 * highlight); the consumer only supplies one `TabsPanel` per tab `value`:
 *
 * ```tsx
 * <Tabs aria-label="Settings" value={s} onValueChange={setS} tabs={[
 *   { value: 'about', label: 'About', icon: Info },
 * ]}>
 *   <TabsPanel value="about">…</TabsPanel>
 * </Tabs>
 * ```
 *
 * The root is a container-query context (`@container`) laid out as flex, so the
 * rail sizes its column to the widest label and each `TabsPanel` adapts to the
 * panel width rather than the viewport.
 */
export function Tabs({
  value,
  defaultValue,
  onValueChange,
  orientation = 'vertical',
  tabs,
  'aria-label': ariaLabel,
  className,
  style,
  children,
}: TabsProps) {
  return (
    <BaseTabs.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => {
        if (typeof next === 'string') onValueChange?.(next);
      }}
      orientation={orientation}
      style={style}
      className={cx(
        '@container flex min-h-0 gap-6',
        orientation === 'vertical' ? 'flex-row' : 'flex-col',
        className,
      )}
    >
      <TabRail tabs={tabs} aria-label={ariaLabel} />
      {children}
    </BaseTabs.Root>
  );
}

/**
 * The tab rail. Internal — driven by `Tabs`' `tabs` prop. Renders the tabs plus
 * the moving active highlight. In the vertical layout it sizes to the widest
 * label (`w-fit`) bounded by a floor and cap that both step up with the
 * container width, so the rail gains presence as the component grows and only
 * wraps a label once it exceeds the cap for that breakpoint.
 */
function TabRail({
  tabs,
  'aria-label': ariaLabel,
}: {
  'tabs': TabItem[];
  'aria-label': string;
}) {
  return (
    <BaseTabs.List
      aria-label={ariaLabel}
      className={cx(
        'relative flex shrink-0 flex-col gap-1',
        'w-fit max-w-[11rem] min-w-[7rem]',
        '@min-[34rem]:max-w-[14rem] @min-[34rem]:min-w-[9rem]',
        '@min-[48rem]:max-w-[17rem] @min-[48rem]:min-w-[11rem]',
        '@min-[64rem]:max-w-[20rem] @min-[64rem]:min-w-[13rem]',
      )}
    >
      <TabIndicator />
      {tabs.map((tab) => (
        <Tab
          key={tab.value}
          value={tab.value}
          icon={tab.icon}
          disabled={tab.disabled}
        >
          {tab.label}
        </Tab>
      ))}
    </BaseTabs.List>
  );
}

// Radius chosen to read as a full pill on a single-line tab (≈ half the
// single-line height) while staying a fixed rounded rect on a wrapped,
// multi-line tab — a `rounded-full` here would warp tall tabs into a stadium.
const TAB_RADIUS = 'rounded-[1.25rem]';

/** A single tab. Internal — consumers describe tabs via `Tabs`' `tabs` prop. */
function Tab({
  value,
  icon: Icon,
  disabled,
  children,
}: {
  value: string;
  icon?: LucideIcon;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <BaseTabs.Tab
      value={value}
      disabled={disabled}
      className={cx(
        'font-heading focusable relative z-10 flex w-full cursor-pointer items-center gap-3',
        'border-0 bg-transparent px-4 py-3 text-left text-sm leading-tight font-extrabold',
        TAB_RADIUS,
        'text-text/80 data-[selected]:text-text',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      {Icon ? <Icon aria-hidden className="size-5 shrink-0" /> : null}
      <span className="min-w-0">{children}</span>
    </BaseTabs.Tab>
  );
}

/**
 * The moving highlight behind the active tab. Internal — rendered by the rail.
 * Positions itself from the Base UI `--active-tab-top`/`--active-tab-height`
 * variables and eases between tabs; the global reduced-motion query zeroes it.
 */
function TabIndicator() {
  return (
    <BaseTabs.Indicator
      className={cx(
        'bg-surface-2 pointer-events-none absolute top-0 left-0 z-0 w-full',
        TAB_RADIUS,
        'h-(--active-tab-height) translate-y-(--active-tab-top)',
        'transition-[translate,height] duration-200 ease-out',
      )}
    />
  );
}

export type TabsPanelProps = {
  value: string;
  className?: string;
  keepMounted?: boolean;
  children: ReactNode;
};

/**
 * The content pane for a tab. Fills the row beside the rail and is its own
 * `@container` so panel content can adapt to the panel width.
 */
export function TabsPanel({
  value,
  className,
  keepMounted,
  children,
}: TabsPanelProps) {
  return (
    <BaseTabs.Panel
      value={value}
      keepMounted={keepMounted}
      className={cx('@container min-w-0 flex-1 outline-none', className)}
    >
      {children}
    </BaseTabs.Panel>
  );
}

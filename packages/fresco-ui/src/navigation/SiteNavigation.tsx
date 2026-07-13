'use client';

import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Variants } from 'motion/react';
import {
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

import { IconButton } from '../Button';
import { headingVariants } from '../typography/Heading';
import { cx } from '../utils/cva';

export type SiteNavigationLinkRenderProps = {
  'href': string;
  'children': ReactNode;
  'className': string;
  'onClick'?: () => void;
  'target'?: '_blank' | '_self' | '_parent' | '_top';
  'rel'?: string;
  'aria-label'?: string;
  'aria-current'?: 'page';
};

export type SiteNavigationRenderContext = {
  active: boolean;
  closeMenu: () => void;
  view: 'desktop' | 'mobile';
};

export type SiteNavigationLinkItem = {
  id: string;
  label: string;
  href: string;
  target?: SiteNavigationLinkRenderProps['target'];
  rel?: string;
  className?: string;
};

export type SiteNavigationCustomItem = {
  id: string;
  render: (context: SiteNavigationRenderContext) => ReactNode;
  className?: string;
};

export type SiteNavigationItem =
  | SiteNavigationLinkItem
  | SiteNavigationCustomItem;

type SiteNavigationProps = {
  activeItemId?: string;
  brand: ReactNode;
  brandHref: string;
  brandItemId?: string;
  brandLabel: string;
  closeMenuLabel: string;
  entranceVariants?: Variants;
  items: SiteNavigationItem[];
  openMenuLabel: string;
  renderLink?: (props: SiteNavigationLinkRenderProps) => ReactElement;
  className?: string;
  containerClassName?: string;
  style?: CSSProperties;
};

const linkClasses = cx(
  headingVariants({ level: 'h4', variant: 'all-caps', margin: 'none' }),
  'focusable text-cyber-grape hover:text-neon-coral aria-[current=page]:text-neon-coral whitespace-nowrap transition-colors',
);

function defaultRenderLink({
  children,
  ...props
}: SiteNavigationLinkRenderProps) {
  return <a {...props}>{children}</a>;
}

function isLinkItem(item: SiteNavigationItem): item is SiteNavigationLinkItem {
  return 'href' in item;
}

export default function SiteNavigation({
  activeItemId,
  brand,
  brandHref,
  brandItemId = 'home',
  brandLabel,
  closeMenuLabel,
  entranceVariants,
  items,
  openMenuLabel,
  renderLink = defaultRenderLink,
  className,
  containerClassName,
  style,
}: SiteNavigationProps) {
  const [open, setOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const closeMenu = () => setOpen(false);
  const renderItem = (
    item: SiteNavigationItem,
    view: SiteNavigationRenderContext['view'],
  ) => {
    const active = item.id === activeItemId;

    if (!isLinkItem(item)) {
      return item.render({ active, closeMenu, view });
    }

    const linkProps: SiteNavigationLinkRenderProps = {
      'href': item.href,
      'children': item.label,
      'className': linkClasses,
      'onClick': view === 'mobile' ? closeMenu : undefined,
      'target': item.target,
      'rel': item.rel,
      'aria-current': active ? 'page' : undefined,
    };

    if (view === 'desktop') {
      return (
        <NavigationMenu.Link
          active={active}
          closeOnClick
          href={item.href}
          target={item.target}
          rel={item.rel}
          aria-current={linkProps['aria-current']}
          className={linkClasses}
          render={renderLink(linkProps)}
        >
          {item.label}
        </NavigationMenu.Link>
      );
    }

    return renderLink(linkProps);
  };

  const mobileInitial = shouldReduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: -8 };
  const mobileVisible = shouldReduceMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0 };

  return (
    <motion.header
      variants={entranceVariants}
      className={cx('@container relative z-50', className)}
      style={style}
    >
      <div
        className={cx(
          'tablet-landscape:px-10 flex w-full items-center justify-between px-4 py-6 @min-[30rem]:px-6',
          containerClassName,
        )}
      >
        {renderLink({
          'href': brandHref,
          'children': brand,
          'className': 'focusable rounded-sm',
          'aria-label': brandLabel,
          'aria-current': activeItemId === brandItemId ? 'page' : undefined,
        })}

        <NavigationMenu.Root className="hidden @min-[48rem]:block">
          <NavigationMenu.List className="flex items-center gap-4 @min-[48rem]:gap-6 @min-[80rem]:gap-8">
            {items.map((item) => (
              <NavigationMenu.Item key={item.id} className={item.className}>
                {renderItem(item, 'desktop')}
              </NavigationMenu.Item>
            ))}
          </NavigationMenu.List>
        </NavigationMenu.Root>

        <div className="flex items-center gap-1 @min-[48rem]:hidden">
          <IconButton
            icon={
              open ? (
                <X aria-hidden className="size-7" />
              ) : (
                <Menu aria-hidden className="size-7" />
              )
            }
            aria-label={open ? closeMenuLabel : openMenuLabel}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            variant="text"
            color="dynamic"
            size="lg"
            className="text-cyber-grape border-transparent"
          />
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={mobileInitial}
            animate={mobileVisible}
            exit={mobileInitial}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            className="bg-surface absolute inset-x-4 top-full z-50 rounded-[1.75rem] p-6 shadow-xl @min-[48rem]:hidden"
          >
            <nav className="flex flex-col gap-5">
              {items.map((item) => (
                <div key={item.id} className={item.className}>
                  {renderItem(item, 'mobile')}
                </div>
              ))}
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}

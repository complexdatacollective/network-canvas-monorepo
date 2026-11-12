'use client';

import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Variants } from 'motion/react';
import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { SiteLocale } from '@codaco/shared-consts';

import { buttonVariants, IconButton } from '../Button';
import { usePortalContainer } from '../PortalContainer';
import { usePrefersReducedMotion } from '../reducedMotion';
import Spinner from '../Spinner';
import { headingVariants } from '../typography/Heading';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';
import { SITE_NAVIGATION_SKIP_TARGET_ID } from './SiteNavigation.constants';
import { siteNavigationMessages } from './SiteNavigation.messages';

export type SiteNavigationLocale = SiteLocale;

export type SiteNavigationItemId =
  | 'home'
  | 'community'
  | 'documentation'
  | 'protocolGallery'
  | 'updates'
  | 'resources'
  | 'software'
  | 'getStarted';

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

export type SiteNavigationUtilityRenderProps = {
  closeMenu: () => void;
  view: 'desktop' | 'mobile';
};

/**
 * How the header is laid out.
 *
 * - `header` is a site's whole header: the skip link, the logo, the links,
 *   "Get started", and below 64rem a menu of its own.
 * - `embedded` is the logo and the links alone, for a host whose own header
 *   bar supplies the padding, its own controls (sign-in, search) and its own
 *   menu. It fits its links to the room it is given rather than to fixed
 *   widths (see `SiteNavigationFit`).
 * - `menu` is the links as the compact menu lists them, for a host's own
 *   menu to carry where its header shows the logo alone.
 */
export type SiteNavigationLayout = 'header' | 'embedded' | 'menu';

/**
 * How much of the embedded header fits beside the host's controls: every
 * link and the logo's name; the pages folded into Resources; that without
 * the logo's name; or the logo alone (with its name if there is room for
 * it), when the host's menu carries the links.
 */
export type SiteNavigationFit = 'full' | 'compact' | 'mark' | 'brand';

/**
 * A host site's own menu, opened from its entry in the embedded header. The
 * active item becomes a button that leads the links and is never folded into
 * Resources, so a site like the community forum can hang its menu on its
 * own name.
 */
export type SiteNavigationHostMenu = {
  open: boolean;
  onToggle: (trigger: HTMLElement) => void;
};

type SoftwareId =
  | 'architect'
  | 'architectClassic'
  | 'interviewer'
  | 'interviewerClassic'
  | 'fresco';

type ResourceLink = {
  id: 'community' | 'documentation' | 'protocolGallery' | 'updates';
  label: string;
  href: string;
  active: boolean;
  target?: '_blank';
  rel?: string;
};

type SoftwareLink = {
  id: SoftwareId;
  name: string;
  action: string;
  description: string;
  href: string;
};

type InternalNavigationItem =
  | (ResourceLink & { className?: string })
  | {
      id: 'resources' | 'software' | 'utility' | 'getStarted';
      className?: string;
      render: (view: 'desktop' | 'mobile') => ReactNode;
    };

export type SiteNavigationProps = {
  activeItemId?: SiteNavigationItemId;
  entranceVariants?: Variants;
  /** The embedded layout only. */
  hostMenu?: SiteNavigationHostMenu;
  layout?: SiteNavigationLayout;
  locale: SiteNavigationLocale;
  mobileAccessory?: ReactNode;
  /** The embedded layout only: called whenever what fits changes. */
  onFitChange?: (fit: SiteNavigationFit) => void;
  renderLink?: (props: SiteNavigationLinkRenderProps) => ReactElement;
  renderUtility?: (props: SiteNavigationUtilityRenderProps) => ReactNode;
  site: 'documentation' | 'external' | 'website';
  /**
   * The `id` of the element the skip link jumps to. The host page owns that
   * element — this header cannot supply one — so a page that renders the
   * header must carry a matching `id` on the element where its content
   * starts, usually its `<main>`.
   */
  skipToId?: string;
  className?: string;
  containerClassName?: string;
  style?: CSSProperties;
};

const destinations = {
  community: 'https://community.networkcanvas.com/',
  documentation: 'https://documentation.networkcanvas.com/',
  protocolGallery: 'https://protocolgallery.networkcanvas.com/',
  architect: 'https://architect.networkcanvas.com/',
  architectClassic:
    'https://networkcanvas.com/get-started#architect-classic-downloads',
  interviewer: 'https://interviewer.networkcanvas.com/',
  interviewerClassic:
    'https://networkcanvas.com/get-started#interviewer-classic-downloads',
  fresco: 'https://fresco-sandbox.networkcanvas.com/',
  networkCanvas: 'https://networkcanvas.com/',
} as const;

const linkClasses = cx(
  headingVariants({ level: 'h4', variant: 'all-caps', margin: 'none' }),
  'focusable text-text hover:text-neon-coral aria-[current=page]:text-neon-coral whitespace-nowrap transition-colors',
);

// `not-sr-only` resets padding, margin, and white-space, and under a `focus:`
// variant it lands after the unprefixed utilities — so the visible treatment
// it would otherwise undo is stated under the same variant. Position is left
// to the wrapper, which keeps the link out of the header's own layout while
// it is hidden. The surface treatment is the compact menu's, so the link
// reads as part of this header when it appears.
const skipLinkClasses = cx(
  headingVariants({ level: 'h4', variant: 'all-caps', margin: 'none' }),
  'focusable bg-surface text-surface-contrast rounded-full shadow-xl',
  // oxlint-disable-next-line tailwindcss/no-conflicting-classes -- focus:whitespace-nowrap deliberately overrides the white-space that focus:not-sr-only resets (see above)
  'sr-only focus:not-sr-only focus:px-5 focus:py-3 focus:whitespace-nowrap',
);

const breakpointClasses = {
  desktop: 'hidden @min-[64rem]:block',
  mobile: '@min-[64rem]:hidden',
} as const;

const accentClasses: Record<SoftwareId, string> = {
  architect: 'text-sea-green',
  architectClassic: 'text-cyber-grape [[data-theme=dark]_&]:text-platinum-dark',
  interviewer: 'text-neon-coral',
  interviewerClassic:
    'text-cyber-grape [[data-theme=dark]_&]:text-platinum-dark',
  fresco: 'text-slate-blue',
};

const hoverAccentClasses: Record<SoftwareId, string> = {
  architect: 'hover:bg-sea-green/10 focus-visible:bg-sea-green/10',
  architectClassic:
    'hover:bg-cyber-grape/10 focus-visible:bg-cyber-grape/10 [[data-theme=dark]_&]:hover:bg-platinum-dark/10 [[data-theme=dark]_&]:focus-visible:bg-platinum-dark/10',
  interviewer: 'hover:bg-neon-coral/10 focus-visible:bg-neon-coral/10',
  interviewerClassic:
    'hover:bg-cyber-grape/10 focus-visible:bg-cyber-grape/10 [[data-theme=dark]_&]:hover:bg-platinum-dark/10 [[data-theme=dark]_&]:focus-visible:bg-platinum-dark/10',
  fresco: 'hover:bg-slate-blue/10 focus-visible:bg-slate-blue/10',
};

const softwareMenuVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.05,
      staggerChildren: 0.055,
    },
  },
};

const softwareCardVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 30,
    },
  },
};

const softwareIcons: Record<SoftwareId, string> = {
  architect: new URL('./assets/architect.png', import.meta.url).href,
  architectClassic: new URL('./assets/architect-classic.png', import.meta.url)
    .href,
  interviewer: new URL('./assets/interviewer.svg', import.meta.url).href,
  interviewerClassic: new URL(
    './assets/interviewer-classic.png',
    import.meta.url,
  ).href,
  fresco: new URL('./assets/fresco.png', import.meta.url).href,
};

function defaultRenderLink({
  children,
  ...props
}: SiteNavigationLinkRenderProps) {
  return <a {...props}>{children}</a>;
}

function appendPath(rootHref: string, path: string) {
  return `${rootHref.replace(/\/$/, '')}${path}`;
}

const brandNameClasses =
  'font-heading text-text text-lg font-bold tracking-[0.18em] whitespace-nowrap';

/**
 * The logo. The header shows its name at the widths its own breakpoints
 * allow; the embedded header says outright whether there is room for it.
 */
function NavigationBrand({ showName }: { showName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="shrink-0" data-brand-mark="">
        <Spinner customSize="0.625rem" animationMode="hover" playOnMount />
      </span>
      <span
        className={cx(
          brandNameClasses,
          showName === undefined
            ? 'hidden @min-[56rem]:inline @min-[64rem]:hidden @min-[80rem]:inline'
            : !showName && 'hidden',
        )}
      >
        Network Canvas
      </span>
    </span>
  );
}

function DesktopLink({
  link,
  renderLink,
}: {
  link: ResourceLink;
  renderLink: (props: SiteNavigationLinkRenderProps) => ReactElement;
}) {
  const props: SiteNavigationLinkRenderProps = {
    'href': link.href,
    'children': link.label,
    'className': linkClasses,
    'target': link.target,
    'rel': link.rel,
    'aria-current': link.active ? 'page' : undefined,
  };

  return (
    <NavigationMenu.Link
      active={link.active}
      closeOnClick
      href={link.href}
      target={link.target}
      rel={link.rel}
      aria-current={props['aria-current']}
      className={linkClasses}
      render={renderLink(props)}
    >
      {link.label}
    </NavigationMenu.Link>
  );
}

function ResourcesMenu({
  active,
  label,
  links,
  renderLink,
}: {
  active: boolean;
  label: string;
  links: ResourceLink[];
  renderLink: (props: SiteNavigationLinkRenderProps) => ReactElement;
}) {
  const portalContainer = usePortalContainer();

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
            className={cx(
              linkClasses,
              'data-popup-open:text-neon-coral group flex items-center gap-1',
            )}
          >
            {label}
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform duration-200 group-data-popup-open:rotate-180"
            />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0">
            <ul className="flex min-w-64 flex-col gap-1 p-2">
              {links.map((link) => {
                const props: SiteNavigationLinkRenderProps = {
                  'href': link.href,
                  'children': link.label,
                  'className': cx(
                    linkClasses,
                    'hover:bg-input flex items-center justify-between gap-6 rounded-xl px-4 py-3',
                  ),
                  'target': link.target,
                  'rel': link.rel,
                  'aria-current': link.active ? 'page' : undefined,
                };

                return (
                  <li key={link.id}>
                    <NavigationMenu.Link
                      active={link.active}
                      closeOnClick
                      href={link.href}
                      target={link.target}
                      rel={link.rel}
                      aria-current={props['aria-current']}
                      className={props.className}
                      render={renderLink(props)}
                    >
                      {link.label}
                      <ArrowUpRight aria-hidden className="size-4 shrink-0" />
                    </NavigationMenu.Link>
                  </li>
                );
              })}
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal container={portalContainer ?? undefined}>
        <NavigationMenu.Positioner
          sideOffset={14}
          align="center"
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <NavigationMenu.Popup className="bg-surface h-(--popup-height) w-(--popup-width) origin-top rounded-[1.75rem] p-3 shadow-2xl ring-1 ring-black/5 transition-[opacity,transform,scale] duration-200 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <NavigationMenu.Viewport className="relative" />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

function SoftwareCard({
  link,
  renderLink,
}: {
  link: SoftwareLink;
  renderLink: (props: SiteNavigationLinkRenderProps) => ReactElement;
}) {
  // No `transition-colors`: the hover tint is a 10% wash on the popup surface,
  // and easing it in over 150ms reads as the highlight lagging the pointer.
  const className = cx(
    'focusable flex h-full w-[23rem] items-start gap-4 rounded p-5',
    hoverAccentClasses[link.id],
  );
  const content = (
    <>
      <img
        alt=""
        src={softwareIcons[link.id]}
        className="size-12 shrink-0 rounded-[18%] object-contain"
      />
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        <span
          className={cx(
            headingVariants({
              level: 'h4',
              variant: 'all-caps',
              margin: 'none',
            }),
            'block',
            accentClasses[link.id],
          )}
        >
          {link.name}
        </span>
        <Paragraph
          intent="smallText"
          margin="none"
          className="text-text/85 mt-1.5 leading-snug"
        >
          {link.description}
        </Paragraph>
        <span
          className={cx(
            'font-heading mt-auto inline-flex items-center gap-1.5 pt-2.5 text-xs font-bold tracking-[0.12em] uppercase',
            accentClasses[link.id],
          )}
        >
          {link.action}
          <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
        </span>
      </div>
    </>
  );
  const props: SiteNavigationLinkRenderProps = {
    'href': link.href,
    'children': content,
    className,
    'target': '_blank',
    'rel': 'noreferrer',
    'aria-label': link.name,
  };

  return (
    <NavigationMenu.Link
      href={link.href}
      target="_blank"
      rel="noreferrer"
      closeOnClick
      className={className}
      render={renderLink(props)}
    >
      {content}
    </NavigationMenu.Link>
  );
}

function SoftwareMenu({
  active,
  label,
  links,
  renderLink,
}: {
  active: boolean;
  label: string;
  links: SoftwareLink[];
  renderLink: (props: SiteNavigationLinkRenderProps) => ReactElement;
}) {
  const portalContainer = usePortalContainer();
  const shouldReduceMotion = usePrefersReducedMotion();

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
            className={cx(
              linkClasses,
              'data-popup-open:text-neon-coral group flex items-center gap-1',
            )}
          >
            {label}
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform duration-200 group-data-popup-open:rotate-180"
            />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0">
            {/* Three cards to a row, fewer where the window is narrower than
                three cards and the popup's padding and margins (4.5rem), so
                the popup never runs off the screen. */}
            <motion.ul
              initial={shouldReduceMotion ? false : 'hidden'}
              animate="visible"
              variants={softwareMenuVariants}
              className="grid max-w-[min(70rem,calc(100vw-4.5rem))] grid-cols-[repeat(auto-fill,23rem)] gap-1 p-1"
            >
              {links.map((link) => (
                <motion.li
                  key={link.id}
                  variants={softwareCardVariants}
                  className="flex"
                >
                  <SoftwareCard link={link} renderLink={renderLink} />
                </motion.li>
              ))}
            </motion.ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal container={portalContainer ?? undefined}>
        <NavigationMenu.Positioner
          sideOffset={14}
          align="center"
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <NavigationMenu.Popup className="bg-surface h-(--popup-height) max-h-[calc(100vh-7rem)] w-(--popup-width) origin-top overflow-y-auto rounded p-5 shadow-2xl ring-1 ring-black/5 transition-[opacity,transform,scale] duration-200 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <NavigationMenu.Viewport className="relative" />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

function MobileLinkGroup({
  active,
  closeMenu,
  label,
  links,
  renderLink,
}: {
  active: boolean;
  closeMenu: () => void;
  label: string;
  links: Array<
    Pick<SiteNavigationLinkRenderProps, 'href' | 'target' | 'rel'> & {
      id: string;
      label: string;
      active?: boolean;
    }
  >;
  renderLink: (props: SiteNavigationLinkRenderProps) => ReactElement;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span
        aria-current={active ? 'page' : undefined}
        className={cx(
          headingVariants({
            level: 'h4',
            variant: 'all-caps',
            margin: 'none',
          }),
          active ? 'text-neon-coral' : 'text-text/60',
        )}
      >
        {label}
      </span>
      {links.map((link) =>
        cloneElement(
          renderLink({
            'href': link.href,
            'children': link.label,
            'className': cx(
              linkClasses,
              'ps-3',
              link.active && 'text-neon-coral',
            ),
            'onClick': closeMenu,
            'target': link.target,
            'rel': link.rel,
            'aria-current': link.active ? 'page' : undefined,
          }),
          { key: link.id },
        ),
      )}
    </div>
  );
}

/**
 * A link's label as the embedded header measures it: the same text in the
 * same type as the link, menu triggers with their chevron.
 */
function MeasuredItem({ label, menu }: { label: string; menu?: boolean }) {
  return (
    <li>
      <span className={cx(linkClasses, 'flex items-center gap-1')}>
        {label}
        {menu ? <ChevronDown className="size-4" /> : null}
      </span>
    </li>
  );
}

/**
 * The logo and the links, inside a host's own header bar (the `embedded`
 * layout). Rather than switching at fixed widths, it measures its links
 * against the room the host gives it, so a longer language or a host with
 * more controls folds the links sooner: every link, then the pages in
 * Resources, then the logo without its name, then the logo alone, when the
 * host's menu carries the links (the `menu` layout).
 */
function EmbeddedNavigation({
  renderBrand,
  hostLink,
  hostMenu,
  links,
  softwareLinks,
  labels,
  renderLink,
  softwareActive,
  onFitChange,
  className,
  style,
}: {
  renderBrand: (showName: boolean) => ReactElement;
  hostLink?: ResourceLink;
  hostMenu?: SiteNavigationHostMenu;
  links: ResourceLink[];
  softwareLinks: SoftwareLink[];
  labels: { navigationLabel: string; resources: string; software: string };
  renderLink: (props: SiteNavigationLinkRenderProps) => ReactElement;
  softwareActive: boolean;
  onFitChange?: (fit: SiteNavigationFit) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [{ fit, showName }, setLayout] = useState<{
    fit: SiteNavigationFit;
    showName: boolean;
  }>({ fit: 'full', showName: true });
  const rootRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const sizer = sizerRef.current;
    if (!root || !sizer) return undefined;

    const width = (selector: string, within: HTMLElement) =>
      within.querySelector(selector)?.getBoundingClientRect().width ?? 0;
    const measure = () => {
      const room = root.clientWidth;
      const mark = width('[data-brand-mark]', root);
      const name = width('[data-measure="name"]', sizer);
      const full = width('[data-measure="full"]', sizer);
      const compact = width('[data-measure="compact"]', sizer);
      let layout: { fit: SiteNavigationFit; showName: boolean };
      if (mark + name + full <= room) layout = { fit: 'full', showName: true };
      else if (mark + name + compact <= room)
        layout = { fit: 'compact', showName: true };
      else if (mark + compact <= room)
        layout = { fit: 'mark', showName: false };
      else layout = { fit: 'brand', showName: mark + name <= room };
      setLayout((current) =>
        current.fit === layout.fit && current.showName === layout.showName
          ? current
          : layout,
      );
    };

    measure();
    // The room changes with the host's layout, and the labels' widths when
    // the fonts arrive or the language changes.
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(sizer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onFitChange?.(fit);
  }, [fit, onFitChange]);

  const hostItem =
    hostLink && hostMenu ? (
      <NavigationMenu.Item>
        <NavigationMenu.Link
          active
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- the Link renders the item's label into this button
          render={<button type="button" />}
          aria-expanded={hostMenu.open}
          // A shadow part, so a host can tell this trigger apart from the
          // rest of the header (the custom element's `host-menu-trigger`).
          part="host-menu-trigger"
          onClick={(event) => hostMenu.onToggle(event.currentTarget)}
          className={cx(linkClasses, 'flex items-center gap-1')}
        >
          {hostLink.label}
          <ChevronDown
            aria-hidden
            className={cx(
              'size-4 transition-transform duration-200',
              hostMenu.open && 'rotate-180',
            )}
          />
        </NavigationMenu.Link>
      </NavigationMenu.Item>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={cx('relative flex w-full min-w-0 items-center', className)}
      style={style}
    >
      <span className="shrink-0">{renderBrand(showName)}</span>

      {fit === 'brand' ? null : (
        <NavigationMenu.Root
          aria-label={labels.navigationLabel}
          className="ms-auto ps-6"
        >
          <NavigationMenu.List className="flex items-center gap-6">
            {hostItem}
            {fit === 'full'
              ? links.map((link) => (
                  <NavigationMenu.Item key={link.id}>
                    <DesktopLink link={link} renderLink={renderLink} />
                  </NavigationMenu.Item>
                ))
              : links.length > 0 && (
                  <NavigationMenu.Item>
                    <ResourcesMenu
                      active={links.some((link) => link.active)}
                      label={labels.resources}
                      links={links}
                      renderLink={renderLink}
                    />
                  </NavigationMenu.Item>
                )}
            <NavigationMenu.Item>
              <SoftwareMenu
                active={softwareActive}
                label={labels.software}
                links={softwareLinks}
                renderLink={renderLink}
              />
            </NavigationMenu.Item>
          </NavigationMenu.List>
        </NavigationMenu.Root>
      )}

      {/* What each arrangement needs, laid out unseen at its natural width;
          `ps-2` and `ps-6` are the gaps before the name and the links. */}
      <div
        ref={sizerRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-s-0 top-0 flex w-max flex-col"
      >
        <span
          data-measure="name"
          className={cx(brandNameClasses, 'w-max ps-2')}
        >
          Network Canvas
        </span>
        <ul data-measure="full" className="flex w-max items-center gap-6 ps-6">
          {hostItem ? (
            <MeasuredItem label={hostLink?.label ?? ''} menu />
          ) : null}
          {links.map((link) => (
            <MeasuredItem key={link.id} label={link.label} />
          ))}
          <MeasuredItem label={labels.software} menu />
        </ul>
        <ul
          data-measure="compact"
          className="flex w-max items-center gap-6 ps-6"
        >
          {hostItem ? (
            <MeasuredItem label={hostLink?.label ?? ''} menu />
          ) : null}
          {links.length > 0 ? (
            <MeasuredItem label={labels.resources} menu />
          ) : null}
          <MeasuredItem label={labels.software} menu />
        </ul>
      </div>
    </div>
  );
}

/**
 * The canonical Network Canvas site header. Its destinations, ordering, and
 * translated navigation copy live here so every site renders the same global
 * navigation. Apps may only adapt routing and inject sanctioned utility UI.
 *
 * The header is repeated on every page of a site, so it opens with the skip
 * link that lets a keyboard or screen-reader user bypass it (WCAG 2.4.1). The
 * link is the first focusable element in the header and therefore the first on
 * any page that puts this header first; it jumps to `skipToId`, which the host
 * page must carry on the element where its content starts.
 */
export default function SiteNavigation({
  activeItemId,
  entranceVariants,
  hostMenu,
  layout = 'header',
  locale,
  mobileAccessory,
  onFitChange,
  renderLink = defaultRenderLink,
  renderUtility,
  site,
  skipToId = SITE_NAVIGATION_SKIP_TARGET_ID,
  className,
  containerClassName,
  style,
}: SiteNavigationProps) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const shouldReduceMotion = usePrefersReducedMotion();
  const labels = siteNavigationMessages[locale];
  const networkCanvasRootHref =
    site === 'website' ? '/' : destinations.networkCanvas;
  const documentationRootHref =
    site === 'documentation' ? '/' : destinations.documentation;
  // Another host cannot read the website's locale cookie, so the link says
  // which language the visitor is already reading.
  const updatesHref = appendPath(
    networkCanvasRootHref,
    site === 'website' ? '/updates' : `/${locale}/updates/`,
  );
  const closeMenu = () => setOpen(false);
  // A fragment link only moves focus to a target the browser already considers
  // focusable; every other browser merely sets the sequential focus navigation
  // starting point, which Safari does not honour. The target belongs to the
  // host page, so make it programmatically focusable and focus it here instead
  // of relying on that. `ownerDocument` rather than the ambient `document`:
  // this header also renders inside the `<nc-site-navigation>` shadow root and
  // could render in a popped-out window, and the target lives in whichever
  // document actually contains the header.
  const handleSkipLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = event.currentTarget.ownerDocument.getElementById(skipToId);
    if (!target) return;

    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  };
  const handleCompactMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    menuButtonRef.current?.focus();
  };

  const resourceLinks: ResourceLink[] = [
    {
      id: 'community',
      label: labels.community,
      href: destinations.community,
      active: activeItemId === 'community',
      target: '_blank',
      rel: 'noreferrer',
    },
    {
      id: 'documentation',
      label: labels.documentation,
      href: documentationRootHref,
      active: activeItemId === 'documentation',
      target: documentationRootHref.startsWith('/') ? undefined : '_blank',
      rel: documentationRootHref.startsWith('/') ? undefined : 'noreferrer',
    },
    {
      id: 'updates',
      label: labels.updates,
      href: updatesHref,
      active: activeItemId === 'updates',
      target: '_blank',
      rel: 'noreferrer',
    },
    {
      id: 'protocolGallery',
      label: labels.protocolGallery,
      href: destinations.protocolGallery,
      active: activeItemId === 'protocolGallery',
      target: '_blank',
      rel: 'noreferrer',
    },
  ];
  const softwareLinks: SoftwareLink[] = (
    [
      'architect',
      'interviewer',
      'fresco',
      'architectClassic',
      'interviewerClassic',
    ] as const
  ).map((id) => ({
    id,
    ...labels.softwareLinks[id],
    href: destinations[id],
  }));
  const resourcesActive =
    activeItemId === 'resources' || resourceLinks.some((link) => link.active);
  // This legacy entry point works on the current site and redirects through
  // locale detection after the replacement website is deployed.
  const getStartedHref =
    site === 'website'
      ? appendPath(networkCanvasRootHref, '/get-started')
      : appendPath(destinations.networkCanvas, '/download');
  const items: InternalNavigationItem[] = [
    ...resourceLinks.map((link) => ({
      ...link,
      className: 'hidden @min-[88rem]:block',
    })),
    {
      id: 'resources',
      className: '@min-[88rem]:hidden',
      render: (view) =>
        view === 'desktop' ? (
          <ResourcesMenu
            active={resourcesActive}
            label={labels.resources}
            links={resourceLinks}
            renderLink={renderLink}
          />
        ) : (
          <MobileLinkGroup
            active={resourcesActive}
            closeMenu={closeMenu}
            label={labels.resources}
            links={resourceLinks}
            renderLink={renderLink}
          />
        ),
    },
    {
      id: 'software',
      render: (view) =>
        view === 'desktop' ? (
          <SoftwareMenu
            active={activeItemId === 'software'}
            label={labels.software}
            links={softwareLinks}
            renderLink={renderLink}
          />
        ) : (
          <MobileLinkGroup
            active={activeItemId === 'software'}
            closeMenu={closeMenu}
            label={labels.software}
            links={softwareLinks.map((link) => ({
              id: link.id,
              label: link.action,
              href: link.href,
              target: '_blank',
              rel: 'noreferrer',
            }))}
            renderLink={renderLink}
          />
        ),
    },
    ...(renderUtility
      ? [
          {
            id: 'utility' as const,
            className: 'flex items-center',
            render: (view: 'desktop' | 'mobile') =>
              renderUtility({ closeMenu, view }),
          },
        ]
      : []),
    {
      id: 'getStarted',
      render: (view) =>
        renderLink({
          'href': getStartedHref,
          'children': labels.getStarted,
          'className': cx(
            buttonVariants({ color: 'primary', size: 'sm' }),
            'rounded-full',
            headingVariants({
              level: 'h4',
              variant: 'all-caps',
              margin: 'none',
            }),
          ),
          'onClick': view === 'mobile' ? closeMenu : undefined,
          'aria-current': activeItemId === 'getStarted' ? 'page' : undefined,
        }),
    },
  ];

  const renderItem = (
    item: InternalNavigationItem,
    view: 'desktop' | 'mobile',
  ) => {
    if ('render' in item) return item.render(view);

    if (view === 'desktop') {
      return <DesktopLink link={item} renderLink={renderLink} />;
    }

    return renderLink({
      'href': item.href,
      'children': item.label,
      'className': linkClasses,
      'onClick': closeMenu,
      'target': item.target,
      'rel': item.rel,
      'aria-current': item.active ? 'page' : undefined,
    });
  };

  if (layout === 'menu') {
    return (
      <nav
        aria-label={labels.navigationLabel}
        className={cx('flex flex-col gap-5', className)}
        style={style}
      >
        {items
          .filter((item) => item.id === 'resources' || item.id === 'software')
          .map((item) => (
            <div key={item.id}>{renderItem(item, 'mobile')}</div>
          ))}
      </nav>
    );
  }

  if (layout === 'embedded') {
    // Only a page can carry the host's menu: the item a visitor is on leads
    // the links as that menu's trigger.
    const hostLink = hostMenu
      ? resourceLinks.find((link) => link.active)
      : undefined;
    return (
      <EmbeddedNavigation
        renderBrand={(showName) =>
          renderLink({
            'href': networkCanvasRootHref,
            'children': <NavigationBrand showName={showName} />,
            'className': 'focusable shrink-0 rounded-sm',
            'aria-label': labels.home,
            'aria-current': activeItemId === 'home' ? 'page' : undefined,
          })
        }
        hostLink={hostLink}
        hostMenu={hostMenu}
        links={resourceLinks.filter((link) => link !== hostLink)}
        softwareLinks={softwareLinks}
        labels={labels}
        renderLink={renderLink}
        softwareActive={activeItemId === 'software'}
        onFitChange={onFitChange}
        className={className}
        style={style}
      />
    );
  }

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
      <div className="absolute inset-s-2 top-2 z-50">
        <a
          href={`#${skipToId}`}
          onClick={handleSkipLinkClick}
          className={skipLinkClasses}
        >
          {labels.skipToContent}
        </a>
      </div>

      <div
        className={cx(
          'tablet-landscape:px-10 flex w-full items-center justify-between px-4 py-6 @min-[30rem]:px-6',
          containerClassName,
        )}
      >
        {renderLink({
          'href': networkCanvasRootHref,
          'children': <NavigationBrand />,
          'className': 'focusable shrink-0 rounded-sm',
          'aria-label': labels.home,
          'aria-current': activeItemId === 'home' ? 'page' : undefined,
        })}

        <NavigationMenu.Root
          aria-label={labels.navigationLabel}
          className={breakpointClasses.desktop}
        >
          <NavigationMenu.List className="flex items-center gap-4 @min-[48rem]:gap-6 @min-[80rem]:gap-8">
            {items.map((item) => (
              <NavigationMenu.Item key={item.id} className={item.className}>
                {renderItem(item, 'desktop')}
              </NavigationMenu.Item>
            ))}
          </NavigationMenu.List>
        </NavigationMenu.Root>

        <div
          className={cx(
            'flex items-center gap-1',
            mobileAccessory ? 'ms-4 min-w-0 flex-1' : undefined,
            breakpointClasses.mobile,
          )}
        >
          {mobileAccessory ? (
            <div className="min-w-0 flex-1">{mobileAccessory}</div>
          ) : null}
          <IconButton
            ref={menuButtonRef}
            icon={
              open ? (
                <X aria-hidden className="size-7" />
              ) : (
                <Menu aria-hidden className="size-7" />
              )
            }
            aria-label={open ? labels.closeMenu : labels.openMenu}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            variant="text"
            color="dynamic"
            size="lg"
            className="text-text border-transparent"
          />
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            onKeyDown={handleCompactMenuKeyDown}
            initial={mobileInitial}
            animate={mobileVisible}
            exit={mobileInitial}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            className={cx(
              'bg-surface absolute inset-x-4 top-full z-50 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[1.75rem] p-6 shadow-xl',
              breakpointClasses.mobile,
            )}
          >
            <nav
              aria-label={labels.navigationLabel}
              className="flex flex-col gap-5"
            >
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

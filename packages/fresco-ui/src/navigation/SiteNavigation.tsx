'use client';

import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Variants } from 'motion/react';
import {
  cloneElement,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { SiteLocale } from '@codaco/shared-consts';

import { buttonVariants, IconButton } from '../Button';
import Spinner from '../Spinner';
import { headingVariants } from '../typography/Heading';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';
import { siteNavigationMessages } from './SiteNavigation.messages';

export type SiteNavigationLocale = SiteLocale;

export type SiteNavigationItemId =
  | 'home'
  | 'community'
  | 'documentation'
  | 'protocolGallery'
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

type SoftwareId =
  | 'architect'
  | 'architectClassic'
  | 'interviewer'
  | 'interviewerClassic'
  | 'fresco';

type ResourceLink = {
  id: 'community' | 'documentation' | 'protocolGallery';
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
  locale: SiteNavigationLocale;
  mobileAccessory?: ReactNode;
  renderLink?: (props: SiteNavigationLinkRenderProps) => ReactElement;
  renderUtility?: (props: SiteNavigationUtilityRenderProps) => ReactNode;
  site: 'documentation' | 'external' | 'website';
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

function defaultRenderLink({
  children,
  ...props
}: SiteNavigationLinkRenderProps) {
  return <a {...props}>{children}</a>;
}

function appendPath(rootHref: string, path: string) {
  return `${rootHref.replace(/\/$/, '')}${path}`;
}

function NavigationBrand() {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="shrink-0">
        <Spinner customSize="0.625rem" animationMode="hover" playOnMount />
      </span>
      <span className="font-heading text-text hidden text-lg font-bold tracking-[0.18em] whitespace-nowrap @min-[56rem]:inline @min-[64rem]:hidden @min-[80rem]:inline">
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
              'data-[popup-open]:text-neon-coral group flex items-center gap-1',
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

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner
          sideOffset={14}
          align="center"
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <NavigationMenu.Popup className="bg-surface origin-top rounded-[1.75rem] p-3 shadow-2xl ring-1 ring-black/5 transition-[opacity,transform,scale] duration-200 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <NavigationMenu.Viewport />
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
  const className = cx(
    'focusable flex h-full w-[19rem] flex-col rounded p-5 transition-colors',
    hoverAccentClasses[link.id],
  );
  const content = (
    <>
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
        margin="none"
        className="text-text/85 mt-1.5 text-sm leading-snug"
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
              'data-[popup-open]:text-neon-coral group flex items-center gap-1',
            )}
          >
            {label}
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform duration-200 group-data-[popup-open]:rotate-180"
            />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <ul className="grid grid-cols-3 gap-1 p-1">
              {links.map((link) => (
                <li key={link.id} className="flex">
                  <SoftwareCard link={link} renderLink={renderLink} />
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
          <NavigationMenu.Popup className="bg-surface max-h-[calc(100vh-7rem)] origin-top overflow-y-auto rounded p-3 shadow-2xl ring-1 ring-black/5 transition-[opacity,transform,scale] duration-200 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <NavigationMenu.Viewport />
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
              'pl-3',
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
 * The canonical Network Canvas site header. Its destinations, ordering, and
 * translated navigation copy live here so every site renders the same global
 * navigation. Apps may only adapt routing and inject sanctioned utility UI.
 */
export default function SiteNavigation({
  activeItemId,
  entranceVariants,
  locale,
  mobileAccessory,
  renderLink = defaultRenderLink,
  renderUtility,
  site,
  className,
  containerClassName,
  style,
}: SiteNavigationProps) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const labels = siteNavigationMessages[locale];
  const networkCanvasRootHref =
    site === 'website' ? '/' : destinations.networkCanvas;
  const documentationRootHref =
    site === 'documentation' ? '/' : destinations.documentation;
  const closeMenu = () => setOpen(false);
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
      className: 'hidden @min-[80rem]:block',
    })),
    {
      id: 'resources',
      className: '@min-[80rem]:hidden',
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
            mobileAccessory ? 'ml-4 min-w-0 flex-1' : undefined,
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

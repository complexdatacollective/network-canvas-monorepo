'use client';

import type { Variants } from 'motion/react';
import { useTranslations } from 'next-intl';

import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';
import type {
  SiteNavigationItem,
  SiteNavigationLinkItem,
  SiteNavigationLinkRenderProps,
} from '@codaco/fresco-ui/navigation/SiteNavigation';
import Spinner from '@codaco/fresco-ui/Spinner';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { LanguageSelector } from '~/components/layout/LanguageSelector';
import {
  type ResourceLink,
  ResourcesMenu,
} from '~/components/layout/ResourcesMenu';
import { SoftwareMenu } from '~/components/layout/SoftwareMenu';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { cn } from '~/lib/cn';
import { navLinks, tools } from '~/lib/content';
import { GET_STARTED_PATH } from '~/lib/getStarted';
import { Link } from '~/lib/i18n/navigation';

const linkClasses = cn(
  headingVariants({ level: 'h4', variant: 'all-caps', margin: 'none' }),
  'text-cyber-grape hover:text-neon-coral whitespace-nowrap transition-colors',
);

const resourceNavLinks = navLinks.filter((link) => link.id !== 'getStarted');

function renderNavigationLink({
  children,
  ...props
}: SiteNavigationLinkRenderProps) {
  return <Link {...props}>{children}</Link>;
}

function NavigationBrand() {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="shrink-0">
        <Spinner customSize="0.625rem" animationMode="hover" playOnMount />
      </span>
      <span className="font-heading text-cyber-grape hidden text-lg font-bold tracking-[0.18em] whitespace-nowrap @min-[56rem]:inline @min-[64rem]:hidden @min-[80rem]:inline">
        Network Canvas
      </span>
    </span>
  );
}

function GetStartedAction({
  active,
  onClick,
}: {
  active: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations('Navigation');

  return (
    <ButtonLink
      href={GET_STARTED_PATH}
      color="primary"
      className={cn(
        'rounded-full',
        headingVariants({
          level: 'h4',
          variant: 'all-caps',
          margin: 'none',
        }),
      )}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {t('getStarted')}
    </ButtonLink>
  );
}

function MobileLinkGroup({
  active,
  closeMenu,
  label,
  links,
}: {
  active: boolean;
  closeMenu: () => void;
  label: string;
  links: ResourceLink[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <span
        className={cn(
          headingVariants({
            level: 'h4',
            variant: 'all-caps',
            margin: 'none',
          }),
          active ? 'text-neon-coral' : 'text-cyber-grape/60',
        )}
      >
        {label}
      </span>
      {links.map((link) => (
        <a
          key={link.id}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          onClick={closeMenu}
          aria-current={link.active ? 'page' : undefined}
          className={cn(linkClasses, 'pl-3', link.active && 'text-neon-coral')}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

export function Header({
  activeItemId,
  entranceVariants,
}: {
  activeItemId?: string;
  entranceVariants?: Variants;
}) {
  const t = useTranslations('Navigation');
  const resourceLinks: ResourceLink[] = resourceNavLinks.map((link) => ({
    id: link.id,
    label: t(link.id),
    href: link.href,
    active: activeItemId === link.id,
  }));
  const softwareLinks: ResourceLink[] = tools.map((tool) => ({
    id: tool.id,
    label: tool.name,
    href: tool.href,
    active: activeItemId === 'software',
  }));
  const resourcesActive = resourceLinks.some((link) => link.active);
  const items: SiteNavigationItem[] = [
    ...resourceLinks.map<SiteNavigationLinkItem>((link) => ({
      id: link.id,
      label: link.label,
      href: link.href,
      target: '_blank',
      rel: 'noreferrer',
      className: 'hidden @min-[64rem]:block',
    })),
    {
      id: 'resources',
      className: '@min-[64rem]:hidden',
      render: ({ closeMenu, view }) =>
        view === 'desktop' ? (
          <ResourcesMenu
            active={resourcesActive}
            label={t('resources')}
            links={resourceLinks}
          />
        ) : (
          <MobileLinkGroup
            active={resourcesActive}
            closeMenu={closeMenu}
            label={t('resources')}
            links={resourceLinks}
          />
        ),
    },
    {
      id: 'software',
      render: ({ active, closeMenu, view }) =>
        view === 'desktop' ? (
          <SoftwareMenu active={active} />
        ) : (
          <MobileLinkGroup
            active={active}
            closeMenu={closeMenu}
            label={t('software')}
            links={softwareLinks}
          />
        ),
    },
    {
      id: 'language',
      render: ({ closeMenu, view }) => (
        <LanguageSelector
          onNavigate={view === 'mobile' ? closeMenu : undefined}
        />
      ),
    },
    {
      id: 'getStarted',
      render: ({ active, closeMenu, view }) => (
        <GetStartedAction
          active={active}
          onClick={view === 'mobile' ? closeMenu : undefined}
        />
      ),
    },
  ];

  return (
    <SiteNavigation
      activeItemId={activeItemId}
      brand={<NavigationBrand />}
      brandHref="/"
      brandLabel={t('home')}
      closeMenuLabel={t('closeMenu')}
      entranceVariants={entranceVariants}
      items={items}
      openMenuLabel={t('openMenu')}
      renderLink={renderNavigationLink}
    />
  );
}

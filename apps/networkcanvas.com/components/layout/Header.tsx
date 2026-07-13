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

const topLevelLinks = navLinks.filter((link) => link.id !== 'getStarted');

function renderNavigationLink({
  children,
  ...props
}: SiteNavigationLinkRenderProps) {
  return <Link {...props}>{children}</Link>;
}

function NavigationBrand() {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className="shrink-0">
        <Spinner customSize="0.625rem" animationMode="hover" playOnMount />
      </span>
      <span className="font-heading text-cyber-grape laptop:inline hidden text-lg font-bold tracking-[0.18em] whitespace-nowrap">
        Network Canvas
      </span>
    </span>
  );
}

function MobileSoftwareLinks({
  active,
  closeMenu,
}: {
  active: boolean;
  closeMenu: () => void;
}) {
  const t = useTranslations('Navigation');

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
        {t('software')}
      </span>
      {tools.map((tool) => (
        <a
          key={tool.name}
          href={tool.href}
          target="_blank"
          rel="noreferrer"
          onClick={closeMenu}
          className={`${linkClasses} pl-3`}
        >
          {tool.name}
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
  const items: SiteNavigationItem[] = [
    ...topLevelLinks.map<SiteNavigationLinkItem>((link) => ({
      id: link.id,
      label: t(link.id),
      href: link.href,
      target: '_blank',
      rel: 'noreferrer',
    })),
    {
      id: 'software',
      render: ({ active, closeMenu, view }) =>
        view === 'desktop' ? (
          <SoftwareMenu active={active} />
        ) : (
          <MobileSoftwareLinks active={active} closeMenu={closeMenu} />
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
          onClick={view === 'mobile' ? closeMenu : undefined}
          aria-current={active ? 'page' : undefined}
        >
          {t('getStarted')}
        </ButtonLink>
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

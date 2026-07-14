'use client';

import type { Variants } from 'motion/react';
import { useLocale } from 'next-intl';

import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';
import type { SiteNavigationLinkRenderProps } from '@codaco/fresco-ui/navigation/SiteNavigation';
import ThemeSwitcher from '~/components/layout/ThemeSwitcher';
import { isLocale } from '~/lib/i18n/locales';
import { Link } from '~/lib/i18n/navigation';

function renderNavigationLink({
  children,
  ...props
}: SiteNavigationLinkRenderProps) {
  return <Link {...props}>{children}</Link>;
}

export function Header({
  activeItemId,
  entranceVariants,
}: {
  activeItemId?: 'home' | 'getStarted';
  entranceVariants?: Variants;
}) {
  const locale = useLocale();
  if (!isLocale(locale)) {
    throw new Error(`Unsupported site navigation locale: ${locale}`);
  }

  return (
    <SiteNavigation
      activeItemId={activeItemId}
      className={entranceVariants ? 'entrance-motion-item' : undefined}
      entranceVariants={entranceVariants}
      locale={locale}
      renderLink={renderNavigationLink}
      renderUtility={({ view }) => <ThemeSwitcher view={view} />}
      site="website"
    />
  );
}

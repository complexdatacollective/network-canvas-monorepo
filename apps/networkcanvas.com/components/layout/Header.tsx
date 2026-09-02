'use client';

import type { Variants } from 'motion/react';
import { useLocale } from 'next-intl';

import SharedSiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';
import type { SiteNavigationLinkRenderProps } from '@codaco/fresco-ui/navigation/SiteNavigation';
import ThemeSwitcher from '~/components/layout/ThemeSwitcher';
import { isLocale } from '~/lib/i18n/locales';
import { Link } from '~/lib/i18n/navigation';
import { resolveWebsiteNavigationUrl, type SiteHost } from '~/lib/siteUrls';

export function Header({
  activeItemId,
  className,
  containerClassName,
  entranceVariants,
  host = 'website',
}: {
  activeItemId?: 'home' | 'getStarted' | 'protocolGallery';
  className?: string;
  containerClassName?: string;
  entranceVariants?: Variants;
  host?: SiteHost;
}) {
  const locale = useLocale();
  if (!isLocale(locale)) {
    throw new Error(`Unsupported site navigation locale: ${String(locale)}`);
  }

  const renderNavigationLink = ({
    children,
    target,
    rel,
    ...props
  }: SiteNavigationLinkRenderProps) => {
    const href = resolveWebsiteNavigationUrl(props.href, locale, host);
    // A destination rewritten onto this site is an ordinary in-site route and
    // must not keep the new-tab treatment the shared navigation gives it.
    const sameSite = href.startsWith('/');

    return (
      <Link
        {...props}
        href={href}
        target={sameSite ? undefined : target}
        rel={sameSite ? undefined : rel}
      >
        {children}
      </Link>
    );
  };

  return (
    <SharedSiteNavigation
      activeItemId={activeItemId}
      className={
        [entranceVariants ? 'entrance-motion-item' : undefined, className]
          .filter(Boolean)
          .join(' ') || undefined
      }
      containerClassName={containerClassName}
      entranceVariants={entranceVariants}
      locale={locale}
      renderLink={renderNavigationLink}
      renderUtility={({ view }) => <ThemeSwitcher view={view} />}
      site="website"
    />
  );
}

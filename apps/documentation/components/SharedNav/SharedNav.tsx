'use client';

import { useLocale } from 'next-intl';

import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';
import type {
  SiteNavigationLinkRenderProps,
  SiteNavigationLocale,
} from '@codaco/fresco-ui/navigation/SiteNavigation';
import { type Locale, toLocale } from '~/app/types';
import { routing } from '~/lib/i18n/routing';
import { resolveNetworkCanvasUrl } from '~/lib/siteUrls';
import { Link } from '~/navigation';

import MobileNavBar from '../MobileNavBar';
import ThemeSwitcher from '../ThemeSwitcher';

const siteLocaleByDocumentationLocale = {
  en: 'en-US',
} satisfies Record<Locale, SiteNavigationLocale>;

function renderNavigationLink({
  children,
  ...props
}: SiteNavigationLinkRenderProps) {
  return (
    <Link {...props} href={resolveNetworkCanvasUrl(props.href)}>
      {children}
    </Link>
  );
}

export default function SharedNav() {
  const locale = toLocale(useLocale()) ?? routing.defaultLocale;

  return (
    <SiteNavigation
      activeItemId="documentation"
      locale={siteLocaleByDocumentationLocale[locale]}
      mobileAccessory={<MobileNavBar />}
      renderLink={renderNavigationLink}
      renderUtility={({ view }) => <ThemeSwitcher view={view} />}
      site="documentation"
    />
  );
}

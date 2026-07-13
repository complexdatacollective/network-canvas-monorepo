'use client';

import { useLocale } from 'next-intl';

import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';
import type {
  SiteNavigationLinkRenderProps,
  SiteNavigationLocale,
} from '@codaco/fresco-ui/navigation/SiteNavigation';
import type { Locale } from '~/app/types';
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
  return <Link {...props}>{children}</Link>;
}

export default function SharedNav() {
  const locale = useLocale() as Locale;

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

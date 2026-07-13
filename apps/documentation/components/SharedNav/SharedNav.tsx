'use client';

import { useLocale } from 'next-intl';

import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';
import type {
  SiteNavigationLinkRenderProps,
  SiteNavigationLocale,
} from '@codaco/fresco-ui/navigation/SiteNavigation';
import { cx } from '@codaco/fresco-ui/utils/cva';
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

export default function SharedNav({
  isHomePage = false,
}: {
  isHomePage?: boolean;
}) {
  const locale = useLocale() as Locale;

  return (
    <SiteNavigation
      activeItemId="documentation"
      locale={siteLocaleByDocumentationLocale[locale]}
      mobileAccessory={<MobileNavBar />}
      renderLink={renderNavigationLink}
      renderUtility={({ view }) => <ThemeSwitcher view={view} />}
      site="documentation"
      className={cx(
        'border-outline sticky top-0 z-50 mx-auto w-full border-b backdrop-blur-sm',
        'tablet-landscape:relative tablet-landscape:border-b-0',
        // The homepage keeps a translucent nav that floats over the hero; every
        // other page gets a solid bar to separate it from page content. The
        // background token auto-swaps: near-white in light mode, dark in dark.
        isHomePage
          ? 'bg-background/50 tablet-landscape:backdrop-blur-0 tablet-landscape:border-none tablet-landscape:bg-transparent'
          : 'bg-background',
      )}
    />
  );
}

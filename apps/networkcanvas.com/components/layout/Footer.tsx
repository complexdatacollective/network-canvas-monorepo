import { useLocale, useTranslations } from 'next-intl';

import SharedSiteFooter from '@codaco/fresco-ui/navigation/SiteFooter';
import type {
  SiteFooterLink,
  SiteFooterSocialLink,
} from '@codaco/fresco-ui/navigation/SiteFooter';
import { SiteLocaleSwitcher } from '~/components/layout/SiteLocaleSwitcher';
import { Logo } from '~/components/ui/Logo';
import { externalLinks, footerLinks } from '~/lib/content';
import { isLocale } from '~/lib/i18n/locales';
import {
  isSameSiteNavigationUrl,
  type SiteHost,
  websitePageHref,
} from '~/lib/siteUrls';

/**
 * The copyright year comes from `next.config.ts`, which inlines the build's year
 * into both the server and client bundles. Both apps are `output: 'export'`, so
 * reading the clock here instead would bake the build machine's year into the
 * HTML and then recompute it during hydration — a text mismatch, and React #418,
 * for every visitor whose local year differs from the build's. Falling back to an
 * empty string is the safe direction to be wrong in: the year reads as missing
 * rather than disagreeing between the two renders.
 */
const buildYear = process.env.NEXT_PUBLIC_BUILD_YEAR ?? '';

export function Footer({ host = 'website' }: { host?: SiteHost }) {
  const t = useTranslations('Footer');
  const locale = useLocale();
  if (!isLocale(locale)) {
    throw new Error(`Unsupported footer locale: ${String(locale)}`);
  }

  const updatesHref = websitePageHref(locale, '/updates', host);
  const links: SiteFooterLink[] = [
    {
      label: t('updates'),
      href: updatesHref,
      // The shared footer opens links in a new tab unless told otherwise.
      target: isSameSiteNavigationUrl(updatesHref, host) ? '_self' : undefined,
    },
    ...footerLinks.map(({ id, href }) => ({ label: t(id), href })),
  ];
  const socialLinks: SiteFooterSocialLink[] = [
    {
      platform: 'youtube',
      label: t('youtube'),
      href: externalLinks.youtube,
    },
    {
      platform: 'twitter',
      label: t('twitter'),
      href: externalLinks.twitter,
    },
    {
      platform: 'github',
      label: t('github'),
      href: externalLinks.github,
    },
  ];

  return (
    <SharedSiteFooter
      brand={<Logo />}
      links={links}
      copyright={t('copyright', { year: buildYear })}
      socialLinks={socialLinks}
      extraContent={<SiteLocaleSwitcher />}
    />
  );
}

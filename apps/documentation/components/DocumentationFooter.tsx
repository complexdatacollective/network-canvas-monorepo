'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import SiteFooter from '@codaco/fresco-ui/navigation/SiteFooter';
import type {
  SiteFooterLink,
  SiteFooterSocialLink,
} from '@codaco/fresco-ui/navigation/SiteFooter';

import Link from './Link';
import LogoComponent from './SharedNav/LogoComponent';

const links = {
  privacy: 'https://assets.networkcanvas.com/public/files/Website/privacy.txt',
} as const;

const socialLinks = {
  youtube: 'https://www.youtube.com/@complexdatacollective2923',
  twitter: 'https://twitter.com/networkcanvas?lang=en',
  github: 'https://github.com/complexdatacollective',
} as const;

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

const renderNetlifyLink = (children: ReactNode) => (
  <Link href="https://www.netlify.com" className="font-normal">
    {children}
  </Link>
);

export default function DocumentationFooter() {
  const t = useTranslations('Footer');
  const footerLinks: SiteFooterLink[] = [
    { label: t('privacy'), href: links.privacy },
  ];
  const footerSocialLinks: SiteFooterSocialLink[] = [
    {
      platform: 'youtube',
      label: t('youtube'),
      href: socialLinks.youtube,
    },
    {
      platform: 'twitter',
      label: t('twitter'),
      href: socialLinks.twitter,
    },
    {
      platform: 'github',
      label: t('github'),
      href: socialLinks.github,
    },
  ];

  return (
    <SiteFooter
      brand={<LogoComponent variant="wordmark" />}
      links={footerLinks}
      copyright={t('copyright', { year: buildYear })}
      socialLinks={footerSocialLinks}
      extraContent={
        <span className="text-text/70 text-base">
          {t.rich('netlify', {
            link: renderNetlifyLink,
          })}
        </span>
      }
      className="mt-10"
    />
  );
}

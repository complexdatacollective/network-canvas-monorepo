'use client';

import { useTranslations } from 'next-intl';

import SiteFooter from '@codaco/fresco-ui/navigation/SiteFooter';
import type {
  SiteFooterLink,
  SiteFooterSocialLink,
} from '@codaco/fresco-ui/navigation/SiteFooter';

import LogoComponent from './SharedNav/LogoComponent';

const links = {
  terms:
    'https://assets.networkcanvas.com/public/files/Website/terms-and-conditions.txt',
  privacy: 'https://assets.networkcanvas.com/public/files/Website/privacy.txt',
} as const;

const socialLinks = {
  youtube: 'https://www.youtube.com/@complexdatacollective2923',
  twitter: 'https://twitter.com/networkcanvas?lang=en',
  github: 'https://github.com/complexdatacollective',
} as const;

export default function DocumentationFooter() {
  const t = useTranslations('Footer');
  const footerLinks: SiteFooterLink[] = [
    { label: t('terms'), href: links.terms },
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
      copyright={t('copyright', { year: new Date().getFullYear() })}
      socialLinks={footerSocialLinks}
      extraContent={
        <span className="text-text/70 text-base">
          {t.rich('netlify', {
            link: (children) => (
              <a
                href="https://www.netlify.com"
                target="_blank"
                rel="noopener noreferrer"
                className="focusable text-link hover:text-text rounded-sm underline transition-colors"
              >
                {children}
              </a>
            ),
          })}
        </span>
      }
      className="mt-10"
    />
  );
}

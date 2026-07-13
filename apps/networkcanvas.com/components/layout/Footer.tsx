import { useTranslations } from 'next-intl';

import SiteFooter from '@codaco/fresco-ui/navigation/SiteFooter';
import type {
  SiteFooterLink,
  SiteFooterSocialLink,
} from '@codaco/fresco-ui/navigation/SiteFooter';
import { LanguageSelector } from '~/components/layout/LanguageSelector';
import { Logo } from '~/components/ui/Logo';
import { externalLinks, footerLinks } from '~/lib/content';

export function Footer() {
  const t = useTranslations('Footer');
  const links: SiteFooterLink[] = footerLinks.map(({ id, href }) => ({
    label: t(id),
    href,
  }));
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
    <SiteFooter
      brand={<Logo />}
      links={links}
      copyright={t('copyright', { year: new Date().getFullYear() })}
      socialLinks={socialLinks}
      extraContent={<LanguageSelector />}
    />
  );
}

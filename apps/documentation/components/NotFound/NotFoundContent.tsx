'use client';

import { createTranslator } from 'next-intl';
import { type ReactNode, useEffect, useSyncExternalStore } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import Link from '~/components/Link';
import { Divider } from '~/components/ui/Divider';
import { ListItem } from '~/components/ui/typography/ListItem';
import { defaultLocale, type Locale, toLocale } from '~/lib/i18n/locales';
import en from '~/messages/en.json';
import es from '~/messages/es.json';
import fr from '~/messages/fr.json';

const messagesByLocale = { en, es, fr } satisfies Record<Locale, typeof en>;

// The site is a static export, so one 404 page answers every missing address.
// It is built in the default language and, once in the browser, follows the
// language the missing address names (`/es/...`).
const subscribe = () => () => undefined;
const readLocale = (): Locale =>
  toLocale(window.location.pathname.split('/')[1]) ?? defaultLocale;
const readServerLocale = (): Locale => defaultLocale;

const renderEmailLink = (children: ReactNode) => (
  <Link href="mailto:info@networkcanvas.com">{children}</Link>
);

export default function NotFoundContent() {
  const locale = useSyncExternalStore(subscribe, readLocale, readServerLocale);
  const t = createTranslator({
    locale,
    messages: messagesByLocale[locale],
    namespace: 'NotFound',
  });

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="phone-landscape:p-0 max-w-lg p-3">
      <Heading level="h1">{t('title')}</Heading>
      <Divider />
      <Heading level="h2">{t('heading')}</Heading>
      <Paragraph>{t('explanation')}</Paragraph>
      <Paragraph>{t('tryThis')}</Paragraph>
      <UnorderedList>
        <ListItem>{t('checkSpelling')}</ListItem>
        <ListItem>{t('goHome')}</ListItem>
        <ListItem>{t.rich('contact', { link: renderEmailLink })}</ListItem>
      </UnorderedList>
      <Link href={`/${locale}`}>{t('returnHome')}</Link>
    </div>
  );
}

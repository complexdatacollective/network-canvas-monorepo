'use client';

import { Sparkles } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Pill from '@codaco/fresco-ui/Pill';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Link } from '~/lib/i18n/navigation';
import type { NewsItem as NewsItemRecord } from '~/lib/siteContent';

function NewsLink({
  children,
  href,
  tabIndex,
}: {
  children: ReactNode;
  href: string;
  tabIndex?: number;
}) {
  const isInternal = href.startsWith('/');

  return (
    <NativeLink
      href={href}
      render={isInternal ? <Link href={href} /> : undefined}
      target={isInternal ? undefined : '_blank'}
      rel={isInternal ? undefined : 'noreferrer'}
      tabIndex={tabIndex}
      className="text-cerulean-blue font-bold"
    >
      {children}
    </NativeLink>
  );
}

function NewsItem({
  title,
  href,
  duplicate = false,
}: {
  title: string;
  href: string;
  duplicate?: boolean;
}) {
  const t = useTranslations('News');

  return (
    <span
      aria-hidden={duplicate || undefined}
      className="text-base-sm text-text/80 inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
    >
      {title}
      <NewsLink href={href} tabIndex={duplicate ? -1 : undefined}>
        {t('fullStory')}
      </NewsLink>
    </span>
  );
}

const NewsLabel = () => (
  <Pill
    icon={<Sparkles aria-hidden className="text-mustard size-5" />}
    className="font-heading text-base-sm text-text inline-flex shrink-0 items-center gap-2 p-0 font-bold tracking-[0.12em] uppercase"
  >
    {useTranslations('News')('label')}
  </Pill>
);

export function NewsTicker({
  newsItems,
}: {
  newsItems: readonly NewsItemRecord[];
}) {
  const t = useTranslations('News');
  const shouldReduceMotion = useReducedMotion() === true;
  const activeNewsItem = newsItems[0];

  return (
    <div className="border-cerulean-blue/30 bg-cerulean-blue/5 tablet-portrait:rounded-full rounded-[1.5rem] border backdrop-blur-md">
      {/* Desktop: single-line marquee */}
      <div className="tablet-portrait:flex hidden items-center gap-5 px-6 py-3">
        <NewsLabel />
        <div className="relative flex-1 overflow-hidden mask-[linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
          {shouldReduceMotion ? (
            activeNewsItem ? (
              <NewsItem {...activeNewsItem} />
            ) : null
          ) : (
            <div className="animate-marquee flex w-max gap-12 focus-within:[animation-play-state:paused] hover:[animation-play-state:paused] motion-reduce:animate-none">
              {newsItems.map((item) => (
                <NewsItem key={`first-${item.id}`} {...item} />
              ))}
              {newsItems.map((item) => (
                <NewsItem key={`second-${item.id}`} {...item} duplicate />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: stacked card */}
      <div className="tablet-portrait:hidden flex flex-col gap-3 p-6">
        <NewsLabel />
        {newsItems.map((item) => (
          <Paragraph
            margin="none"
            key={item.id}
            className="text-base-sm text-text/80"
          >
            {item.title} <NewsLink href={item.href}>{t('fullStory')}</NewsLink>
          </Paragraph>
        ))}
      </div>
    </div>
  );
}

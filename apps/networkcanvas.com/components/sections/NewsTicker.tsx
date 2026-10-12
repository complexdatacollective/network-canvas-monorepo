'use client';

import { Sparkles } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import useHasHydrated from '@codaco/fresco-ui/hooks/useHasHydrated';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { SiteLink } from '~/components/ui/SiteLink';
import type { NewsItem as NewsItemRecord } from '~/lib/siteContent';

function NewsEntry({
  title,
  href,
  tabIndex,
}: {
  title: string;
  href: string;
  tabIndex?: number;
}) {
  const t = useTranslations('News');
  const titleId = useId();
  const linkId = useId();

  return (
    <>
      <span id={titleId}>{title}</span>{' '}
      <SiteLink
        id={linkId}
        href={href}
        tabIndex={tabIndex}
        aria-labelledby={`${linkId} ${titleId}`}
        className="text-cerulean-blue font-bold"
      >
        {t('readMore')}
      </SiteLink>
    </>
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
  return (
    <span
      aria-hidden={duplicate || undefined}
      className="text-base-sm text-text/80 inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
    >
      <NewsEntry
        title={title}
        href={href}
        tabIndex={duplicate ? -1 : undefined}
      />
    </span>
  );
}

const NewsLabel = () => (
  <span className="font-heading text-base-sm text-text inline-flex shrink-0 items-center gap-2 font-bold tracking-[0.12em] uppercase">
    <Sparkles aria-hidden className="text-mustard size-5" />
    {useTranslations('News')('label')}
  </span>
);

export function NewsTicker({
  newsItems,
}: {
  newsItems: readonly NewsItemRecord[];
}) {
  const prefersReducedMotion = useReducedMotion() === true;
  // The branch below chooses between two different element trees, so it must
  // not depend on the preference until after hydration: `useReducedMotion()`
  // answers `null` on the server (motion learns the preference from
  // `matchMedia`, which the server cannot read) and `true` on a client that
  // prefers reduced motion. Reading it during the first client render made the
  // server send the marquee and a reduced-motion visitor render a single item
  // over it — a structural mismatch, which React throws as a hydration error
  // and discards the whole tree for. Gating on hydration keeps the first client
  // render identical to the server's; the marquee's own
  // `motion-reduce:animate-none` means that frame is already motionless, so
  // these visitors never see it move.
  const hasHydrated = useHasHydrated();
  const shouldReduceMotion = hasHydrated && prefersReducedMotion;
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
            <NewsEntry title={item.title} href={item.href} />
          </Paragraph>
        ))}
      </div>
    </div>
  );
}

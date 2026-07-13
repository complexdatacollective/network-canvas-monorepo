import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import Pill from '@codaco/fresco-ui/Pill';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { NewsItem as NewsItemRecord } from '~/lib/siteContent';

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
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        tabIndex={duplicate ? -1 : undefined}
        className="text-cerulean-blue font-bold hover:underline"
      >
        {t('fullStory')}
      </a>
    </span>
  );
}

const NewsLabel = () => (
  <Pill
    icon={<Sparkles aria-hidden className="text-mustard size-5" />}
    className="font-heading text-base-sm text-cyber-grape inline-flex shrink-0 items-center gap-2 p-0 font-bold tracking-[0.12em] uppercase"
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

  return (
    <div className="border-cerulean-blue/30 bg-cerulean-blue/5 tablet-portrait:rounded-full rounded-[1.5rem] border">
      {/* Desktop: single-line marquee */}
      <div className="tablet-portrait:flex hidden items-center gap-5 px-6 py-3">
        <NewsLabel />
        <div className="relative flex-1 overflow-hidden mask-[linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
          <div className="animate-marquee flex w-max gap-12 motion-reduce:animate-none">
            {newsItems.map((item) => (
              <NewsItem key={`first-${item.id}`} {...item} />
            ))}
            {newsItems.map((item) => (
              <NewsItem key={`second-${item.id}`} {...item} duplicate />
            ))}
          </div>
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
            {item.title}{' '}
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="text-cerulean-blue font-bold hover:underline"
            >
              {t('fullStory')}
            </a>
          </Paragraph>
        ))}
      </div>
    </div>
  );
}

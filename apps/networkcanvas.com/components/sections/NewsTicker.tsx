import { Sparkles } from 'lucide-react';

import Pill from '@codaco/fresco-ui/Pill';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { newsItems } from '~/lib/content';

function NewsItem({ title, href }: { title: string; href: string }) {
  return (
    <span className="text-base-sm text-text/80 inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
      {title}
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-cerulean-blue font-bold hover:underline"
      >
        [Full story]
      </a>
    </span>
  );
}

const NewsLabel = () => (
  <Pill
    icon={<Sparkles className="text-mustard size-5" />}
    className="font-heading text-base-sm text-cyber-grape inline-flex shrink-0 items-center gap-2 p-0 font-bold tracking-[0.12em] uppercase"
  >
    Latest News:
  </Pill>
);

export function NewsTicker() {
  return (
    <div className="border-cerulean-blue/30 bg-cerulean-blue/5 tablet-portrait:rounded-full rounded-[1.5rem] border">
      {/* Desktop: single-line marquee */}
      <div className="tablet-portrait:flex hidden items-center gap-5 px-6 py-3">
        <NewsLabel />
        <div className="relative flex-1 overflow-hidden mask-[linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
          <div className="animate-marquee flex w-max gap-12">
            {newsItems.map((item, i) => (
              <NewsItem key={`first-${i}`} {...item} />
            ))}
            {newsItems.map((item, i) => (
              <NewsItem key={`second-${i}`} {...item} />
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
            key={item.title}
            className="text-base-sm text-text/80"
          >
            {item.title}{' '}
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="text-cerulean-blue font-bold hover:underline"
            >
              [Full story]
            </a>
          </Paragraph>
        ))}
      </div>
    </div>
  );
}

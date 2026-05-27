import { Sparkles } from 'lucide-react';

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

const Badge = () => (
  <span className="font-heading text-base-sm text-cyber-grape inline-flex shrink-0 items-center gap-2 font-bold tracking-[0.12em] uppercase">
    <Sparkles className="text-mustard size-5" />
    Latest News:
  </span>
);

export function NewsTicker() {
  return (
    <div className="border-cerulean-blue/30 bg-cerulean-blue/5 tablet-landscape:rounded-full rounded-[1.5rem] border">
      {/* Desktop: single-line marquee */}
      <div className="tablet-landscape:flex hidden items-center gap-5 px-6 py-3">
        <Badge />
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
          <div className="animate-marquee flex w-max gap-12">
            {[...newsItems, ...newsItems].map((item, i) => (
              <NewsItem key={i} {...item} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: stacked card */}
      <div className="tablet-landscape:hidden flex flex-col gap-3 p-6">
        <Badge />
        {newsItems.map((item) => (
          <p key={item.title} className="text-base-sm text-text/80">
            {item.title}{' '}
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="text-cerulean-blue font-bold hover:underline"
            >
              [Full story]
            </a>
          </p>
        ))}
      </div>
    </div>
  );
}

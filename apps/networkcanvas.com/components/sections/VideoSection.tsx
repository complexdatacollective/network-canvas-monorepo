import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { Container } from '~/components/ui/Container';
import { Logo } from '~/components/ui/Logo';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { externalLinks } from '~/lib/content';

function renderChannelLink(chunks: ReactNode) {
  return (
    <NativeLink
      href={externalLinks.youtubeChannel}
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

export function VideoSection() {
  const t = useTranslations('Video');

  return (
    <Container className="tablet-landscape:py-24 py-20">
      <SectionHeading title={t('heading')}>
        {t.rich('description', { channel: renderChannelLink })}
      </SectionHeading>

      <Reveal data-homepage-weave-target className="mx-auto mt-12 max-w-3xl">
        <a
          href={externalLinks.youtubeChannel}
          target="_blank"
          rel="noreferrer"
          aria-label={t('watchLabel')}
          className="focusable group relative flex aspect-video items-center justify-center overflow-hidden rounded shadow-xl"
        >
          <span className="animate-background-gradient from-neon-coral via-purple-pizazz to-cerulean-blue absolute inset-0 bg-linear-to-br bg-[length:200%_200%]" />
          <span className="relative flex flex-col items-center gap-5 text-white">
            <Logo markClassName="h-14 w-14" showWordmark={false} />
            <span className="font-heading tablet-landscape:text-3xl text-2xl font-bold">
              {t('title')}
            </span>
            <span className="text-text bg-surface/90 flex size-16 items-center justify-center rounded-full transition-transform group-hover:scale-110">
              <Play
                aria-hidden
                className="size-7 translate-x-0.5 fill-current"
              />
            </span>
          </span>
        </a>
      </Reveal>
    </Container>
  );
}

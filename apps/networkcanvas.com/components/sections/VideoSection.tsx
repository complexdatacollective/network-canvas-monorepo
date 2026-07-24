/* oxlint-disable react/iframe-missing-sandbox -- YouTube requires its normal cross-origin client identity; sandboxing the player produces error 153. */
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { scrollDrivenRevealMotion } from '~/components/ui/scrollDrivenMotion';
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
    <Container>
      <Reveal {...scrollDrivenRevealMotion}>
        <SectionHeading title={t('heading')}>
          {t.rich('description', { channel: renderChannelLink })}
        </SectionHeading>
      </Reveal>

      <Reveal
        {...scrollDrivenRevealMotion}
        direction="zoom"
        className="mx-auto mt-12 max-w-3xl"
      >
        <iframe
          src="https://www.youtube-nocookie.com/embed/XzfE6j-LnII?si=sg8osuFqwG3ZlDK1"
          title={t('watchLabel')}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="aspect-video w-full rounded shadow-xl"
        />
      </Reveal>
    </Container>
  );
}

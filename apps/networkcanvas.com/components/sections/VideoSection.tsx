import { Play } from 'lucide-react';

import { Container } from '~/components/ui/Container';
import { Logo } from '~/components/ui/Logo';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { externalLinks } from '~/lib/content';

export function VideoSection() {
  return (
    <Container className="tablet-landscape:py-24 py-20">
      <SectionHeading title="Learn more">
        Our goal is to build a suite of tools for the research community that is
        high quality, free, safe for research, and built to last. Watch our
        project video to learn more about why we created Network Canvas, and
        visit our{' '}
        <a
          href={externalLinks.youtubeChannel}
          target="_blank"
          rel="noreferrer"
          className="text-link font-bold hover:underline"
        >
          YouTube channel
        </a>{' '}
        for more videos.
      </SectionHeading>

      <Reveal className="mx-auto mt-12 max-w-3xl">
        <a
          href={externalLinks.youtubeChannel}
          target="_blank"
          rel="noreferrer"
          aria-label="Watch: What is Network Canvas?"
          className="focusable group relative flex aspect-video items-center justify-center overflow-hidden rounded-[1.75rem] shadow-xl"
        >
          <span className="animate-background-gradient from-neon-coral via-purple-pizazz to-cerulean-blue absolute inset-0 bg-gradient-to-br bg-[length:200%_200%]" />
          <span className="relative flex flex-col items-center gap-5 text-white">
            <Logo markClassName="h-14 w-14" showWordmark={false} />
            <span className="font-heading tablet-landscape:text-3xl text-2xl font-bold">
              What is Network Canvas?
            </span>
            <span className="text-cyber-grape flex size-16 items-center justify-center rounded-full bg-white/90 transition-transform group-hover:scale-110">
              <Play className="size-7 translate-x-0.5 fill-current" />
            </span>
          </span>
        </a>
      </Reveal>
    </Container>
  );
}

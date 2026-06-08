import { NewsTicker } from '~/components/sections/NewsTicker';
import { Container } from '~/components/ui/Container';
import { DeviceMockup } from '~/components/ui/DeviceMockup';
import { PillLink } from '~/components/ui/PillLink';

export function Hero() {
  return (
    <Container className="tablet-landscape:pb-28 pt-6 pb-20">
      <h1 className="font-heading text-cyber-grape tablet-landscape:text-[3.5rem] tablet-landscape:leading-[1.08] mx-auto max-w-4xl text-center text-4xl font-black">
        Simplifying complex network data collection.
      </h1>

      <div className="tablet-landscape:mt-16 tablet-landscape:grid-cols-[1.1fr_0.9fr] tablet-landscape:gap-16 mt-12 grid items-center gap-10">
        <div className="tablet-landscape:block hidden">
          <DeviceMockup variant="interviewer" />
        </div>
        <p className="text-text/85 tablet-landscape:text-left tablet-landscape:text-xl text-center text-lg leading-relaxed">
          Network Canvas provides{' '}
          <strong className="text-cyber-grape">free and open-source</strong>{' '}
          software for surveying networks, designed around the needs of both
          researchers and their participants.
        </p>
      </div>

      <div className="tablet-landscape:mt-16 mt-12">
        <NewsTicker />
      </div>

      <div className="mt-12 flex flex-col items-center gap-3">
        <PillLink href="/download" tone="neon-coral" size="lg">
          Download Now
        </PillLink>
        <p className="text-base-sm text-text/60">
          or keep scrolling to learn more
        </p>
      </div>
    </Container>
  );
}

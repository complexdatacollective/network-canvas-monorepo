import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { principles } from '~/lib/content';

export function DesignPrinciples() {
  return (
    <Container className="tablet-landscape:py-28 py-20">
      <div className="tablet-landscape:grid-cols-[0.85fr_1.15fr] tablet-landscape:gap-16 grid gap-12">
        <div className="tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:self-start">
          <Heading
            level="h2"
            margin="none"
            className="font-heading text-cyber-grape tablet-landscape:text-4xl text-3xl font-bold"
          >
            Design Principles
          </Heading>
          <Paragraph
            margin="none"
            className="text-text/80 tablet-landscape:text-lg mt-5 text-base leading-relaxed"
          >
            Underpinning all Network Canvas software is a set of five design
            principles. These principles are derived from our observations and
            experiences regarding the problems facing researchers wishing to
            design and conduct personal networks research.
          </Paragraph>
        </div>

        <div className="flex flex-col gap-6">
          {principles.map((principle, i) => (
            <Reveal
              key={principle.title}
              delay={i * 0.04}
              className="bg-surface tablet-landscape:p-10 rounded-[1.75rem] p-8 shadow-lg"
            >
              <Heading
                level="h3"
                margin="none"
                className="font-heading text-cyber-grape tablet-landscape:text-2xl text-xl font-bold"
              >
                <a
                  href={principle.href}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-neon-coral"
                >
                  {principle.title}
                </a>
              </Heading>
              <div className="text-text/80 mt-4 flex flex-col gap-3 text-base leading-relaxed">
                {principle.body.map((paragraph, j) => (
                  <Paragraph margin="none" key={j}>
                    {paragraph}
                  </Paragraph>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Container>
  );
}

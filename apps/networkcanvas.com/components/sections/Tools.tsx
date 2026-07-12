import { Container } from '~/components/ui/Container';
import { DeviceMockup } from '~/components/ui/DeviceMockup';
import { PillLink } from '~/components/ui/PillLink';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { tools } from '~/lib/content';

const accents = {
  'sea-green': { text: 'text-sea-green', tone: 'sea-green' as const },
  'neon-coral': { text: 'text-neon-coral', tone: 'neon-coral' as const },
  'cerulean-blue': {
    text: 'text-cerulean-blue',
    tone: 'cerulean-blue' as const,
  },
  'slate-blue': { text: 'text-slate-blue', tone: 'slate-blue' as const },
};

export function Tools() {
  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title="A selection of tools to facilitate your research">
        We provide a complete end-to-end workflow for networks research, with an
        app for survey design and for interviewing. Using these tools,
        researchers can easily design, capture, and export network data.
      </SectionHeading>

      <div className="tablet-landscape:gap-24 mt-16 flex flex-col gap-16">
        {tools.map((tool) => {
          const accent = accents[tool.color];
          const isExternal = tool.cta.href.startsWith('http');
          return (
            <Reveal
              key={tool.name}
              className="tablet-landscape:grid-cols-2 tablet-landscape:gap-16 tablet-landscape:p-10 grid items-center gap-8 rounded-[2rem] bg-white/55 p-6 shadow-xl backdrop-blur-md"
            >
              <div className="tablet-landscape:order-1 order-2">
                <h3
                  className={`font-heading tablet-landscape:text-3xl text-2xl font-bold ${accent.text}`}
                >
                  {tool.name}
                </h3>
                <p className="text-cyber-grape tablet-landscape:text-lg mt-4 text-base leading-relaxed">
                  {tool.description}
                </p>
                <PillLink
                  href={tool.cta.href}
                  external={isExternal}
                  tone={accent.tone}
                  className="mt-6"
                >
                  {tool.cta.label}
                </PillLink>
              </div>
              <div className="tablet-landscape:order-2 order-1">
                <DeviceMockup variant={tool.variant} />
              </div>
            </Reveal>
          );
        })}
      </div>
    </Container>
  );
}

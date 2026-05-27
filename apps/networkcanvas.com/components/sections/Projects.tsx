import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { cn } from '~/lib/cn';
import { projects } from '~/lib/content';

const palette = {
  'slate-blue': {
    tint: 'bg-slate-blue/10',
    text: 'text-slate-blue',
    pill: 'bg-slate-blue',
  },
  'cerulean-blue': {
    tint: 'bg-cerulean-blue/10',
    text: 'text-cerulean-blue',
    pill: 'bg-cerulean-blue',
  },
  'neon-coral': {
    tint: 'bg-neon-coral/10',
    text: 'text-neon-coral',
    pill: 'bg-neon-coral',
  },
};

export function Projects() {
  return (
    <Container
      as="section"
      id="projects"
      className="tablet-landscape:py-28 scroll-mt-24 py-20"
    >
      <SectionHeading title="Projects">
        We have a number of ongoing projects which aim to either evaluate and
        enhance the software, provide new methods of deployment, or to create
        entirely new ways of collecting network data.
      </SectionHeading>

      <div className="mt-14 flex flex-col gap-8">
        {projects.map((project) => {
          const c = palette[project.color];
          return (
            <Reveal
              key={project.name}
              className={cn(
                'tablet-landscape:grid-cols-[1.5fr_1fr] tablet-landscape:gap-10 tablet-landscape:p-12 grid items-center gap-6 overflow-hidden rounded-[1.75rem] p-8',
                c.tint,
              )}
            >
              <div>
                <h3
                  className={cn(
                    'font-heading tablet-landscape:text-3xl text-2xl font-bold',
                    c.text,
                  )}
                >
                  {project.name}
                </h3>
                <p className="text-text/85 tablet-landscape:text-lg mt-4 text-base leading-relaxed">
                  {project.description}
                </p>
                <a
                  href={project.href}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    'focusable font-heading elevation-low mt-6 inline-flex rounded-full px-6 py-2.5 text-sm font-bold tracking-wide text-white uppercase transition-transform hover:-translate-y-0.5',
                    c.pill,
                  )}
                >
                  Learn More
                </a>
              </div>
              <div className="flex justify-center">
                <img
                  src={project.illustration}
                  alt={`${project.name} illustration`}
                  className="max-h-56 w-auto"
                />
              </div>
            </Reveal>
          );
        })}
      </div>
    </Container>
  );
}

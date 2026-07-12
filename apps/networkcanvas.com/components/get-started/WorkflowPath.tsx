import { AppChoiceCard } from '~/components/get-started/AppChoiceCard';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { cn } from '~/lib/cn';
import {
  type classicApps,
  type Workflow,
  type webApps,
} from '~/lib/getStarted';

type AppRecord = (typeof webApps)[number] | (typeof classicApps)[number];

const pathContent = {
  design: {
    label: 'Path 01 · Design',
    heading: 'Design or create a protocol',
    description:
      'Build a new browser-based study in Architect, or keep a schema 7 workflow in Architect Classic when compatibility requires it.',
  },
  collect: {
    label: 'Path 02 · Collect',
    heading: 'Collect data',
    description:
      'Choose an in-person, remote, or established Classic workflow for gathering network data.',
  },
} satisfies Record<
  Workflow,
  { label: string; heading: string; description: string }
>;

export function WorkflowPath({
  workflow,
  apps,
}: {
  workflow: Workflow;
  apps: readonly AppRecord[];
}) {
  const content = pathContent[workflow];

  return (
    <Container
      as="section"
      id={workflow}
      className="tablet-portrait:py-24 scroll-mt-8 py-16"
    >
      <Reveal className="max-w-3xl">
        <p className="font-heading text-neon-coral text-sm font-bold tracking-[0.14em] uppercase">
          {content.label}
        </p>
        <h2 className="font-heading text-cyber-grape mt-4 text-4xl font-black tracking-tight text-balance">
          {content.heading}
        </h2>
        <p className="text-text/75 mt-5 text-lg text-pretty">
          {content.description}
        </p>
      </Reveal>

      <div className="tablet-landscape:grid-cols-12 mt-12 grid grid-cols-1 gap-6">
        {apps.map((app, index) => (
          <Reveal
            key={app.id}
            delay={index * 0.08}
            className={cn(
              app.treatment === 'featured'
                ? 'tablet-landscape:col-span-7'
                : 'tablet-landscape:col-span-5',
              workflow === 'collect' && index === 2
                ? 'tablet-landscape:col-start-8'
                : undefined,
            )}
          >
            <AppChoiceCard app={app} />
          </Reveal>
        ))}
      </div>
    </Container>
  );
}

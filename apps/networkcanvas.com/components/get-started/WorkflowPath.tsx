import { useTranslations } from 'next-intl';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { AppChoiceCard } from '~/components/get-started/AppChoiceCard';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { scrollDrivenRevealMotion } from '~/components/ui/scrollDrivenMotion';
import {
  type classicApps,
  type Workflow,
  type webApps,
} from '~/lib/getStarted';

type AppRecord = (typeof webApps)[number] | (typeof classicApps)[number];

export function WorkflowPath({
  workflow,
  apps,
}: {
  workflow: Workflow;
  apps: readonly AppRecord[];
}) {
  const t = useTranslations('GetStarted');

  return (
    <Container
      as="section"
      id={workflow}
      className="tablet-portrait:py-24 scroll-mt-8 py-16"
    >
      <Reveal {...scrollDrivenRevealMotion} className="max-w-3xl">
        <Paragraph
          margin="none"
          className="font-heading text-neon-coral text-sm font-bold tracking-[0.14em] uppercase"
        >
          {t(`sections.${workflow}.label`)}
        </Paragraph>
        <Heading
          level="h2"
          variant="section-heading"
          margin="none"
          className="text-text"
        >
          {t(`sections.${workflow}.heading`)}
        </Heading>
        <Paragraph
          intent="lead"
          margin="none"
          className="text-text/75 mt-5 text-lg text-pretty"
        >
          {t(`sections.${workflow}.description`)}
        </Paragraph>
      </Reveal>

      <div className="tablet-landscape:grid-cols-12 mt-12 grid grid-cols-1 gap-6">
        {apps.map((app, index) => (
          <Reveal
            {...scrollDrivenRevealMotion}
            key={app.id}
            direction="zoom"
            delay={index * 0.08}
            className={
              workflow === 'collect'
                ? index < 2
                  ? 'tablet-landscape:col-span-6'
                  : 'tablet-landscape:col-span-12'
                : app.treatment === 'featured'
                  ? 'tablet-landscape:col-span-7'
                  : 'tablet-landscape:col-span-5'
            }
          >
            <AppChoiceCard app={app} />
          </Reveal>
        ))}
      </div>
    </Container>
  );
}

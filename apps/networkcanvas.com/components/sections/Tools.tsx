import { useTranslations } from 'next-intl';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { Container } from '~/components/ui/Container';
import { DeviceMockup } from '~/components/ui/DeviceMockup';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { tools } from '~/lib/content';
import { webDestinations } from '~/lib/getStarted';

const accents = {
  'sea-green': {
    text: 'text-sea-green',
    button: 'bg-sea-green text-white',
  },
  'neon-coral': {
    text: 'text-neon-coral',
    button: 'bg-neon-coral text-white',
  },
  'cerulean-blue': {
    text: 'text-cerulean-blue',
    button: 'bg-cerulean-blue text-white',
  },
  'slate-blue': {
    text: 'text-slate-blue',
    button: 'bg-slate-blue text-white',
  },
};

export function Tools() {
  const t = useTranslations('Tools');

  return (
    <Container className="">
      <SectionHeading title={t('heading')}>{t('introduction')}</SectionHeading>

      <div className="tablet-landscape:gap-12 mt-16 flex flex-col gap-8">
        {tools.map((tool) => {
          const accent = accents[tool.color];
          return (
            <Reveal
              key={tool.id}
              className="tablet-landscape:gap-16 tablet-landscape:p-10 bg-surface/55 grid auto-cols-auto grid-flow-col items-center gap-8 rounded p-6 shadow-xl backdrop-blur-md"
            >
              <div>
                <Heading
                  level="h3"
                  variant="subheading"
                  margin="none"
                  className={accent.text}
                >
                  {tool.name}
                </Heading>
                <Paragraph
                  margin="none"
                  className="text-text tablet-landscape:text-lg mt-4 text-base leading-relaxed"
                >
                  {t(`${tool.id}.description`)}
                </Paragraph>
                <div className="mt-6 flex flex-wrap gap-3">
                  <ButtonLink
                    href={tool.href}
                    external
                    color="default"
                    className={`rounded-full ${accent.button}`}
                  >
                    {t(`${tool.id}.action`)}
                  </ButtonLink>
                  {tool.id === 'fresco' ? (
                    <ButtonLink
                      href={webDestinations.frescoDeployment}
                      external
                      color="default"
                      className="text-slate-blue bg-surface rounded-full"
                    >
                      {t('fresco.deployAction')}
                    </ButtonLink>
                  ) : null}
                </div>
              </div>
              <div className="tablet-landscape:col-start-2 tablet-landscape:row-start-1 tablet-landscape:max-w-none w-112 max-w-[30rem] flex-1">
                <a
                  href={tool.href}
                  target="_blank"
                  rel="noreferrer"
                  className="focusable block rounded"
                >
                  <DeviceMockup variant={tool.variant} />
                </a>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Container>
  );
}

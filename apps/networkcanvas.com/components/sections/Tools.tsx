import { useTranslations } from 'next-intl';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { DeviceMockup } from '~/components/ui/DeviceMockup';
import { PillLink } from '~/components/ui/PillLink';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { tools } from '~/lib/content';

const accents = {
  'sea-green': {
    text: 'text-sea-green',
    tone: 'sea-green' as const,
  },
  'neon-coral': {
    text: 'text-neon-coral',
    tone: 'neon-coral' as const,
  },
  'cerulean-blue': {
    text: 'text-cerulean-blue',
    tone: 'cerulean-blue' as const,
  },
  'slate-blue': {
    text: 'text-slate-blue',
    tone: 'slate-blue' as const,
  },
};

export function Tools() {
  const t = useTranslations('Tools');

  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title={t('heading')}>{t('introduction')}</SectionHeading>

      <div className="tablet-landscape:gap-24 mt-16 flex flex-col gap-16">
        {tools.map((tool) => {
          const accent = accents[tool.color];
          return (
            <Reveal
              key={tool.id}
              className="tablet-landscape:grid-cols-2 tablet-landscape:gap-16 tablet-landscape:p-10 grid items-center gap-8 rounded-[2rem] bg-white/55 p-6 shadow-xl backdrop-blur-md"
            >
              <div>
                <Heading
                  level="h3"
                  margin="none"
                  className={`font-heading tablet-landscape:text-3xl text-2xl font-bold ${accent.text}`}
                >
                  {tool.name}
                </Heading>
                <Paragraph
                  margin="none"
                  className="text-cyber-grape tablet-landscape:text-lg mt-4 text-base leading-relaxed"
                >
                  {t(`${tool.id}.description`)}
                </Paragraph>
                <PillLink
                  href={tool.href}
                  external
                  tone={accent.tone}
                  className="mt-6"
                >
                  {t(`${tool.id}.action`)}
                </PillLink>
              </div>
              <div>
                <a
                  href={tool.href}
                  target="_blank"
                  rel="noreferrer"
                  className="focusable block rounded-[1.75rem]"
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

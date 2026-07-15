import { useTranslations } from 'next-intl';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { principles } from '~/lib/content';

export function DesignPrinciples() {
  const t = useTranslations('Principles');

  return (
    <Container className="tablet-landscape:py-28 py-20">
      <div className="tablet-landscape:grid-cols-[0.85fr_1.15fr] tablet-landscape:gap-16 grid gap-12">
        <div
          data-homepage-weave-target
          className="tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:self-start"
        >
          <Heading
            level="h2"
            margin="none"
            className="font-heading text-text tablet-landscape:text-4xl text-3xl font-bold"
          >
            {t('heading')}
          </Heading>
          <Paragraph
            margin="none"
            className="text-text/80 tablet-landscape:text-lg mt-5 text-base leading-relaxed"
          >
            {t('introduction')}
          </Paragraph>
        </div>

        <div className="flex flex-col gap-6">
          {principles.map((principle, i) => (
            <Reveal
              key={principle.id}
              delay={i * 0.04}
              className="bg-surface tablet-landscape:p-10 rounded p-8 shadow-lg"
            >
              <Heading
                level="h3"
                margin="none"
                className="font-heading text-text tablet-landscape:text-2xl text-xl font-bold"
              >
                <NativeLink
                  href={principle.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text hover:text-neon-coral font-bold"
                >
                  {t(`${principle.id}.title`)}
                </NativeLink>
              </Heading>
              <div className="text-text/80 mt-4 flex flex-col gap-3 text-base leading-relaxed">
                <Paragraph margin="none">
                  {t(`${principle.id}.paragraph1`)}
                </Paragraph>
                <Paragraph margin="none">
                  {t(`${principle.id}.paragraph2`)}
                </Paragraph>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Container>
  );
}

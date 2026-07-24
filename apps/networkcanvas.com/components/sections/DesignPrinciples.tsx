import { useTranslations } from 'next-intl';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Heading, { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { principles } from '~/lib/content';

export function DesignPrinciples() {
  const t = useTranslations('Principles');

  return (
    <Container className="tablet-landscape:py-28 py-20">
      <div className="tablet-landscape:grid-cols-[0.85fr_1.15fr] tablet-landscape:gap-16 grid gap-12">
        <div className="tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:self-start">
          <Heading
            level="h2"
            variant="section-heading"
            margin="none"
            className="text-text"
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
              className="bg-surface/55 tablet-landscape:p-10 rounded p-8 shadow-lg backdrop-blur-md"
            >
              <NativeLink
                href={principle.href}
                target="_blank"
                rel="noreferrer"
                className={headingVariants({
                  level: 'h3',
                  variant: 'subheading',
                  margin: 'none',
                  className: 'text-text hover:text-link [--link:currentColor]',
                })}
              >
                {t(`${principle.id}.title`)}
              </NativeLink>
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

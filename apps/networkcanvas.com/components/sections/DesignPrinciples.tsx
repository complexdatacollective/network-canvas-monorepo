import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { principles } from '~/lib/content';

type PrincipleId = (typeof principles)[number]['id'];

const principleIllustrations = {
  ontologicalFlexibility:
    '/images/illustrations/design-principles/ontological-flexibility.svg',
  interviewerAssisted:
    '/images/illustrations/design-principles/interviewer-assisted.svg',
  emphasisOnDesign:
    '/images/illustrations/design-principles/emphasis-on-design.svg',
  endToEndWorkflow:
    '/images/illustrations/design-principles/end-to-end-workflow.svg',
  openSourceCommunity:
    '/images/illustrations/design-principles/open-source-community.svg',
} satisfies Record<PrincipleId, string>;

export function DesignPrinciples() {
  const t = useTranslations('Principles');

  return (
    <Container maxWidth="wide" className="">
      <div className="tablet-landscape:grid-cols-3 tablet-landscape:gap-16 grid gap-12">
        <div className="tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:col-span-1 tablet-landscape:self-start">
          <Heading level="h2" variant="section-heading" margin="none">
            {t('heading')}
          </Heading>
          <Paragraph
            margin="none"
            className="text-text/80 tablet-landscape:text-lg mt-5 text-base leading-relaxed"
          >
            {t('introduction')}
          </Paragraph>
        </div>

        <div className="tablet-landscape:col-span-2 flex flex-col gap-6">
          {principles.map((principle, i) => (
            <Reveal
              key={principle.id}
              delay={i * 0.04}
              className="group relative"
            >
              <div className="bg-surface/55 tablet-portrait:grid-cols-3 tablet-landscape:gap-10 tablet-portrait:p-8 tablet-landscape:p-10 grid items-center gap-6 rounded p-6 shadow-lg backdrop-blur-md transition-[transform,box-shadow] duration-300 ease-out group-focus-within:-translate-y-1 group-focus-within:shadow-xl group-hover:-translate-y-1 group-hover:shadow-xl motion-reduce:transform-none">
                <div className="tablet-portrait:col-span-1 flex aspect-4/3 items-center justify-center">
                  <Image
                    src={principleIllustrations[principle.id]}
                    alt=""
                    width={320}
                    height={240}
                    className="size-full object-contain"
                  />
                </div>
                <div className="tablet-portrait:col-span-2 max-w-4xl">
                  <Heading level="h3" variant="subheading" margin="none">
                    {t(`${principle.id}.title`)}
                  </Heading>
                  <div className="text-text/80 mt-4 flex flex-col gap-3 text-base leading-relaxed">
                    <Paragraph margin="none">
                      {t(`${principle.id}.paragraph1`)}
                    </Paragraph>
                    <Paragraph margin="none">
                      {t(`${principle.id}.paragraph2`)}
                    </Paragraph>
                  </div>
                </div>
              </div>
              <NativeLink
                href={principle.href}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0 rounded"
              >
                <span className="sr-only">{t(`${principle.id}.title`)}</span>
              </NativeLink>
            </Reveal>
          ))}
        </div>
      </div>
    </Container>
  );
}

'use client';

import { ExternalLink } from 'lucide-react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Fragment, type ReactNode, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Definition from '@codaco/fresco-ui/Definition';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import { Footer } from '~/components/layout/Footer';
import { Reveal } from '~/components/ui/Reveal';
import { cn } from '~/lib/cn';

import { ActionButton } from './ActionButton';
import { BenefitCard } from './BenefitCard';
import { BulletList } from './BulletList';
import { DestinationCard } from './DestinationCard';
import { FeatureCard } from './FeatureCard';
import { InterfaceGraphic } from './InterfaceGraphic';
import { LaunchHero } from './LaunchHero';
import { ProtocolMigrationIllustration } from './ProtocolMigrationIllustration';
import { ScreenshotFrame } from './ScreenshotFrame';
import { ScrollSignalProgress } from './ScrollSignalProgress';
import { Section } from './Section';
import { SectionLabel } from './SectionLabel';
import { StatusChip } from './StatusChip';
import {
  type FeatureGroup,
  useSummerUpdateContent,
} from './summerUpdateContent';
import { summerUpdateRevealMotion } from './summerUpdateMotion';

function renderDefinitionName(chunks: ReactNode) {
  return <dfn>{chunks}</dfn>;
}

function renderStrong(chunks: ReactNode) {
  return <strong>{chunks}</strong>;
}

function ProgressiveWebAppTerm({
  asAbbreviation,
  children,
}: {
  asAbbreviation?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('SummerUpdate');

  return (
    <Definition
      asAbbreviation={asAbbreviation}
      definition={t.rich('definitions.pwa', {
        dfn: renderDefinitionName,
      })}
    >
      {children}
    </Definition>
  );
}

function renderProgressiveWebApp(chunks: ReactNode) {
  return <ProgressiveWebAppTerm>{chunks}</ProgressiveWebAppTerm>;
}

function renderProgressiveWebAppAbbreviation(chunks: ReactNode) {
  return <ProgressiveWebAppTerm asAbbreviation>{chunks}</ProgressiveWebAppTerm>;
}

function ProtocolSchemaTerm({ children }: { children: ReactNode }) {
  const t = useTranslations('SummerUpdate');

  return (
    <Definition definition={t('definitions.protocolSchema')}>
      {children}
    </Definition>
  );
}

function renderProtocolSchema(chunks: ReactNode) {
  return <ProtocolSchemaTerm>{chunks}</ProtocolSchemaTerm>;
}

function renderArchitectLink(chunks: ReactNode) {
  return (
    <NativeLink href="https://architect.networkcanvas.com/" target="_blank">
      {chunks}
    </NativeLink>
  );
}

function renderInterviewerExternalLink(chunks: ReactNode) {
  return (
    <NativeLink href="https://interviewer.networkcanvas.com/" target="_blank">
      {chunks}
    </NativeLink>
  );
}

function renderInterviewerLink(chunks: ReactNode) {
  return (
    <NativeLink href="https://interviewer.networkcanvas.com/">
      {chunks}
    </NativeLink>
  );
}

function renderProtocolFile(chunks: ReactNode) {
  return (
    <span className="bg-mustard font-monospace text-rich-black rounded-xs px-2 py-1 text-xs font-bold">
      {chunks}
    </span>
  );
}

function renderCommunityLink(chunks: ReactNode) {
  return (
    <NativeLink
      className="[--link:var(--color-sea-serpent)]"
      href="https://community.networkcanvas.com/"
    >
      {chunks}
    </NativeLink>
  );
}

export function SummerUpdatePage() {
  const t = useTranslations('SummerUpdate');
  const { compatibilityRows, destinationLinks, interfaceFeatures } =
    useSummerUpdateContent();
  const featureGroupHeadings: Record<FeatureGroup, string> = {
    interfaces: t('features.groups.interfaces'),
    schema: t('features.groups.schema'),
    architect: t('features.groups.architect'),
    interviewer: t('features.groups.interviewer'),
    fresco: t('features.groups.fresco'),
  };
  const shouldReduceMotion = useReducedMotion();
  const [selectedInterface, setSelectedInterface] = useState(0);
  const [selectedCompatibilityRow, setSelectedCompatibilityRow] = useState<
    number | null
  >(null);

  const activeInterface =
    interfaceFeatures[selectedInterface] ?? interfaceFeatures[0];
  const selectedCompatibility =
    selectedCompatibilityRow === null
      ? undefined
      : compatibilityRows[selectedCompatibilityRow];
  const compatibilityNote =
    selectedCompatibility?.note ?? t('compatibility.defaultNote');
  if (!activeInterface) return null;

  return (
    <>
      <main className="selection:bg-mustard selection:text-rich-black [counter-reset:section_subsection]">
        <ScrollSignalProgress />
        <LaunchHero />

        <Section aria-labelledby="whats-new-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>{t('overview.label')}</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="whats-new-title"
              >
                {t('overview.heading')}
              </Heading>
              <Paragraph intent="lead" className="max-w-3xl">
                {t.rich('overview.introduction', {
                  pwa: renderProgressiveWebApp,
                  strong: renderStrong,
                })}
              </Paragraph>
            </Reveal>
          </div>
          <div className="tablet-portrait:grid-cols-2 desktop:grid-cols-4 mx-auto my-12 grid max-w-380 grid-cols-1 gap-6">
            <BenefitCard
              title={t('overview.benefits.lowFriction.title')}
              icon="green"
              delay={0}
            >
              {t.rich('overview.benefits.lowFriction.description', {
                architect: renderArchitectLink,
                interviewer: renderInterviewerExternalLink,
              })}
            </BenefitCard>
            <BenefitCard
              title={t('overview.benefits.installation.title')}
              icon="blue"
              delay={0.11}
            >
              {t('overview.benefits.installation.description')}
            </BenefitCard>
            <BenefitCard
              title={t('overview.benefits.updates.title')}
              icon="cyan"
              delay={0.22}
            >
              {t('overview.benefits.updates.description')}
            </BenefitCard>
            <BenefitCard
              title={t('overview.benefits.tablet.title')}
              icon="coral"
              delay={0.33}
            >
              {t('overview.benefits.tablet.description')}
            </BenefitCard>
          </div>

          <Reveal {...summerUpdateRevealMotion}>
            <Alert variant="info" className="mx-auto my-12! max-w-4xl p-8">
              <AlertTitle>{t('overview.classic.title')}</AlertTitle>
              <AlertDescription>
                {t.rich('overview.classic.description', {
                  strong: renderStrong,
                })}
              </AlertDescription>
            </Alert>
          </Reveal>

          <div className="tablet-portrait:space-y-32 mx-auto max-w-6xl space-y-24">
            <div className="tablet-portrait:grid-cols-2 tablet-portrait:gap-14 grid grid-cols-1 items-center gap-10">
              <Reveal {...summerUpdateRevealMotion} direction="left">
                <SectionLabel
                  subSection
                  Icon={
                    <Image
                      src="/images/summer-2026/architect-icon.png"
                      alt={t('apps.architect.iconAlt')}
                      width={54}
                      height={54}
                      className="rounded-sm"
                    />
                  }
                >
                  {t('apps.architect.label')}
                </SectionLabel>
                <Heading level="h3" variant="subheading">
                  {t('apps.architect.heading')}
                </Heading>
                <Paragraph className="">
                  {t.rich('apps.architect.description', {
                    link: renderArchitectLink,
                    pwa: renderProgressiveWebAppAbbreviation,
                  })}
                </Paragraph>
                <BulletList
                  items={[
                    {
                      color: 'neon-coral',
                      content: (
                        <>
                          {t.rich('apps.architect.bullets.schema8', {
                            strong: renderStrong,
                          })}
                        </>
                      ),
                    },
                    {
                      color: 'sea-serpent',
                      content: (
                        <>
                          {t.rich('apps.architect.bullets.upgrades', {
                            strong: renderStrong,
                          })}
                        </>
                      ),
                    },
                    {
                      color: 'neon-carrot',
                      content: (
                        <>
                          {t.rich('apps.architect.bullets.templates', {
                            strong: renderStrong,
                          })}
                        </>
                      ),
                    },
                  ]}
                />
                <div className="mt-8 flex flex-wrap gap-4">
                  <ActionButton
                    compact
                    href="https://architect.networkcanvas.com/"
                    target="_blank"
                  >
                    {t('apps.architect.open')}
                  </ActionButton>
                  <ActionButton
                    compact
                    href="https://documentation.networkcanvas.com/en/design-protocols/getting-started"
                    secondary
                  >
                    {t('common.documentation')}
                  </ActionButton>
                </div>
                <Paragraph
                  intent="smallText"
                  emphasis="muted"
                  className="mt-6 text-current/55"
                >
                  {t('apps.architect.classicNote')}
                </Paragraph>
              </Reveal>

              <Reveal {...summerUpdateRevealMotion} direction="right">
                <ScreenshotFrame
                  address="architect.networkcanvas.com"
                  alt={t('apps.architect.screenshotAlt')}
                  aspectRatio="4:3"
                  src="/images/screenshots/architect.png"
                />
              </Reveal>
            </div>

            <div className="tablet-portrait:grid-cols-2 tablet-portrait:gap-14 grid grid-cols-1 items-center gap-10">
              <Reveal
                {...summerUpdateRevealMotion}
                direction="right"
                className="tablet-portrait:order-2"
              >
                <SectionLabel
                  subSection
                  Icon={
                    <Image
                      src="/images/summer-2026/interviewer-icon.svg"
                      alt={t('apps.interviewer.iconAlt')}
                      width={54}
                      height={54}
                      className="rounded-sm"
                    />
                  }
                >
                  {t('apps.interviewer.label')}
                </SectionLabel>
                <Heading level="h3" variant="subheading">
                  {t('apps.interviewer.heading')}
                </Heading>
                <Paragraph className="">
                  {t.rich('apps.interviewer.description', {
                    link: renderInterviewerLink,
                    pwa: renderProgressiveWebAppAbbreviation,
                  })}
                </Paragraph>
                <BulletList
                  items={[
                    {
                      color: 'kiwi',
                      content: t('apps.interviewer.bullets.security'),
                    },
                    {
                      color: 'cerulean-blue',
                      content: (
                        <>
                          {t.rich('apps.interviewer.bullets.schema8', {
                            strong: renderStrong,
                          })}
                        </>
                      ),
                    },
                    {
                      color: 'paradise-pink',
                      content: t('apps.interviewer.bullets.compatibility'),
                    },
                  ]}
                />
                <div className="mt-8 flex flex-wrap gap-4">
                  <ActionButton
                    compact
                    href="https://interviewer.networkcanvas.com/"
                    target="_blank"
                  >
                    {t('apps.interviewer.open')}
                  </ActionButton>
                  <ActionButton
                    compact
                    href="https://documentation.networkcanvas.com/en/collect-data/interviewer/using-interviewer"
                    secondary
                  >
                    {t('common.documentation')}
                  </ActionButton>
                </div>
                <Paragraph
                  intent="smallText"
                  emphasis="muted"
                  className="mt-6 text-current/55"
                >
                  {t('apps.interviewer.classicNote')}
                </Paragraph>
              </Reveal>

              <Reveal
                {...summerUpdateRevealMotion}
                direction="left"
                className="tablet-portrait:order-1"
              >
                <ScreenshotFrame
                  address="interviewer.networkcanvas.com"
                  alt={t('apps.interviewer.screenshotAlt')}
                  src="/images/screenshots/interviewer.png"
                />
              </Reveal>
            </div>

            <div className="tablet-portrait:grid-cols-2 tablet-portrait:gap-14 grid grid-cols-1 items-center gap-10">
              <Reveal {...summerUpdateRevealMotion} direction="left">
                <SectionLabel
                  subSection
                  Icon={
                    <Image
                      src="/images/summer-2026/fresco-icon.png"
                      alt={t('apps.fresco.iconAlt')}
                      width={54}
                      height={54}
                      className="rounded-sm"
                    />
                  }
                >
                  {t('apps.fresco.label')}
                </SectionLabel>
                <Heading level="h3" variant="subheading">
                  {t('apps.fresco.heading')}
                </Heading>
                <Paragraph className="">
                  {t('apps.fresco.description')}
                </Paragraph>
                <div className="mt-8 flex flex-wrap gap-4">
                  <ActionButton
                    compact
                    href="https://documentation.networkcanvas.com/en/collect-data/fresco/guide"
                  >
                    {t('apps.fresco.deploymentGuide')}
                  </ActionButton>
                  <ActionButton
                    compact
                    href="https://documentation.networkcanvas.com/en/collect-data/fresco/using-fresco"
                    secondary
                  >
                    {t('common.documentation')}
                  </ActionButton>
                </div>
                <Paragraph
                  intent="smallText"
                  emphasis="muted"
                  className="mt-6 text-current/55"
                >
                  {t('apps.fresco.upgradeNote')}
                </Paragraph>
              </Reveal>

              <div className="space-y-4">
                <FeatureCard
                  title={t('apps.fresco.cards.multiUser.title')}
                  color="neon-coral"
                  delay={0}
                >
                  {t('apps.fresco.cards.multiUser.description')}
                </FeatureCard>
                <FeatureCard
                  title={t('apps.fresco.cards.api.title')}
                  color="sea-serpent"
                  delay={0.11}
                >
                  {t('apps.fresco.cards.api.description')}
                </FeatureCard>
                <FeatureCard
                  title={t('apps.fresco.cards.selfHosted.title')}
                  color="mustard"
                  delay={0.22}
                >
                  {t('apps.fresco.cards.selfHosted.description')}
                </FeatureCard>
              </div>
            </div>
          </div>
        </Section>
        <Section aria-labelledby="schema-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>{t('features.label')}</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="schema-title"
              >
                {t('features.heading')}
              </Heading>
              <Paragraph
                intent="lead"
                emphasis="muted"
                className="max-w-3xl text-current/70"
              >
                {t.rich('features.introduction', {
                  definition: renderProtocolSchema,
                })}
              </Paragraph>
            </Reveal>
          </div>

          <LayoutGroup id="schema-feature-explorer">
            <div className="tablet-landscape:grid-cols-5 mx-auto mt-12 grid max-w-380 items-start gap-8">
              <div className="tablet-portrait:grid-cols-3 tablet-landscape:col-span-3 relative grid grid-cols-2 gap-4">
                {interfaceFeatures.map((feature, index) => {
                  const isSelected = selectedInterface === index;
                  const startsGroup =
                    interfaceFeatures[index - 1]?.group !== feature.group;

                  return (
                    <Fragment key={feature.shortName}>
                      {startsGroup ? (
                        <Reveal
                          {...summerUpdateRevealMotion}
                          className={cn('col-span-full', index > 0 && 'mt-8')}
                        >
                          <Heading
                            level="h3"
                            variant="subheading"
                            margin="none"
                          >
                            {featureGroupHeadings[feature.group]}
                          </Heading>
                        </Reveal>
                      ) : null}
                      <Reveal
                        {...summerUpdateRevealMotion}
                        delay={(index % 3) * 0.08}
                        className="h-full"
                      >
                        <motion.div
                          layout={!shouldReduceMotion}
                          className="relative h-full"
                          transition={{
                            duration: shouldReduceMotion ? 0 : undefined,
                            type: shouldReduceMotion ? 'tween' : 'spring',
                            stiffness: shouldReduceMotion ? undefined : 340,
                            damping: shouldReduceMotion ? undefined : 32,
                          }}
                        >
                          <Surface
                            as="button"
                            type="button"
                            noContainer
                            aria-pressed={isSelected}
                            className={cn(
                              'focusable not-aria-pressed:hover:text-selected-contrast flex size-full cursor-pointer flex-col items-center justify-center overflow-hidden text-center transition not-aria-pressed:hover:bg-[color-mix(in_oklab,var(--color-selected)_50%,var(--color-surface))]',
                              'hover:elevation-high not-aria-pressed:hover:-translate-y-1',
                              'aria-pressed:inset-surface aria-pressed:bg-selected aria-pressed:text-selected-contrast border backdrop-blur-2xl',
                            )}
                            onClick={() => setSelectedInterface(index)}
                          >
                            {isSelected ? (
                              <motion.span
                                layoutId={
                                  shouldReduceMotion
                                    ? undefined
                                    : 'active-schema-feature'
                                }
                                aria-hidden
                                className="pointer-events-none absolute inset-0"
                                transition={{
                                  duration: shouldReduceMotion ? 0 : undefined,
                                  type: shouldReduceMotion ? 'tween' : 'spring',
                                  stiffness: shouldReduceMotion
                                    ? undefined
                                    : 420,
                                  damping: shouldReduceMotion ? undefined : 34,
                                }}
                              />
                            ) : null}
                            <motion.span
                              className="flex flex-col items-center justify-center gap-3"
                              animate={
                                shouldReduceMotion
                                  ? undefined
                                  : isSelected
                                    ? {
                                        scale: 0.985,
                                        y: -2,
                                      }
                                    : { scale: 1, y: 0 }
                              }
                              transition={{
                                type: 'spring',
                                stiffness: 420,
                                damping: 30,
                              }}
                            >
                              <InterfaceGraphic motif={feature.motif} />
                              <span className="text-sm leading-snug font-bold">
                                {feature.shortName}
                              </span>
                            </motion.span>
                          </Surface>
                        </motion.div>
                      </Reveal>
                    </Fragment>
                  );
                })}
              </div>

              <Reveal
                {...summerUpdateRevealMotion}
                className="tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:col-span-2"
              >
                <Surface aria-live="polite" className="overflow-hidden">
                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={activeInterface.shortName}
                      initial={
                        shouldReduceMotion
                          ? false
                          : {
                              clipPath: 'inset(0 0 100% 0)',
                              opacity: 0,
                              y: 18,
                            }
                      }
                      animate={{
                        clipPath: 'inset(0 0 0% 0)',
                        opacity: 1,
                        y: 0,
                      }}
                      exit={
                        shouldReduceMotion
                          ? undefined
                          : {
                              clipPath: 'inset(0 0 0 100%)',
                              opacity: 0,
                              y: -10,
                            }
                      }
                      transition={{
                        type: 'spring',
                        stiffness: 260,
                        damping: 30,
                      }}
                    >
                      <Heading level="h3" variant="subheading">
                        {activeInterface.name}
                      </Heading>
                      <Paragraph emphasis="muted" className="text-current/70">
                        {activeInterface.summary}
                      </Paragraph>
                      <ul className="mt-5 space-y-3">
                        {activeInterface.details.map((detail, index) => (
                          <motion.li
                            className="flex items-start gap-3"
                            key={detail}
                            initial={
                              shouldReduceMotion ? false : { opacity: 0, x: 14 }
                            }
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              type: 'spring',
                              stiffness: 300,
                              damping: 28,
                              delay: shouldReduceMotion ? 0 : index * 0.055,
                            }}
                          >
                            <span
                              aria-hidden
                              className="bg-sea-serpent mt-2 size-2 shrink-0 rounded-full"
                            />
                            <Paragraph
                              intent="smallText"
                              emphasis="muted"
                              margin="none"
                              className="text-current/70"
                            >
                              {detail}
                            </Paragraph>
                          </motion.li>
                        ))}
                      </ul>
                      <NativeLink
                        className="mt-6 inline-block [--link:var(--color-sea-serpent)]"
                        href={activeInterface.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('features.documentationLink')}{' '}
                        <ExternalLink
                          aria-hidden
                          className="inline-block size-4"
                        />
                      </NativeLink>
                      {'screenshotType' in activeInterface ? (
                        <div className="mt-6 aspect-video overflow-hidden rounded">
                          <InterfacePicture
                            type={activeInterface.screenshotType}
                            ratio="16:9"
                            sizes="(min-width: 64rem) 30vw, 100vw"
                            alt={t('features.previewAlt', {
                              name: activeInterface.name,
                            })}
                            className="size-full object-cover"
                          />
                        </div>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </Surface>
              </Reveal>
            </div>
          </LayoutGroup>
        </Section>

        <Section aria-labelledby="compatibility-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>{t('compatibility.label')}</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="compatibility-title"
              >
                {t('compatibility.heading')}
              </Heading>
              <Paragraph intent="lead" className="max-w-3xl">
                {t.rich('compatibility.introduction', {
                  definition: renderProtocolSchema,
                  strong: renderStrong,
                })}
              </Paragraph>
            </Reveal>

            <Reveal {...summerUpdateRevealMotion} direction="zoom">
              <div className="effect-shadow border-text/15 bg-surface my-12 overflow-hidden rounded border">
                <div className="overflow-x-auto">
                  <div className="min-w-4xl">
                    <div
                      className="border-text/15 bg-surface-2 font-monospace text-surface-2-contrast grid grid-cols-4 gap-4 border-b px-6 py-4 text-xs font-bold tracking-widest uppercase"
                      aria-hidden
                    >
                      <span>{t('compatibility.columns.app')}</span>
                      <span>{t('compatibility.columns.platform')}</span>
                      <span>{t('compatibility.columns.schema7')}</span>
                      <span>{t('compatibility.columns.schema8')}</span>
                    </div>
                    {compatibilityRows.map((row, index) => {
                      const previousGroup = compatibilityRows[index - 1]?.group;
                      return (
                        <div key={`${row.app}-${row.version ?? 'current'}`}>
                          {row.group !== previousGroup ? (
                            <div
                              className={cn(
                                'bg-surface-2/50 font-monospace text-surface-2-contrast/55 px-6 py-2 text-xs font-bold tracking-widest uppercase',
                                index > 0 && 'border-text/15 border-t',
                              )}
                            >
                              {row.group}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            aria-label={t(
                              row.version
                                ? 'compatibility.rowAccessibleNameWithVersion'
                                : 'compatibility.rowAccessibleName',
                              {
                                app: row.app,
                                platform: row.platform,
                                schema7: t(
                                  `compatibility.statuses.${row.schema7}`,
                                ),
                                schema8: t(
                                  `compatibility.statuses.${row.schema8}`,
                                ),
                                version: row.version ?? '',
                              },
                            )}
                            aria-pressed={selectedCompatibilityRow === index}
                            className="focusable border-text/10 hover:bg-text/5 aria-pressed:bg-sea-serpent/10 grid w-full grid-cols-4 items-center gap-4 border-t px-6 py-4 text-left transition first:border-t-0"
                            onClick={() => setSelectedCompatibilityRow(index)}
                          >
                            <span className="text-text font-bold">
                              {row.app}{' '}
                              {row.version ? (
                                <span className="font-monospace text-xs font-normal text-current/50">
                                  {row.version}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-sm text-current/65">
                              {row.platform}
                            </span>
                            <StatusChip status={row.schema7} />
                            <StatusChip status={row.schema8} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div
                  className="border-text/15 bg-sea-serpent/10 border-t px-6 py-4 text-sm text-current/75"
                  aria-live="polite"
                >
                  {compatibilityNote}
                </div>
              </div>
            </Reveal>
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel subSection>
                {t('compatibility.caution.label')}
              </SectionLabel>
              <Heading
                level="h2"
                margin="none"
                className="sr-only"
                id="upgrade-title"
              >
                {t('compatibility.caution.label')}
              </Heading>
            </Reveal>
            <Reveal {...summerUpdateRevealMotion} direction="zoom">
              <Surface
                spacing="lg"
                className="tablet-portrait:grid-cols-2 my-12 grid grid-cols-1 items-center gap-10"
              >
                <div>
                  <Heading level="h3" variant="subheading">
                    {t('compatibility.caution.heading')}
                  </Heading>
                  <Paragraph>
                    {t('compatibility.caution.description')}
                  </Paragraph>
                  <Paragraph className="border-mustard/35 bg-mustard/10 rounded-sm border p-4">
                    {t.rich('compatibility.caution.fileNote', {
                      file: renderProtocolFile,
                    })}
                  </Paragraph>
                </div>
                <ProtocolMigrationIllustration className="mx-auto max-w-xl" />
              </Surface>
            </Reveal>
          </div>
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel subSection>
                {t('compatibility.upgrade.label')}
              </SectionLabel>
              <Heading
                level="h2"
                margin="none"
                className="sr-only"
                id="upgrade-recommendation-title"
              >
                {t('compatibility.upgrade.heading')}
              </Heading>
            </Reveal>
            <div className="tablet-portrait:grid-cols-2 mt-8 grid grid-cols-1 gap-6">
              <Reveal {...summerUpdateRevealMotion}>
                <Surface as="article" noContainer className="h-full">
                  <span className="bg-sea-green/15 font-monospace text-sea-green inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    {t('compatibility.upgrade.newStudy.label')}
                  </span>
                  <Heading level="h3" variant="subheading">
                    {t('compatibility.upgrade.newStudy.heading')}
                  </Heading>
                  <Paragraph className="">
                    {t.rich('compatibility.upgrade.newStudy.description', {
                      strong: renderStrong,
                    })}
                  </Paragraph>
                </Surface>
              </Reveal>
              <Reveal {...summerUpdateRevealMotion} delay={0.11}>
                <Surface as="article" noContainer className="h-full">
                  <span className="bg-sea-serpent/15 font-monospace text-sea-serpent inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    {t('compatibility.upgrade.ongoing.label')}
                  </span>
                  <Heading level="h3" variant="subheading">
                    {t('compatibility.upgrade.ongoing.heading')}
                  </Heading>
                  <Paragraph className="">
                    {t('compatibility.upgrade.ongoing.description')}
                  </Paragraph>
                </Surface>
              </Reveal>
            </div>
          </div>
        </Section>

        <Section aria-labelledby="resources-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>{t('resources.label')}</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="resources-title"
              >
                {t('resources.heading')}
              </Heading>
              <Paragraph intent="lead" className="max-w-3xl">
                {t('resources.introduction')}
              </Paragraph>
            </Reveal>
            <div className="mt-12 grid grid-cols-1 gap-20">
              <Reveal {...summerUpdateRevealMotion} direction="left">
                <article className="tablet-portrait:grid-cols-5 grid grid-cols-1 items-center gap-8">
                  <div className="tablet-portrait:col-span-2 min-w-0">
                    <ScreenshotFrame
                      address="documentation.networkcanvas.com"
                      alt={t('resources.documentation.screenshotAlt')}
                      src="/images/screenshots/documentation-homepage.png"
                    />
                  </div>
                  <div className="tablet-portrait:col-span-3 max-w-4xl min-w-0">
                    <SectionLabel subSection>
                      {t('resources.documentation.label')}
                    </SectionLabel>
                    <Heading level="h3" variant="subheading" className="mt-2!">
                      {t('resources.documentation.heading')}
                    </Heading>
                    <Paragraph>
                      {t('resources.documentation.description')}
                    </Paragraph>
                    <NativeLink href="https://documentation.networkcanvas.com/en">
                      {t('resources.documentation.link')}{' '}
                      <ExternalLink
                        aria-hidden
                        className="inline-block size-4"
                      />
                    </NativeLink>
                  </div>
                </article>
              </Reveal>
              <Reveal
                {...summerUpdateRevealMotion}
                direction="right"
                delay={0.11}
              >
                <article className="tablet-portrait:grid-cols-5 grid grid-cols-1 items-center gap-8">
                  <div className="tablet-portrait:col-span-3 max-w-4xl min-w-0">
                    <SectionLabel subSection>
                      {t('resources.website.label')}
                    </SectionLabel>
                    <Heading level="h3" variant="subheading" className="mt-2!">
                      {t('resources.website.heading')}
                    </Heading>
                    <Paragraph>{t('resources.website.description')}</Paragraph>
                    <NativeLink href="https://networkcanvas.com/">
                      {t('resources.website.link')}{' '}
                      <ExternalLink
                        aria-hidden
                        className="inline-block size-4"
                      />
                    </NativeLink>
                  </div>
                  <div className="tablet-portrait:col-span-2 min-w-0">
                    <ScreenshotFrame
                      address="networkcanvas.com"
                      alt={t('resources.website.screenshotAlt')}
                      src="/images/screenshots/website-homepage.png"
                    />
                  </div>
                </article>
              </Reveal>
            </div>
          </div>
        </Section>

        <Section aria-labelledby="getting-started-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>{t('destinations.label')}</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="getting-started-title"
              >
                {t('destinations.heading')}
              </Heading>
            </Reveal>
            <div className="tablet-portrait:grid-cols-2 relative mt-12 grid grid-cols-1 gap-5">
              {destinationLinks.map((destination, index) => (
                <Reveal
                  {...summerUpdateRevealMotion}
                  delay={index * 0.11}
                  direction={index % 2 === 0 ? 'left' : 'right'}
                  className="h-full"
                  key={destination.title}
                >
                  <DestinationCard destination={destination} index={index} />
                </Reveal>
              ))}
            </div>
            <Reveal {...summerUpdateRevealMotion}>
              <Paragraph className="mt-12 max-w-6xl">
                {t.rich('destinations.closing', {
                  community: renderCommunityLink,
                })}
              </Paragraph>
            </Reveal>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}

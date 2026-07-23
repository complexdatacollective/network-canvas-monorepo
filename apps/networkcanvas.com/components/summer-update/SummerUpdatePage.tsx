'use client';

import { ExternalLink } from 'lucide-react';
import { motion, useReducedMotion, useScroll } from 'motion/react';
import Image from 'next/image';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import Definition from '@codaco/fresco-ui/Definition';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { Reveal } from '~/components/ui/Reveal';
import { cn } from '~/lib/cn';

import { HomepagePageBackground } from '../ui/HomepagePageBackground';
import { ActionButton } from './ActionButton';
import { BenefitCard } from './BenefitCard';
import { BulletList } from './BulletList';
import { DestinationCard } from './DestinationCard';
import { FeatureCard } from './FeatureCard';
import { HeroEntrance } from './HeroEntrance';
import { InterfaceGraphic } from './InterfaceGraphic';
import { ProtocolMigrationIllustration } from './ProtocolMigrationIllustration';
import { ScreenshotFrame } from './ScreenshotFrame';
import { Section } from './Section';
import { SectionLabel } from './SectionLabel';
import { StatusChip } from './StatusChip';
import {
  compatibilityRows,
  destinationLinks,
  interfaceFeatures,
} from './summerUpdateContent';
import { summerUpdateRevealMotion } from './summerUpdateMotion';

const heroTextGlowClasses =
  'bg-[conic-gradient(from_var(--text-glow-angle),var(--color-neon-coral),var(--color-sea-serpent),var(--color-mustard),var(--color-sea-green),var(--color-neon-coral))] bg-clip-text';

export function SummerUpdatePage() {
  const shouldReduceMotion = useReducedMotion();
  const [selectedInterface, setSelectedInterface] = useState(0);
  const [selectedCompatibilityRow, setSelectedCompatibilityRow] = useState<
    number | null
  >(null);
  const { scrollYProgress } = useScroll();

  const activeInterface =
    interfaceFeatures[selectedInterface] ?? interfaceFeatures[0];
  const selectedCompatibility =
    selectedCompatibilityRow === null
      ? undefined
      : compatibilityRows[selectedCompatibilityRow];
  const compatibilityNote =
    selectedCompatibility?.note ??
    'Select any row above to see what it means for your protocol files.';

  return (
    <>
      <main className="selection:bg-mustard selection:text-rich-black [counter-reset:section_subsection]">
        <motion.div
          aria-hidden
          className="from-neon-coral via-mustard to-sea-green fixed inset-x-0 top-0 z-50 h-1 w-full origin-left rounded-r-full bg-linear-to-r"
          style={{ scaleX: scrollYProgress }}
        />

        <Section
          className="m-0! flex min-h-svh flex-col overflow-hidden px-0!"
          aria-labelledby="summer-update-title"
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <HomepagePageBackground />
          </div>
          <HeroEntrance delay={0.05} direction="down">
            <Header className="relative z-20" containerClassName="py-6!" />
          </HeroEntrance>

          <div className="tablet-portrait:pt-24 tablet-portrait:pb-48 relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-6 pt-16 pb-40 text-center">
            <HeroEntrance delay={0.32}>
              <Heading
                level="h1"
                variant="display-heading"
                id="summer-update-title"
              >
                Introducing the next generation of{' '}
                <span
                  data-homepage-weave-target
                  className={cn(
                    heroTextGlowClasses,
                    'overflow-visible px-2 whitespace-nowrap text-white',
                  )}
                  style={{
                    WebkitTextFillColor: 'var(--color-white)',
                    WebkitTextStroke:
                      'var(--text-glow-stroke-width) transparent',
                    paintOrder: 'stroke fill',
                    animation: shouldReduceMotion
                      ? undefined
                      : 'var(--animate-text-glow)',
                  }}
                >
                  Network Canvas
                </span>{' '}
                apps
              </Heading>
            </HeroEntrance>
            <HeroEntrance delay={0.62}>
              <Paragraph
                intent="lead"
                className="tablet-landscape:text-xl text-center text-lg leading-relaxed"
              >
                A leap forward in designing, running, and managing Network
                Canvas interviews. This page covers what's{' '}
                <strong>changing</strong>, what's <strong>new</strong>, and what
                it <strong>means</strong> for your work.
              </Paragraph>
            </HeroEntrance>
          </div>

          <HeroEntrance
            delay={1.1}
            className="font-monospace absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 text-xs tracking-widest text-current/55 uppercase"
          >
            <span>Keep scrolling to learn more</span>
            <span
              className="border-text/40 flex h-8 w-5 justify-center rounded-full border pt-2"
              aria-hidden
            >
              <span className="bg-text/70 size-1 rounded-full motion-safe:animate-bounce" />
            </span>
          </HeroEntrance>
        </Section>

        <Section aria-labelledby="whats-new-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>What’s new</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="whats-new-title"
              >
                Architect and Interviewer, reimagined for the browser
              </Heading>
              <Paragraph intent="lead" className="max-w-3xl">
                We have redesigned <strong>Architect</strong> and{' '}
                <strong>Interviewer</strong> as websites that can also be
                installed as{' '}
                <Definition
                  definition={
                    <>
                      <dfn>Progressive Web Apps</dfn> are specially crafted
                      websites that can be installed on your device and provide
                      a native app-like experience. This means they have an icon
                      you can click to open them, they have their own storage,
                      and they work offline.
                    </>
                  }
                >
                  Progressive Web Apps
                </Definition>{' '}
                on your device. Together with <strong>Fresco 4.0.0</strong>,
                they form a unified, modern platform built on a shared technical
                foundation — and all three support a new protocol file format,{' '}
                <strong>Schema 8</strong>.
              </Paragraph>
            </Reveal>
          </div>
          <div className="phone-landscape:grid-cols-2 desktop:grid-cols-4 mx-auto my-12 grid max-w-380 grid-cols-1 gap-6">
            <BenefitCard title="Low friction use" icon="green" delay={0}>
              Visit{' '}
              <NativeLink
                href="https://architect.networkcanvas.com/"
                target="_blank"
              >
                architect.networkcanvas.com
              </NativeLink>{' '}
              or{' '}
              <NativeLink
                href="https://interviewer.networkcanvas.com/"
                target="_blank"
              >
                interviewer.networkcanvas.com
              </NativeLink>{' '}
              on any device, at any time — and use the tools without installing
              anything.
            </BenefitCard>
            <BenefitCard
              title="Local app installation"
              icon="blue"
              delay={0.11}
            >
              Install either tool as an app directly from the browser. It works
              like a typical app on your device, while you remain in control of
              your data locally.
            </BenefitCard>
            <BenefitCard title="Streamlined updates" icon="cyan" delay={0.22}>
              The new apps are automatically kept up-to-date with the latest
              features and fixes, so you can focus on your research rather than
              managing software versions.
            </BenefitCard>
            <BenefitCard
              title="Tablet support restored"
              icon="coral"
              delay={0.33}
            >
              The new Interviewer app once again runs on tablet devices (iPad
              and Android) after several years of no availability due to app
              store restrictions.
            </BenefitCard>
          </div>

          <Reveal {...summerUpdateRevealMotion}>
            <Alert variant="info" className="mx-auto my-12! max-w-4xl p-8">
              <AlertTitle>
                What about the original desktop and tablet apps?
              </AlertTitle>
              <AlertDescription>
                The original desktop and tablet apps are now named{' '}
                <strong>Architect Classic</strong> and{' '}
                <strong>Interviewer Classic</strong>. They remain available for
                in-progress studies and are <strong>fully supported</strong>,
                but are in maintenance mode and will not receive new features.
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
                      alt="Architect app icon"
                      width={54}
                      height={54}
                      className="rounded-sm"
                    />
                  }
                >
                  Protocol design
                </SectionLabel>
                <Heading level="h3" variant="subheading">
                  Meet the new Architect — design protocols in the browser
                </Heading>
                <Paragraph className="">
                  There is nothing to install — just open{' '}
                  <NativeLink
                    href="https://architect.networkcanvas.com/"
                    target="_blank"
                  >
                    architect.networkcanvas.com
                  </NativeLink>{' '}
                  and start building. Architect always runs the latest version
                  automatically. Once in the website, install it to your
                  computer as a{' '}
                  <Definition
                    asAbbreviation
                    definition={
                      <>
                        <dfn>Progressive Web Apps</dfn> are specially crafted
                        websites that can be installed on your device and
                        provide a native app-like experience. This means they
                        have an icon you can click to open them, they have their
                        own storage, and they work offline.
                      </>
                    }
                  >
                    PWA
                  </Definition>{' '}
                  for a native-like experience and local control over your data.
                </Paragraph>
                <BulletList
                  items={[
                    {
                      color: 'neon-coral',
                      content: (
                        <>
                          Builds <strong>Schema 8</strong> protocols with all
                          the new features (see below)
                        </>
                      ),
                    },
                    {
                      color: 'sea-serpent',
                      content: (
                        <>
                          Opens and <strong>automatically upgrades</strong>{' '}
                          older Schema 7 protocols
                        </>
                      ),
                    },
                    {
                      color: 'neon-carrot',
                      content: (
                        <>
                          Includes <strong>protocol templates</strong>, designed
                          to help you get started quickly and avoid common
                          mistakes
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
                    Open Architect
                  </ActionButton>
                  <ActionButton
                    compact
                    href="https://documentation.networkcanvas.com/en/design-protocols/getting-started"
                    secondary
                  >
                    Documentation
                  </ActionButton>
                </div>
                <Paragraph
                  intent="smallText"
                  emphasis="muted"
                  className="mt-6 text-current/55"
                >
                  Architect Classic remains available for researchers who need
                  to keep using older versions of Interviewer (e.g. 6.6.0). It
                  is in maintenance mode — bug fixes only — and continues to
                  produce Schema 7 protocols.
                </Paragraph>
              </Reveal>

              <Reveal {...summerUpdateRevealMotion} direction="right">
                <ScreenshotFrame
                  address="architect.networkcanvas.com"
                  alt="Architect protocol editor showing the Sample Protocol timeline"
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
                      alt="Interviewer app icon"
                      width={54}
                      height={54}
                      className="rounded-sm"
                    />
                  }
                >
                  Face-to-face interviews
                </SectionLabel>
                <Heading level="h3" variant="subheading">
                  Interviewer — conduct interviews anywhere
                </Heading>
                <Paragraph className="">
                  Interviewer has also been redesigned for the browser: upload a
                  protocol at{' '}
                  <NativeLink href="https://interviewer.networkcanvas.com/">
                    interviewer.networkcanvas.com
                  </NativeLink>{' '}
                  and deploy without installing anything. Install it as a{' '}
                  <Definition
                    asAbbreviation
                    definition={
                      <>
                        <dfn>Progressive Web Apps</dfn> are specially crafted
                        websites that can be installed on your device and
                        provide a native app-like experience. This means they
                        have an icon you can click to open them, they have their
                        own storage, and they work offline.
                      </>
                    }
                  >
                    PWA
                  </Definition>{' '}
                  to support offline workflows — it remains the ideal tool for
                  in-person, interviewer-assisted network studies.
                </Paragraph>
                <BulletList
                  items={[
                    {
                      color: 'kiwi',
                      content:
                        'New advanced security: encrypted data storage, and app authorization for sensitive actions such as exporting data',
                    },
                    {
                      color: 'cerulean-blue',
                      content: (
                        <>
                          Supports <strong>Schema 8</strong> natively, and
                          migrates all existing Schema 7 protocols automatically
                          when you import them
                        </>
                      ),
                    },
                    {
                      color: 'paradise-pink',
                      content:
                        'Compatible with all desktop and tablet devices, including iPads and Android tablets',
                    },
                  ]}
                />
                <div className="mt-8 flex flex-wrap gap-4">
                  <ActionButton
                    compact
                    href="https://interviewer.networkcanvas.com/"
                    target="_blank"
                  >
                    Open Interviewer
                  </ActionButton>
                  <ActionButton
                    compact
                    href="https://documentation.networkcanvas.com/en/collect-data/interviewer/using-interviewer"
                    secondary
                  >
                    Documentation
                  </ActionButton>
                </div>
                <Paragraph
                  intent="smallText"
                  emphasis="muted"
                  className="mt-6 text-current/55"
                >
                  Interviewer Classic remains available for in-progress studies.
                  Like Architect Classic, it is in maintenance mode only, and
                  does not benefit from new features.
                </Paragraph>
              </Reveal>

              <Reveal
                {...summerUpdateRevealMotion}
                direction="left"
                className="tablet-portrait:order-1"
              >
                <ScreenshotFrame
                  address="interviewer.networkcanvas.com"
                  alt="Interviewer dashboard showing protocol cards and a resume interview action"
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
                      alt="Fresco app icon"
                      width={54}
                      height={54}
                      className="rounded-sm"
                    />
                  }
                >
                  Remote self-administered interviews
                </SectionLabel>
                <Heading level="h3" variant="subheading">
                  Fresco 4.0.0 — a significant upgrade
                </Heading>
                <Paragraph className="">
                  The latest version of Fresco is a huge release, bringing
                  several significant new features. Designed to support remote
                  self-administered interviews (but completely compatible with
                  face-to-face interviewing too), Fresco is the suggested choice
                  for studies with large numbers of participants, a large team
                  of researchers, or that require a centralised data management
                  solution.
                </Paragraph>
                <div className="mt-8 flex flex-wrap gap-4">
                  <ActionButton
                    compact
                    href="https://documentation.networkcanvas.com/en/collect-data/fresco/guide"
                  >
                    Deployment guide
                  </ActionButton>
                  <ActionButton
                    compact
                    href="https://documentation.networkcanvas.com/en/collect-data/fresco/using-fresco"
                    secondary
                  >
                    Documentation
                  </ActionButton>
                </div>
                <Paragraph
                  intent="smallText"
                  emphasis="muted"
                  className="mt-6 text-current/55"
                >
                  Users of Fresco 3.x should avoid upgrading in the middle of a
                  study. Fresco 4.0.0 cannot be downgraded to 3.x.
                </Paragraph>
              </Reveal>

              <div className="space-y-4">
                <FeatureCard
                  title="Multi-user access"
                  color="neon-coral"
                  delay={0}
                >
                  Multi-user support – Each team member gets their own account,
                  with two-factor authentication, passkey support, and a full
                  audit log of all actions taken in the system.
                </FeatureCard>
                <FeatureCard
                  title="Two-factor authentication"
                  color="sea-serpent"
                  delay={0.11}
                >
                  Access data via a secure API – Fresco now provides a REST API
                  for programmatic access to your study data, enabling realtime
                  reporting, dashboards, and analytics.
                </FeatureCard>
                <FeatureCard
                  title="Flexible storage"
                  color="mustard"
                  delay={0.22}
                >
                  Fully deployable on your own infrastructure – Fresco can be
                  installed entirely on your own servers, or hosted in your
                  private cloud, giving you full control over your data.
                </FeatureCard>
              </div>
            </div>
          </div>
        </Section>
        <Section aria-labelledby="schema-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>Schema 8</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="schema-title"
              >
                New interfaces and features
              </Heading>
              <Paragraph
                intent="lead"
                emphasis="muted"
                className="max-w-3xl text-current/70"
              >
                This new generation of apps introduces a new{' '}
                <Definition
                  definition={
                    <>
                      Protocol Schemas are the technical specifications that
                      define how protocol files are structured and interpreted
                      by the apps. They ensure that protocols are compatible
                      across different versions of the apps and provide a
                      framework for implementing new features and interfaces.
                    </>
                  }
                >
                  protocol schema version
                </Definition>
                , Schema 8, which includes several new interview interfaces and
                features. If your study requires any of these, you’ll need to
                use the new tools. Choose any card to explore the details.
              </Paragraph>
            </Reveal>
          </div>

          <div className="tablet-landscape:grid-cols-5 mx-auto mt-12 grid max-w-380 items-start gap-8">
            <div className="tablet-portrait:grid-cols-3 tablet-landscape:col-span-3 grid grid-cols-2 gap-4">
              {interfaceFeatures.map((feature, index) => (
                <Reveal
                  {...summerUpdateRevealMotion}
                  delay={(index % 3) * 0.08}
                  key={feature.shortName}
                >
                  <Surface
                    as="button"
                    type="button"
                    noContainer
                    aria-pressed={selectedInterface === index}
                    className={cn(
                      'hover:bg-selected/50 aria-pressed:border-sea-serpent aria-pressed:bg-sea-serpent/15 flex size-full flex-col items-center justify-center gap-3 text-center transition',
                      'hover:elevation-high aria-pressed:inset-surface not-aria-pressed:hover:-translate-y-1',
                    )}
                    onClick={() => setSelectedInterface(index)}
                  >
                    <InterfaceGraphic motif={feature.motif} />
                    <div className="text-sm leading-snug font-bold">
                      {feature.shortName}
                    </div>
                  </Surface>
                </Reveal>
              ))}
            </div>

            <Reveal
              {...summerUpdateRevealMotion}
              className="tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:col-span-2"
            >
              <Surface aria-live="polite">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Heading level="h3" variant="subheading">
                    {activeInterface.name}
                  </Heading>
                  <Badge>{activeInterface.tag}</Badge>
                </div>
                <Paragraph emphasis="muted" className="text-current/70">
                  {activeInterface.summary}
                </Paragraph>
                <ul className="mt-5 space-y-3">
                  {activeInterface.details.map((detail) => (
                    <li className="flex items-start gap-3" key={detail}>
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
                    </li>
                  ))}
                </ul>
                <NativeLink
                  className="mt-6 inline-block [--link:var(--color-sea-serpent)]"
                  href={activeInterface.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore in the documentation{' '}
                  <ExternalLink className="inline-block size-4" />
                </NativeLink>
              </Surface>
            </Reveal>
          </div>
        </Section>

        <Section aria-labelledby="compatibility-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>Compatibility</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="compatibility-title"
              >
                What to know before you upgrade
              </Heading>
              <Paragraph intent="lead" className="max-w-3xl">
                <Definition
                  definition={
                    <>
                      Protocol Schemas are the technical specifications that
                      define how protocol files are structured and interpreted
                      by the apps. They ensure that protocols are compatible
                      across different versions of the apps and provide a
                      framework for implementing new features and interfaces.
                    </>
                  }
                >
                  Protocol schema version
                </Definition>{' '}
                determine which apps can open a given protocol file — and the
                most important change in this release is{' '}
                <strong>Schema 8</strong>. Below you will find a table that
                indicates exactly how every app handles both formats. Select a
                row to see details about what it means in practice.
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
                      <span>App</span>
                      <span>Platform</span>
                      <span>Schema 7</span>
                      <span>Schema 8</span>
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
                            aria-label={`${row.app}${
                              row.version ? ` ${row.version}` : ''
                            }: Schema 7 ${row.schema7}; Schema 8 ${
                              row.schema8
                            }`}
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
              <SectionLabel subSection>Caution</SectionLabel>
              <Heading
                level="h2"
                margin="none"
                className="sr-only"
                id="upgrade-title"
              >
                Caution
              </Heading>
            </Reveal>
            <Reveal {...summerUpdateRevealMotion} direction="zoom">
              <Surface
                spacing="lg"
                className="tablet-portrait:grid-cols-2 my-12 grid grid-cols-1 items-center gap-10"
              >
                <div>
                  <Heading level="h3" variant="subheading">
                    Protocol migration is one-way.
                  </Heading>
                  <Paragraph>
                    If you open a Schema 7 protocol in any new-generation app,
                    it will be automatically upgraded to Schema 8. You will not
                    be able to convert it back, or open it in the older apps
                    afterward. This is especially important if you make changes
                    to a protocol in Architect, as it will be upgraded to Schema
                    8 when you save it.
                  </Paragraph>
                  <Paragraph className="border-mustard/35 bg-mustard/10 rounded-sm border p-4">
                    Keep a copy of your original{' '}
                    <span className="bg-mustard font-monospace text-rich-black rounded-xs px-2 py-1 text-xs font-bold">
                      .netcanvas
                    </span>{' '}
                    file if you need to continue running it in Interviewer
                    Classic, Architect Classic, or Fresco 3.x.
                  </Paragraph>
                </div>
                <ProtocolMigrationIllustration className="mx-auto max-w-xl" />
              </Surface>
            </Reveal>
          </div>
          <div className="relative z-10 mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel subSection>Should you upgrade?</SectionLabel>
              <Heading
                level="h2"
                margin="none"
                className="sr-only"
                id="upgrade-title"
              >
                When should you upgrade?
              </Heading>
            </Reveal>
            <div className="tablet-portrait:grid-cols-2 mt-8 grid grid-cols-1 gap-6">
              <Reveal {...summerUpdateRevealMotion}>
                <Surface as="article" noContainer className="h-full">
                  <span className="bg-sea-green/15 font-monospace text-sea-green inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    Starting a new study?
                  </span>
                  <Heading level="h3" variant="subheading">
                    Use the new generation
                  </Heading>
                  <Paragraph className="">
                    For new studies, we recommend the new tools: use{' '}
                    <strong>Architect</strong> to design your protocol, and
                    deploy interviews with <strong>Fresco 4.0.0</strong> or{' '}
                    <strong>Interviewer</strong>, depending on your needs.
                  </Paragraph>
                </Surface>
              </Reveal>
              <Reveal {...summerUpdateRevealMotion} delay={0.11}>
                <Surface as="article" noContainer className="h-full">
                  <span className="bg-sea-serpent/15 font-monospace text-sea-serpent inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    Running an ongoing study?
                  </span>
                  <Heading level="h3" variant="subheading">
                    There is no rush!
                  </Heading>
                  <Paragraph className="">
                    Interviewer Classic and Architect Classic are still
                    supported and will continue to receive bug fixes. Upgrade at
                    a time that suits your project — just be mindful of the
                    one-way migration when you do.
                  </Paragraph>
                </Surface>
              </Reveal>
            </div>
          </div>
        </Section>

        <Section aria-labelledby="resources-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>Project resources</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="resources-title"
              >
                A clearer home for the whole Network Canvas project
              </Heading>
              <Paragraph intent="lead" className="max-w-3xl">
                The apps are not the only part of Network Canvas that has
                changed. We have also redesigned the project website and
                reorganized the documentation to make it easier to understand
                the platform, choose the right tools, and find your next step.
              </Paragraph>
            </Reveal>
            <div className="mt-12 grid grid-cols-1 gap-6">
              <Reveal {...summerUpdateRevealMotion} direction="left">
                <Surface
                  as="article"
                  noContainer
                  spacing="xl"
                  shadow="sm"
                  className="tablet-portrait:grid-cols-5 grid grid-cols-1 items-center gap-8"
                >
                  <div className="tablet-portrait:col-span-2 min-w-0">
                    <ScreenshotFrame
                      address="documentation.networkcanvas.com"
                      alt="The redesigned Network Canvas documentation homepage"
                      src="/images/screenshots/documentation-homepage.png"
                    />
                  </div>
                  <div className="tablet-portrait:col-span-3 max-w-4xl min-w-0">
                    <SectionLabel subSection>
                      Project documentation
                    </SectionLabel>
                    <Heading level="h3" variant="subheading" className="mt-2!">
                      Guidance organized around your research workflow
                    </Heading>
                    <Paragraph>
                      The documentation now starts with the work you are doing:
                      getting started, designing protocols, collecting data, and
                      analyzing results. New workflow navigation and refreshed
                      guides make the next step easier to find.
                    </Paragraph>
                    <NativeLink href="https://documentation.networkcanvas.com/">
                      Explore the documentation{' '}
                      <ExternalLink className="inline-block size-4" />
                    </NativeLink>
                  </div>
                </Surface>
              </Reveal>
              <Reveal
                {...summerUpdateRevealMotion}
                direction="right"
                delay={0.11}
              >
                <Surface
                  as="article"
                  noContainer
                  spacing="xl"
                  shadow="sm"
                  className="tablet-portrait:grid-cols-5 grid grid-cols-1 items-center gap-8"
                >
                  <div className="tablet-portrait:col-span-2 min-w-0">
                    <ScreenshotFrame
                      address="networkcanvas.com"
                      alt="The redesigned Network Canvas website homepage"
                      src="/images/screenshots/website-homepage.png"
                    />
                  </div>
                  <div className="tablet-portrait:col-span-3 max-w-4xl min-w-0">
                    <SectionLabel subSection>Project website</SectionLabel>
                    <Heading level="h3" variant="subheading" className="mt-2!">
                      A fresh new look for networkcanvas.com
                    </Heading>
                    <Paragraph>
                      The redesigned website introduces a more expressive visual
                      identity and clearer paths through the Network Canvas
                      ecosystem, from learning what the platform can do to
                      choosing the best tools for your study.
                    </Paragraph>
                    <NativeLink href="https://networkcanvas.com/">
                      Explore the new website{' '}
                      <ExternalLink className="inline-block size-4" />
                    </NativeLink>
                  </div>
                </Surface>
              </Reveal>
            </div>
          </div>
        </Section>

        <Section aria-labelledby="getting-started-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...summerUpdateRevealMotion}>
              <SectionLabel>Getting started</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-text mt-2!"
                id="getting-started-title"
              >
                Start exploring the new generation
              </Heading>
            </Reveal>
            <div className="tablet-portrait:grid-cols-2 mt-12 grid grid-cols-1 gap-5">
              {destinationLinks.map((destination, index) => (
                <Reveal
                  {...summerUpdateRevealMotion}
                  delay={index * 0.11}
                  key={destination.title}
                >
                  <DestinationCard destination={destination} index={index} />
                </Reveal>
              ))}
            </div>
            <Reveal {...summerUpdateRevealMotion}>
              <Paragraph className="mt-12 max-w-6xl">
                If you have questions or run into issues, the{' '}
                <NativeLink
                  className="[--link:var(--color-sea-serpent)]"
                  href="https://community.networkcanvas.com/"
                >
                  community forum
                </NativeLink>{' '}
                is the best place to reach us and connect with other researchers
                using the tools. We hope these new tools make a meaningful
                difference in your research — our team is extremely grateful for
                feedback from the community, and for the ongoing support that
                makes this work possible.
              </Paragraph>
            </Reveal>
          </div>
        </Section>
      </main>
      <Footer />
    </>
  );
}

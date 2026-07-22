'use client';

import { motion, useReducedMotion, useScroll } from 'motion/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';

import Surface from '@codaco/fresco-ui/layout/Surface';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { Reveal } from '~/components/ui/Reveal';
import { cn } from '~/lib/cn';

import {
  compatibilityRows,
  destinationLinks,
  interfaceFeatures,
  type CompatibilityStatus,
  type InterfaceMotif,
} from './summerUpdateContent';

const easing = [0.22, 1, 0.36, 1] as [number, number, number, number];
const BackgroundLights = dynamic(
  () => import('@codaco/art').then((art) => art.BackgroundLights),
  { ssr: false },
);
const revealMotion = {
  distance: 32,
  duration: 0.9,
  easing,
} as const;

type AccentColor =
  | 'cerulean-blue'
  | 'kiwi'
  | 'mustard'
  | 'neon-carrot'
  | 'neon-coral'
  | 'paradise-pink'
  | 'sea-serpent';

const accentBackgroundClasses: Record<AccentColor, string> = {
  'cerulean-blue': 'bg-cerulean-blue',
  'kiwi': 'bg-kiwi',
  'mustard': 'bg-mustard',
  'neon-carrot': 'bg-neon-carrot',
  'neon-coral': 'bg-neon-coral',
  'paradise-pink': 'bg-paradise-pink',
  'sea-serpent': 'bg-sea-serpent',
};
const schemaLightColors = [
  'oklch(var(--purple-pizazz) / 0.22)',
  'oklch(var(--cerulean-blue) / 0.18)',
] as const;
const finalLightColors = [
  'oklch(var(--sea-green) / 0.2)',
  'oklch(var(--barbie-pink) / 0.18)',
] as const;
const upgradeLightColors = [
  'oklch(var(--sea-serpent) / 0.18)',
  'oklch(var(--paradise-pink) / 0.16)',
] as const;

function HeroEntrance({
  bar,
  children,
  className,
  delay,
  direction = 'up',
}: {
  bar?: boolean;
  children?: ReactNode;
  className?: string;
  delay: number;
  direction?: 'down' | 'up';
}) {
  const shouldReduceMotion = useReducedMotion();
  const initial = bar
    ? { opacity: 0, scaleX: 0 }
    : {
        opacity: 0,
        y: direction === 'down' ? -16 : 30,
      };
  const visible = bar ? { opacity: 1, scaleX: 1 } : { opacity: 1, y: 0 };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : initial}
      animate={shouldReduceMotion ? undefined : visible}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: bar ? 1 : 0.9, delay, ease: easing }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({
  children,
  dark,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        'font-monospace inline-flex items-center gap-3 text-xs leading-relaxed tracking-widest uppercase',
        dark ? 'text-sea-green' : 'text-neon-coral',
      )}
    >
      <span aria-hidden className="h-0.5 w-6 bg-current" />
      {children}
    </div>
  );
}

function ActionButton({
  children,
  compact,
  href,
  secondary,
}: {
  children: ReactNode;
  compact?: boolean;
  href: string;
  secondary?: boolean;
}) {
  return (
    <ButtonLink
      external
      href={href}
      color={secondary ? 'dynamic' : 'success'}
      size={compact ? 'md' : 'lg'}
      textStyle={secondary ? 'uppercase' : undefined}
      variant={secondary ? 'glass' : 'raised'}
    >
      {children}
    </ButtonLink>
  );
}

function BenefitCard({
  children,
  delay,
  icon,
  title,
}: {
  children: ReactNode;
  delay: number;
  icon: 'blue' | 'cyan' | 'green';
  title: string;
}) {
  const iconClass = {
    blue: 'border-cerulean-blue/35 bg-cerulean-blue/10',
    cyan: 'border-sea-serpent/35 bg-sea-serpent/10',
    green: 'border-sea-green/35 bg-sea-green/10',
  }[icon];
  const iconDotClass = {
    blue: 'bg-cerulean-blue',
    cyan: 'bg-sea-serpent',
    green: 'bg-sea-green',
  }[icon];

  return (
    <Reveal {...revealMotion} delay={delay}>
      <Surface
        as="article"
        noContainer
        spacing="lg"
        shadow="sm"
        className="h-full"
      >
        <div
          className={cn(
            'relative mb-6 grid size-12 place-items-center rounded-full border',
            iconClass,
          )}
          aria-hidden
        >
          <span className={cn('size-4 rounded-full', iconDotClass)} />
        </div>
        <Heading level="h3" className="text-navy-taupe">
          {title}
        </Heading>
        <Paragraph className="text-navy-taupe/75">{children}</Paragraph>
      </Surface>
    </Reveal>
  );
}

function BulletList({
  items,
}: {
  items: readonly { color: AccentColor; content: ReactNode }[];
}) {
  return (
    <ul className="mt-6 space-y-4">
      {items.map((item, index) => (
        <li className="flex items-start gap-4" key={index}>
          <span
            aria-hidden
            className={cn(
              'mt-2 size-2.5 shrink-0 rounded-full',
              accentBackgroundClasses[item.color],
            )}
          />
          <span className="text-navy-taupe/80">{item.content}</span>
        </li>
      ))}
    </ul>
  );
}

function ScreenshotFrame({
  address,
  alt,
  contain,
  src,
}: {
  address: string;
  alt: string;
  contain?: boolean;
  src: string;
}) {
  return (
    <div className="elevation-medium overflow-hidden rounded bg-white">
      <div
        className="border-navy-taupe/10 bg-platinum flex items-center gap-2 border-b px-4 py-3"
        aria-hidden
      >
        <span className="bg-neon-coral size-2.5 rounded-full" />
        <span className="bg-mustard size-2.5 rounded-full" />
        <span className="bg-sea-green size-2.5 rounded-full" />
        <span className="font-monospace text-navy-taupe/55 ml-2 truncate text-xs">
          {address}
        </span>
      </div>
      <div
        className={cn(
          'relative aspect-4/3 overflow-hidden bg-white [&_img]:object-cover',
          contain && '[&_img]:object-contain',
        )}
      >
        <Image
          fill
          src={src}
          alt={alt}
          sizes="(min-width: 801px) 50vw, 100vw"
        />
      </div>
    </div>
  );
}

function FeatureCard({
  children,
  color,
  delay,
  title,
}: {
  children: ReactNode;
  color: AccentColor;
  delay: number;
  title: string;
}) {
  return (
    <Reveal {...revealMotion} direction="right" delay={delay}>
      <Surface
        as="article"
        noContainer
        spacing="sm"
        shadow="xs"
        className="flex gap-4"
      >
        <span
          aria-hidden
          className={cn(
            'mt-2 size-2.5 shrink-0 rounded-full',
            accentBackgroundClasses[color],
          )}
        />
        <div>
          <Heading level="h4">{title}</Heading>
          <Paragraph intent="smallText">{children}</Paragraph>
        </div>
      </Surface>
    </Reveal>
  );
}

function InterfaceGraphic({ motif }: { motif: InterfaceMotif }) {
  const common = {
    'width': 76,
    'height': 56,
    'viewBox': '0 0 76 56',
    'aria-hidden': true,
  } as const;

  switch (motif) {
    case 'geospatial':
      return (
        <svg {...common}>
          <rect
            x="6"
            y="8"
            width="64"
            height="40"
            rx="9"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".32"
            strokeWidth="2"
            strokeDasharray="5 5"
          />
          <line
            x1="26"
            y1="24"
            x2="46"
            y2="34"
            stroke="currentColor"
            strokeOpacity=".4"
            strokeWidth="1.5"
          />
          <circle cx="26" cy="24" r="5.5" className="fill-neon-coral" />
          <circle cx="46" cy="34" r="4.5" className="fill-mustard" />
          <circle cx="57" cy="17" r="3.5" className="fill-sea-serpent" />
        </svg>
      );
    case 'anonymisation':
      return (
        <svg {...common}>
          <circle
            cx="38"
            cy="28"
            r="19"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".45"
            strokeWidth="2"
            strokeDasharray="4 6"
          />
          <circle cx="38" cy="28" r="9" className="fill-kiwi" />
        </svg>
      );
    case 'one-to-many':
      return (
        <svg {...common}>
          <g stroke="currentColor" strokeOpacity=".5" strokeWidth="1.5">
            <line x1="18" y1="28" x2="57" y2="12" />
            <line x1="18" y1="28" x2="60" y2="28" />
            <line x1="18" y1="28" x2="57" y2="44" />
          </g>
          <circle cx="18" cy="28" r="7" className="fill-neon-coral" />
          <circle cx="57" cy="12" r="5" className="fill-sea-serpent" />
          <circle cx="60" cy="28" r="5" className="fill-purple-pizazz" />
          <circle cx="57" cy="44" r="5" className="fill-neon-carrot" />
        </svg>
      );
    case 'family-pedigree':
    case 'narrative-pedigree': {
      const narrative = motif === 'narrative-pedigree';
      return (
        <svg {...common}>
          <g stroke="currentColor" strokeOpacity=".55" strokeWidth="2">
            <line x1="31" y1="14" x2="50" y2="14" />
            <line x1="40" y1="14" x2="40" y2="30" />
            <line x1="40" y1="30" x2="28" y2="41" />
            <line x1="40" y1="30" x2="52" y2="41" />
          </g>
          <rect
            x="21"
            y="9"
            width="10"
            height="10"
            className={
              narrative
                ? 'fill-neon-coral stroke-none'
                : 'stroke-sea-serpent fill-none'
            }
            strokeWidth="2.5"
          />
          <circle
            cx="50"
            cy="14"
            r="5.5"
            fill="none"
            className={narrative ? 'stroke-current' : 'stroke-paradise-pink'}
            strokeOpacity={narrative ? '.6' : undefined}
            strokeWidth="2.5"
          />
          <circle
            cx="28"
            cy="44"
            r="5"
            className={
              narrative
                ? 'fill-neon-coral stroke-none'
                : 'stroke-mustard fill-none'
            }
            strokeWidth="2.5"
          />
          <rect
            x="47"
            y="39"
            width="10"
            height="10"
            fill="none"
            className={narrative ? 'stroke-current' : 'stroke-kiwi'}
            strokeOpacity={narrative ? '.6' : undefined}
            strokeWidth="2.5"
          />
        </svg>
      );
    }
    case 'network-composer':
      return (
        <svg {...common}>
          <g stroke="currentColor" strokeOpacity=".45" strokeWidth="1.5">
            <line x1="16" y1="40" x2="34" y2="14" />
            <line x1="34" y1="14" x2="58" y2="20" />
            <line x1="58" y1="20" x2="52" y2="44" />
            <line x1="16" y1="40" x2="52" y2="44" />
            <line x1="30" y1="32" x2="58" y2="20" />
          </g>
          <circle cx="16" cy="40" r="6" className="fill-neon-coral" />
          <circle cx="34" cy="14" r="5" className="fill-sea-serpent" />
          <circle cx="58" cy="20" r="7" className="fill-mustard" />
          <circle cx="52" cy="44" r="5" className="fill-kiwi" />
          <circle cx="30" cy="32" r="3.5" className="fill-purple-pizazz" />
        </svg>
      );
    case 'validation':
      return (
        <svg {...common}>
          <line
            x1="14"
            y1="28"
            x2="44"
            y2="12"
            stroke="currentColor"
            strokeOpacity=".5"
            strokeWidth="1.5"
          />
          <line
            x1="14"
            y1="28"
            x2="44"
            y2="44"
            stroke="currentColor"
            strokeOpacity=".5"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <circle cx="14" cy="28" r="6.5" className="fill-cerulean-blue" />
          <circle cx="49" cy="12" r="5" className="fill-kiwi" />
          <circle
            cx="49"
            cy="44"
            r="5"
            fill="none"
            className="stroke-neon-coral"
            strokeWidth="2.5"
          />
        </svg>
      );
    case 'node-shapes':
      return (
        <svg {...common}>
          <circle cx="18" cy="28" r="8" className="fill-neon-coral" />
          <rect
            x="34"
            y="20"
            width="16"
            height="16"
            rx="3"
            className="fill-sea-serpent"
          />
          <polygon points="64,19 73,28 64,37 55,28" className="fill-mustard" />
        </svg>
      );
    case 'templates':
      return (
        <svg {...common}>
          <rect
            x="12"
            y="20"
            width="40"
            height="26"
            rx="6"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".3"
            strokeWidth="2"
          />
          <rect
            x="18"
            y="13"
            width="40"
            height="26"
            rx="6"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".5"
            strokeWidth="2"
          />
          <rect
            x="24"
            y="6"
            width="40"
            height="26"
            rx="6"
            className="fill-slate-blue"
            fillOpacity=".28"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="34" cy="19" r="3" className="fill-neon-coral" />
          <circle cx="44" cy="19" r="3" className="fill-sea-serpent" />
          <circle cx="54" cy="19" r="3" className="fill-mustard" />
        </svg>
      );
    case 'synthetic-data':
      return (
        <svg {...common}>
          <g
            fill="none"
            stroke="currentColor"
            strokeOpacity=".5"
            strokeWidth="2"
            strokeDasharray="3 4"
          >
            <circle cx="20" cy="20" r="5" />
            <circle cx="56" cy="13" r="4" />
            <circle cx="60" cy="41" r="5" />
            <circle cx="22" cy="43" r="4" />
          </g>
          <circle cx="38" cy="28" r="7.5" className="fill-paradise-pink" />
        </svg>
      );
  }

  const exhaustiveMotif: never = motif;
  return exhaustiveMotif;
}

function StatusChip({ status }: { status: CompatibilityStatus }) {
  const labels = {
    migrates: '→ Migrates to 8',
    native: '✓ Native',
    unsupported: '✗ Not supported',
  } as const;

  const statusClass = {
    migrates: 'bg-sea-serpent/15 text-sea-serpent-dark',
    native: 'bg-sea-green/15 text-sea-green-dark',
    unsupported: 'bg-neon-coral/10 text-neon-coral-dark',
  }[status];

  return (
    <span
      className={cn(
        'font-monospace inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-wide whitespace-nowrap',
        statusClass,
      )}
    >
      {labels[status]}
    </span>
  );
}

export function SummerUpdatePage() {
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
      <main className="bg-rich-black font-body text-navy-taupe selection:bg-mustard selection:text-rich-black">
        <motion.div
          aria-hidden
          className="from-neon-coral via-mustard to-sea-green fixed inset-x-0 top-0 z-50 h-1 w-full origin-left rounded-r-full bg-linear-to-r"
          style={{ scaleX: scrollYProgress }}
        />

        <section
          className="from-rich-black via-cyber-grape to-slate-blue relative overflow-hidden bg-linear-to-b text-white"
          aria-labelledby="summer-update-title"
        >
          <HeroEntrance delay={0.05} direction="down">
            <Header
              className="relative z-20 [--input-contrast:var(--color-white)] [--input:var(--color-cyber-grape)] [--primary-contrast:var(--color-white)] [--primary:var(--color-sea-green)] [--surface-contrast:var(--color-white)] [--surface:var(--color-rich-black)] [--text:var(--color-white)]"
              containerClassName="py-6!"
            />
          </HeroEntrance>

          <div className="tablet-portrait:pt-24 tablet-portrait:pb-48 relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 pt-16 pb-40 text-center">
            <HeroEntrance delay={0.18}>
              <div className="border-sea-serpent/40 bg-sea-serpent/10 font-monospace text-sea-serpent inline-flex rounded-full border px-4 py-2 text-xs tracking-widest uppercase">
                New Schema 8 · Fresco 4.0.0 · Architect & Interviewer redesigned
              </div>
            </HeroEntrance>
            <HeroEntrance delay={0.32}>
              <Heading
                level="h1"
                variant="display-heading"
                className="text-white"
                id="summer-update-title"
              >
                Introducing the next generation of Network Canvas apps
              </Heading>
            </HeroEntrance>
            <HeroEntrance
              bar
              delay={0.52}
              className="from-neon-coral via-paradise-pink to-sea-serpent mx-auto mt-8 h-1.5 w-48 origin-center rounded-full bg-linear-to-r"
            />
            <HeroEntrance delay={0.62}>
              <Paragraph
                intent="lead"
                emphasis="muted"
                className="mx-auto max-w-3xl text-white/80"
              >
                These updates represent a significant step forward in how you
                design, run, and manage network interviews — here is what is
                changing, what is new, and what it means for your work.
              </Paragraph>
            </HeroEntrance>
            <HeroEntrance delay={0.74}>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <ActionButton href="https://architect.networkcanvas.com/">
                  Open Architect
                </ActionButton>
                <ActionButton
                  href="https://interviewer.networkcanvas.com/"
                  secondary
                >
                  Open Interviewer
                </ActionButton>
              </div>
            </HeroEntrance>
            <HeroEntrance delay={0.86}>
              <div className="font-monospace mt-5 text-xs tracking-widest text-white/50 uppercase">
                Free and open-source · Nothing to install
              </div>
            </HeroEntrance>
          </div>

          <HeroEntrance
            delay={1.1}
            className="font-monospace absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 text-xs tracking-widest text-white/55 uppercase"
          >
            <span>Keep scrolling to learn more</span>
            <span
              className="flex h-8 w-5 justify-center rounded-full border border-white/40 pt-2"
              aria-hidden
            >
              <span className="size-1 animate-bounce rounded-full bg-white/70" />
            </span>
          </HeroEntrance>
        </section>

        <section
          className="bg-platinum text-navy-taupe tablet-portrait:px-16 tablet-portrait:py-24 relative z-10 -mt-10 rounded-t-lg px-5 py-16"
          aria-labelledby="whats-new-title"
        >
          <div className="relative z-10 mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel>01 — What’s new</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-navy-taupe mt-2!"
                id="whats-new-title"
              >
                Architect and Interviewer, reimagined for the browser
              </Heading>
              <Paragraph intent="lead" className="text-navy-taupe/80 max-w-3xl">
                We have redesigned <strong>Architect</strong> and{' '}
                <strong>Interviewer</strong> as websites that can also be
                installed as Progressive Web Apps (PWAs) on your device.
                Together with <strong>Fresco 4.0.0</strong>, they form a
                unified, modern platform built on a shared technical foundation
                — and all three support a new protocol file format,{' '}
                <strong>Schema 8</strong>.
              </Paragraph>
            </Reveal>

            <div className="tablet-portrait:grid-cols-3 mt-12 grid grid-cols-1 gap-6">
              <BenefitCard title="Low friction use" icon="green" delay={0}>
                Visit{' '}
                <NativeLink href="https://architect.networkcanvas.com/">
                  architect.networkcanvas.com
                </NativeLink>{' '}
                or{' '}
                <NativeLink href="https://interviewer.networkcanvas.com/">
                  interviewer.networkcanvas.com
                </NativeLink>{' '}
                on any device, at any time — and use the tools without
                installing anything.
              </BenefitCard>
              <BenefitCard
                title="Local app installation"
                icon="blue"
                delay={0.11}
              >
                Install either tool as an app directly from the browser. It
                works like a typical app on your device, while you remain in
                control of your data locally.
              </BenefitCard>
              <BenefitCard title="Streamlined updates" icon="cyan" delay={0.22}>
                Installed apps silently check for newer versions and prompt you
                to refresh. On the website, updates happen automatically behind
                the scenes.
              </BenefitCard>
            </div>

            <Reveal {...revealMotion}>
              <aside className="border-mustard/50 bg-mustard/10 mt-10 rounded-sm border p-5">
                <span className="bg-mustard font-monospace text-rich-black mr-3 inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest">
                  NAMING
                </span>
                <Paragraph className="text-navy-taupe/80 inline">
                  The original desktop and tablet apps are now{' '}
                  <strong>Architect Classic</strong> and{' '}
                  <strong>Interviewer Classic</strong>. They remain available
                  for in-progress studies, but are no longer recommended for new
                  research.
                </Paragraph>
              </aside>
            </Reveal>
          </div>
        </section>

        <section
          className="bg-platinum text-navy-taupe tablet-portrait:px-16 tablet-portrait:py-24 px-5 py-16"
          aria-labelledby="meet-apps-title"
        >
          <Heading
            level="h2"
            margin="none"
            className="sr-only"
            id="meet-apps-title"
          >
            Meet the apps
          </Heading>
          <div className="tablet-portrait:space-y-32 relative z-10 mx-auto max-w-6xl space-y-24">
            <div className="tablet-portrait:grid-cols-2 tablet-portrait:gap-14 grid grid-cols-1 items-center gap-10">
              <Reveal {...revealMotion} direction="left">
                <div className="mb-5 flex items-center gap-4">
                  <Image
                    src="/images/summer-2026/architect-icon.png"
                    alt="Architect app icon"
                    width={54}
                    height={54}
                    className="rounded-sm"
                  />
                  <span className="font-monospace text-neon-coral text-xs tracking-widest uppercase">
                    02 — Protocol design
                  </span>
                </div>
                <Heading
                  level="h3"
                  variant="subheading"
                  className="text-navy-taupe"
                >
                  Architect — build protocols in your browser, or as a PWA
                </Heading>
                <Paragraph className="text-navy-taupe/80">
                  There is nothing to install — just open{' '}
                  <NativeLink href="https://architect.networkcanvas.com/">
                    architect.networkcanvas.com
                  </NativeLink>{' '}
                  and start building. Architect always runs the latest version
                  automatically. Once in the website, install it to your
                  computer as a PWA for a native-like experience and local
                  control over your data.
                </Paragraph>
                <BulletList
                  items={[
                    {
                      color: 'neon-coral',
                      content: (
                        <>
                          Builds <strong>Schema 8</strong> protocols — required
                          by Fresco 4.0.0 and the latest Interviewer
                        </>
                      ),
                    },
                    {
                      color: 'sea-serpent',
                      content:
                        'Opens and automatically upgrades older Schema 7 protocols',
                    },
                    {
                      color: 'neon-carrot',
                      content:
                        'Explore domain-specific protocol templates, informed by current literature',
                    },
                  ]}
                />
                <aside className="border-mustard/50 bg-mustard/10 mt-6 rounded-sm border p-5">
                  <Paragraph className="text-navy-taupe/80">
                    <strong>The website and PWA share no data.</strong> To move
                    a protocol between them, download the file from one and
                    upload it to the other.
                  </Paragraph>
                </aside>
                <div className="mt-8 flex flex-wrap gap-4">
                  <ActionButton
                    compact
                    href="https://architect.networkcanvas.com/"
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
                  className="text-navy-taupe/55 mt-6"
                >
                  Architect Classic remains available for researchers who need
                  to keep using older versions of Interviewer (e.g. 6.6.0). It
                  is in maintenance mode — bug fixes only — and continues to
                  produce Schema 7 protocols.
                </Paragraph>
              </Reveal>

              <Reveal {...revealMotion} direction="right">
                <ScreenshotFrame
                  address="architect.networkcanvas.com"
                  alt="Architect protocol editor showing the Sample Protocol timeline"
                  src="/images/screenshots/architect.png"
                />
              </Reveal>
            </div>

            <div className="tablet-portrait:grid-cols-2 tablet-portrait:gap-14 grid grid-cols-1 items-center gap-10">
              <Reveal
                {...revealMotion}
                direction="right"
                className="tablet-portrait:order-2"
              >
                <div className="mb-5 flex items-center gap-4">
                  <Image
                    src="/images/summer-2026/interviewer-icon.svg"
                    alt="Interviewer app icon"
                    width={54}
                    height={54}
                    className="rounded-sm"
                  />
                  <span className="font-monospace text-kiwi text-xs tracking-widest uppercase">
                    02 — Survey deployment
                  </span>
                </div>
                <Heading
                  level="h3"
                  variant="subheading"
                  className="text-navy-taupe"
                >
                  Interviewer — manage and deploy surveys anywhere
                </Heading>
                <Paragraph className="text-navy-taupe/80">
                  Interviewer has also been redesigned for the browser: upload a
                  protocol at{' '}
                  <NativeLink href="https://interviewer.networkcanvas.com/">
                    interviewer.networkcanvas.com
                  </NativeLink>{' '}
                  and deploy without installing anything. Install it as a PWA to
                  support offline workflows — it remains the ideal tool for
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
                          migrates Schema 7 protocols automatically when you
                          open them
                        </>
                      ),
                    },
                    {
                      color: 'paradise-pink',
                      content:
                        'Interviewer and Interviewer Classic can be installed side by side, if necessary',
                    },
                  ]}
                />
                <div className="mt-8 flex flex-wrap gap-4">
                  <ActionButton
                    compact
                    href="https://interviewer.networkcanvas.com/"
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
                  className="text-navy-taupe/55 mt-6"
                >
                  Interviewer Classic remains available for in-progress studies.
                  Like Architect Classic, it is in maintenance mode only, and
                  not advisable for new research.
                </Paragraph>
              </Reveal>

              <Reveal
                {...revealMotion}
                direction="left"
                className="tablet-portrait:order-1"
              >
                <ScreenshotFrame
                  contain
                  address="interviewer.networkcanvas.com"
                  alt="Interviewer dashboard showing protocol cards and a resume interview action"
                  src="/images/summer-2026/interviewer.webp"
                />
              </Reveal>
            </div>

            <div className="tablet-portrait:grid-cols-2 tablet-portrait:gap-14 grid grid-cols-1 items-center gap-10">
              <Reveal {...revealMotion} direction="left">
                <div className="mb-5 flex items-center gap-4">
                  <Image
                    src="/images/summer-2026/fresco-icon.png"
                    alt="Fresco app icon"
                    width={54}
                    height={54}
                    className="rounded-sm"
                  />
                  <span className="font-monospace text-mustard text-xs tracking-widest uppercase">
                    02 — Remote web interviews
                  </span>
                </div>
                <Heading
                  level="h3"
                  variant="subheading"
                  className="text-navy-taupe"
                >
                  Fresco 4.0.0 — remote, self-administered interviews
                </Heading>
                <Paragraph className="text-navy-taupe/80">
                  Fresco brings Network Canvas interviews to the web. Deploy
                  your own private instance, upload a protocol, and share a URL
                  — participants complete interviews on their own devices, with
                  no app download required.
                </Paragraph>
                <aside className="border-mustard/50 bg-mustard/10 mt-6 rounded-sm border p-5">
                  <Paragraph className="text-navy-taupe/80">
                    <strong>Note:</strong> Fresco 4.0.0 is not supported on
                    mobile phones.
                  </Paragraph>
                </aside>
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
              </Reveal>

              <div className="space-y-4">
                <FeatureCard
                  title="Multi-user access"
                  color="neon-coral"
                  delay={0}
                >
                  Each team member gets their own account, rather than sharing
                  credentials.
                </FeatureCard>
                <FeatureCard
                  title="Two-factor authentication"
                  color="sea-serpent"
                  delay={0.11}
                >
                  Enable 2FA and register passkeys directly from the dashboard.
                </FeatureCard>
                <FeatureCard
                  title="Flexible storage"
                  color="mustard"
                  delay={0.22}
                >
                  Use UploadThing (managed, simplest to set up) or any
                  S3-compatible bucket — AWS S3, Cloudflare R2, MinIO, Backblaze
                  B2.
                </FeatureCard>
              </div>
            </div>
          </div>
        </section>

        <section
          className="from-rich-black via-cyber-grape to-slate-blue tablet-portrait:px-16 tablet-portrait:py-28 relative overflow-hidden bg-linear-to-br px-5 py-20 text-white"
          aria-labelledby="schema-title"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden
          >
            <BackgroundLights
              large={2}
              medium={2}
              small={1}
              colors={schemaLightColors}
              blendMode="color-dodge"
              speedFactor={0.3}
            />
          </div>
          <div className="relative z-10 mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel dark>03 — Schema 8</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="mt-2! text-white"
                id="schema-title"
              >
                New interfaces and features, only in the new generation
              </Heading>
              <Paragraph
                intent="lead"
                emphasis="muted"
                className="max-w-3xl text-white/70"
              >
                Schema 8 introduces new interview interfaces and features that
                are unavailable in the current generation. If your study
                requires any of these, you’ll need to use the new tools. Tap
                each one to explore.
              </Paragraph>
            </Reveal>

            <div className="tablet-portrait:grid-cols-3 tablet-landscape:grid-cols-5 mt-12 grid grid-cols-2 gap-4">
              {interfaceFeatures.map((feature, index) => (
                <Reveal
                  {...revealMotion}
                  delay={index * 0.11}
                  key={feature.shortName}
                >
                  <button
                    type="button"
                    aria-pressed={selectedInterface === index}
                    className="focusable aria-pressed:border-sea-serpent aria-pressed:bg-sea-serpent/15 flex h-full w-full flex-col items-center gap-3 rounded-sm border border-white/15 bg-white/5 p-5 text-center text-white/80 transition hover:bg-white/10 aria-pressed:text-white"
                    onClick={() => setSelectedInterface(index)}
                  >
                    <InterfaceGraphic motif={feature.motif} />
                    <div className="text-sm font-bold">{feature.shortName}</div>
                  </button>
                </Reveal>
              ))}
            </div>

            <Reveal {...revealMotion}>
              <div
                className="bg-rich-black/45 tablet-portrait:p-8 mt-8 rounded border border-white/15 p-6 backdrop-blur-sm"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Heading
                    level="h3"
                    variant="subheading"
                    margin="none"
                    className="text-white"
                  >
                    {activeInterface.name}
                  </Heading>
                  <span className="bg-sea-green/15 font-monospace text-sea-green rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    {activeInterface.tag}
                  </span>
                </div>
                <Paragraph emphasis="muted" className="max-w-3xl text-white/70">
                  {activeInterface.description}
                </Paragraph>
                <NativeLink
                  className="[--link:var(--color-sea-serpent)]"
                  href={activeInterface.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore in the documentation ↗
                </NativeLink>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          className="bg-platinum text-navy-taupe tablet-portrait:px-16 tablet-portrait:py-28 px-5 py-20"
          aria-labelledby="compatibility-title"
        >
          <div className="relative z-10 mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel>04 — Compatibility</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-navy-taupe mt-2!"
                id="compatibility-title"
              >
                Two formats, six apps — know before you upgrade
              </Heading>
              <Paragraph intent="lead" className="text-navy-taupe/80 max-w-3xl">
                Protocol schema versions determine which apps can open a given
                protocol file — and the most important change in this release is{' '}
                <strong>Schema 8</strong>. Here is exactly how every app handles
                both formats. Select a row for what it means in practice.
              </Paragraph>
            </Reveal>

            <Reveal {...revealMotion} direction="zoom">
              <div className="elevation-low border-navy-taupe/15 bg-surface mt-12 overflow-hidden rounded border">
                <div className="overflow-x-auto">
                  <div className="min-w-4xl">
                    <div
                      className="border-navy-taupe/15 bg-surface-2 font-monospace text-navy-taupe/60 grid grid-cols-4 gap-4 border-b px-6 py-4 text-xs font-bold tracking-widest uppercase"
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
                                'bg-platinum font-monospace text-navy-taupe/55 px-6 py-2 text-xs font-bold tracking-widest uppercase',
                                index > 0 && 'border-navy-taupe/15 border-t',
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
                            className="focusable border-navy-taupe/10 aria-pressed:bg-sea-serpent/10 hover:bg-navy-taupe/5 grid w-full grid-cols-4 items-center gap-4 border-t px-6 py-4 text-left transition first:border-t-0"
                            onClick={() => setSelectedCompatibilityRow(index)}
                          >
                            <span className="text-navy-taupe font-bold">
                              {row.app}{' '}
                              {row.version ? (
                                <span className="font-monospace text-navy-taupe/50 text-xs font-normal">
                                  {row.version}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-navy-taupe/65 text-sm">
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
                  className="border-navy-taupe/15 bg-sea-serpent/10 text-navy-taupe/75 border-t px-6 py-4 text-sm"
                  aria-live="polite"
                >
                  {compatibilityNote}
                </div>
              </div>
            </Reveal>

            <Reveal {...revealMotion} direction="zoom">
              <div className="elevation-low bg-rich-black tablet-portrait:grid-cols-2 tablet-portrait:p-10 mt-10 grid grid-cols-1 items-center gap-10 rounded p-8 text-white">
                <div>
                  <Heading
                    level="h3"
                    variant="subheading"
                    className="text-white"
                  >
                    Migration is one-way.
                  </Heading>
                  <Paragraph emphasis="muted" className="text-white/70">
                    If you open a Schema 7 protocol in any new-generation app,
                    it will be automatically upgraded to Schema 8. You will not
                    be able to convert it back, or open it in the older apps
                    afterward.
                  </Paragraph>
                  <Paragraph className="border-mustard/35 bg-mustard/10 rounded-sm border p-4 text-white/80">
                    Keep a copy of your original{' '}
                    <span className="bg-mustard font-monospace text-rich-black rounded-xs px-2 py-1 text-xs font-bold">
                      .netcanvas
                    </span>{' '}
                    file if you need to continue running it in Interviewer
                    Classic, Architect Classic, or Fresco 3.x.
                  </Paragraph>
                </div>
                <div className="flex flex-col items-center gap-5" aria-hidden>
                  <div className="flex items-center justify-center gap-5">
                    <div className="grid size-24 place-items-center rounded-full border-2 border-white/25 text-center">
                      <span>
                        <strong className="block text-3xl">7</strong>
                        <span className="font-monospace text-xs tracking-widest text-white/50">
                          SCHEMA
                        </span>
                      </span>
                    </div>
                    <div className="text-sea-serpent flex flex-col items-center gap-2">
                      <span className="text-3xl">→</span>
                      <span className="font-monospace text-xs tracking-wide whitespace-nowrap">
                        Automatic upgrade
                      </span>
                    </div>
                    <div className="border-sea-green bg-sea-green/10 text-sea-green grid size-24 place-items-center rounded-full border-2 text-center">
                      <span>
                        <strong className="block text-3xl">8</strong>
                        <span className="font-monospace text-xs tracking-widest">
                          SCHEMA
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="font-monospace text-neon-coral text-xs tracking-wide">
                    ← ✗ No return path
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          className="from-rich-black via-cyber-grape to-slate-blue tablet-portrait:px-16 tablet-portrait:py-28 relative overflow-hidden bg-linear-to-br px-5 py-20 text-white"
          aria-labelledby="upgrade-title"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden
          >
            <BackgroundLights
              large={2}
              medium={2}
              small={1}
              colors={upgradeLightColors}
              blendMode="color-dodge"
              speedFactor={0.25}
            />
          </div>
          <div className="relative z-10 mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel dark>05 — Should you upgrade?</SectionLabel>
              <Heading
                level="h2"
                margin="none"
                className="sr-only"
                id="upgrade-title"
              >
                Should you upgrade?
              </Heading>
            </Reveal>
            <div className="tablet-portrait:grid-cols-2 mt-8 grid grid-cols-1 gap-6">
              <Reveal {...revealMotion}>
                <Surface
                  as="article"
                  noContainer
                  spacing="lg"
                  shadow="sm"
                  className="h-full"
                >
                  <span className="bg-sea-green/15 font-monospace text-sea-green-dark inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    Starting a new study
                  </span>
                  <Heading
                    level="h3"
                    variant="subheading"
                    className="text-navy-taupe"
                  >
                    Use the new generation
                  </Heading>
                  <Paragraph className="text-navy-taupe/80">
                    For new studies, we recommend the new tools: use{' '}
                    <strong>Architect</strong> to design your protocol, and
                    deploy interviews with <strong>Fresco 4.0.0</strong> or{' '}
                    <strong>Interviewer</strong>, depending on your needs.
                  </Paragraph>
                </Surface>
              </Reveal>
              <Reveal {...revealMotion} delay={0.11}>
                <Surface
                  as="article"
                  noContainer
                  spacing="lg"
                  shadow="sm"
                  className="h-full"
                >
                  <span className="bg-sea-serpent/15 font-monospace text-sea-serpent-dark inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    Running an ongoing study
                  </span>
                  <Heading
                    level="h3"
                    variant="subheading"
                    className="text-navy-taupe"
                  >
                    There is no rush
                  </Heading>
                  <Paragraph className="text-navy-taupe/80">
                    Interviewer Classic and Architect Classic are still
                    supported and will continue to receive bug fixes. Upgrade at
                    a time that suits your project — just be mindful of the
                    one-way migration when you do.
                  </Paragraph>
                </Surface>
              </Reveal>
            </div>
          </div>
        </section>

        <section
          className="bg-platinum text-navy-taupe tablet-portrait:px-16 tablet-portrait:py-28 px-5 py-20"
          aria-labelledby="resources-title"
        >
          <div className="relative z-10 mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel>06 — Project resources</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="text-navy-taupe mt-2!"
                id="resources-title"
              >
                A clearer home for the whole Network Canvas project
              </Heading>
              <Paragraph intent="lead" className="text-navy-taupe/80 max-w-3xl">
                The apps are not the only part of Network Canvas that has
                changed. We have also redesigned the project website and
                reorganized the documentation to make it easier to understand
                the platform, choose the right tools, and find your next step.
              </Paragraph>
            </Reveal>
            <div className="tablet-portrait:grid-cols-2 mt-12 grid grid-cols-1 gap-6">
              <Reveal {...revealMotion} direction="left">
                <Surface
                  as="article"
                  noContainer
                  spacing="xl"
                  shadow="sm"
                  className="h-full"
                >
                  <div className="flex h-full flex-col">
                    <SectionLabel>Project website</SectionLabel>
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
                      Explore the new website ↗
                    </NativeLink>
                    <div className="mt-auto pt-8">
                      <ScreenshotFrame
                        address="networkcanvas.com"
                        alt="The redesigned Network Canvas website homepage"
                        src="/images/summer-2026/website-homepage.jpg"
                      />
                    </div>
                  </div>
                </Surface>
              </Reveal>
              <Reveal {...revealMotion} direction="right" delay={0.11}>
                <Surface
                  as="article"
                  noContainer
                  spacing="xl"
                  shadow="sm"
                  className="h-full"
                >
                  <div className="flex h-full flex-col">
                    <SectionLabel>Project documentation</SectionLabel>
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
                      Explore the documentation ↗
                    </NativeLink>
                    <div className="mt-auto pt-8">
                      <ScreenshotFrame
                        address="documentation.networkcanvas.com"
                        alt="The redesigned Network Canvas documentation homepage"
                        src="/images/summer-2026/documentation-homepage.jpg"
                      />
                    </div>
                  </div>
                </Surface>
              </Reveal>
            </div>
          </div>
        </section>

        <section
          className="from-rich-black via-cyber-grape to-slate-blue tablet-portrait:px-16 tablet-portrait:py-28 relative overflow-hidden bg-linear-to-br px-5 py-20 text-white"
          aria-labelledby="getting-started-title"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden
          >
            <BackgroundLights
              large={2}
              medium={1}
              small={2}
              colors={finalLightColors}
              blendMode="color-dodge"
              speedFactor={0.25}
            />
          </div>
          <div className="relative z-10 mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel dark>07 — Getting started</SectionLabel>
              <Heading
                level="h2"
                variant="section-heading"
                className="mt-2! text-white"
                id="getting-started-title"
              >
                Start exploring the new generation
              </Heading>
            </Reveal>
            <div className="tablet-portrait:grid-cols-2 mt-12 grid grid-cols-1 gap-5">
              {destinationLinks.map((destination, index) => (
                <Reveal
                  {...revealMotion}
                  delay={index * 0.11}
                  key={destination.title}
                >
                  <article className="elevation-low h-full rounded border border-white/15 bg-white/5 p-6 backdrop-blur-sm">
                    <span className="flex items-start justify-between gap-4">
                      <NativeLink
                        className="[--link:var(--color-sea-serpent)]"
                        href={destination.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {destination.title}
                      </NativeLink>
                      <span
                        aria-hidden
                        className={cn(
                          'text-xl',
                          destination.color === 'cyan' && 'text-sea-serpent',
                          destination.color === 'green' && 'text-sea-green',
                          destination.color === 'mustard' && 'text-mustard',
                          destination.color === 'pink' && 'text-paradise-pink',
                        )}
                      >
                        ↗
                      </span>
                    </span>
                    <span className="mt-3 block text-sm text-white/60">
                      {destination.detail}
                    </span>
                  </article>
                </Reveal>
              ))}
            </div>
            <Reveal {...revealMotion}>
              <Paragraph
                emphasis="muted"
                className="mt-12 max-w-4xl text-white/70"
              >
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
        </section>
      </main>
      <Footer />
    </>
  );
}

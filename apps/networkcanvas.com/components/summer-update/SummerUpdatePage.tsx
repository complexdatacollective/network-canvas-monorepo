'use client';

import { ExternalLink } from 'lucide-react';
import { motion, useReducedMotion, useScroll } from 'motion/react';
import Image from 'next/image';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import NetworkWeaveBackground from '@codaco/art/NetworkWeaveBackground';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Definition from '@codaco/fresco-ui/Definition';
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
  | 'sea-green'
  | 'sea-serpent';

const accentBackgroundClasses: Record<AccentColor, string> = {
  'cerulean-blue': 'bg-cerulean-blue',
  'kiwi': 'bg-kiwi',
  'mustard': 'bg-mustard',
  'neon-carrot': 'bg-neon-carrot',
  'neon-coral': 'bg-neon-coral',
  'paradise-pink': 'bg-paradise-pink',
  'sea-green': 'bg-sea-green',
  'sea-serpent': 'bg-sea-serpent',
};
const accentSoftBackgroundClasses: Record<AccentColor, string> = {
  'cerulean-blue': 'bg-cerulean-blue/15',
  'kiwi': 'bg-kiwi/15',
  'mustard': 'bg-mustard/15',
  'neon-carrot': 'bg-neon-carrot/15',
  'neon-coral': 'bg-neon-coral/15',
  'paradise-pink': 'bg-paradise-pink/15',
  'sea-green': 'bg-sea-green/15',
  'sea-serpent': 'bg-sea-serpent/15',
};
const accentTextClasses: Record<AccentColor, string> = {
  'cerulean-blue': 'text-cerulean-blue',
  'kiwi': 'text-kiwi',
  'mustard': 'text-mustard',
  'neon-carrot': 'text-neon-carrot',
  'neon-coral': 'text-neon-coral',
  'paradise-pink': 'text-paradise-pink',
  'sea-green': 'text-sea-green',
  'sea-serpent': 'text-sea-serpent',
};
const heroWeaveColors = [
  'var(--color-neon-coral)',
  'var(--color-mustard)',
  'var(--color-sea-green)',
  'var(--color-sea-serpent)',
  'var(--color-cerulean-blue)',
] as const;
const heroTextGlowClasses =
  'bg-[conic-gradient(from_var(--text-glow-angle),var(--color-neon-coral),var(--color-sea-serpent),var(--color-mustard),var(--color-sea-green),var(--color-neon-coral))] bg-clip-text';
const defaultHeroWeaveConvergence = { x: 0.5, y: 0.5 };

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

const Section = forwardRef<
  HTMLElement,
  { children: ReactNode } & React.HTMLAttributes<HTMLElement>
>(({ children, className, ...rest }, ref) => (
  <section ref={ref} className={cn('relative my-24', className)} {...rest}>
    {children}
  </section>
));

Section.displayName = 'Section';

function HeroEntrance({
  bar,
  children,
  className,
  delay,
  direction = 'up',
  onAnimationComplete,
}: {
  bar?: boolean;
  children?: ReactNode;
  className?: string;
  delay: number;
  direction?: 'down' | 'up';
  onAnimationComplete?: () => void;
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
      onAnimationComplete={onAnimationComplete}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-monospace text-slate-blue inline-flex items-center gap-3 text-xs leading-relaxed font-semibold tracking-widest uppercase">
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
  target,
}: {
  children: ReactNode;
  compact?: boolean;
  href: string;
  secondary?: boolean;
  target?: string;
}) {
  return (
    <ButtonLink
      external
      href={href}
      color={secondary ? 'dynamic' : 'success'}
      size={compact ? 'md' : 'lg'}
      textStyle={secondary ? 'uppercase' : undefined}
      variant={secondary ? 'outline' : 'raised'}
      target={target}
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
  icon: 'blue' | 'cyan' | 'green' | 'coral' | 'mustard';
  title: string;
}) {
  const iconClass = {
    blue: 'border-cerulean-blue/35 bg-cerulean-blue/10',
    cyan: 'border-sea-serpent/35 bg-sea-serpent/10',
    green: 'border-sea-green/35 bg-sea-green/10',
    coral: 'border-neon-coral/35 bg-neon-coral/10',
    mustard: 'border-mustard/35 bg-mustard/10',
  }[icon];
  const iconDotClass = {
    blue: 'bg-cerulean-blue',
    cyan: 'bg-sea-serpent',
    green: 'bg-sea-green',
    coral: 'bg-neon-coral',
    mustard: 'bg-mustard',
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
        <Heading level="h3" className="text-text">
          {title}
        </Heading>
        <Paragraph className="text-text/75">{children}</Paragraph>
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
          <span className="">{item.content}</span>
        </li>
      ))}
    </ul>
  );
}

function ScreenshotFrame({
  address,
  alt,
  aspect = 'standard',
  crop = 'none',
  fit = 'cover',
  src,
}: {
  address: string;
  alt: string;
  aspect?: 'standard' | 'photo';
  crop?: 'none' | 'architect' | 'interviewer';
  fit?: 'contain' | 'cover';
  src: string;
}) {
  return (
    <div className="elevation-medium overflow-hidden rounded bg-white">
      <div
        className="border-navy-taupe/10 flex items-center gap-2 border-b px-4 py-3"
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
          'relative overflow-hidden bg-white',
          aspect === 'standard' && 'aspect-4/3',
          aspect === 'photo' && 'aspect-3/2',
        )}
      >
        <Image
          fill
          src={src}
          alt={alt}
          sizes="(min-width: 801px) 50vw, 100vw"
          className={cn(
            fit === 'cover' ? 'object-cover' : 'object-contain',
            crop === 'none' && 'object-top',
            crop === 'architect' && 'origin-top scale-135 object-top',
            crop === 'interviewer' && '-translate-y-2 scale-110 object-center',
          )}
        />
      </div>
    </div>
  );
}

function DestinationCard({
  destination,
  index,
}: {
  destination: (typeof destinationLinks)[number];
  index: number;
}) {
  return (
    <Surface
      as="article"
      noContainer
      spacing="lg"
      shadow="sm"
      className="group border-text/15 bg-surface-1 hover:elevation-medium relative flex h-full flex-col overflow-hidden border transition hover:-translate-y-1"
    >
      <div className="flex items-start justify-between gap-6">
        <span
          aria-hidden
          className={cn(
            'flex size-14 items-center justify-center rounded-sm',
            accentSoftBackgroundClasses[destination.color],
          )}
        >
          <Image
            src={destination.icon}
            alt=""
            width={40}
            height={40}
            className="rounded-xs"
          />
        </span>
        <span className="font-monospace text-text/35 text-xs tracking-widest">
          {String(index + 1).padStart(2, '0')} / 04
        </span>
      </div>
      <div className="mt-8 flex flex-1 flex-col">
        <span
          className={cn(
            'font-monospace text-xs font-semibold tracking-widest uppercase',
            accentTextClasses[destination.color],
          )}
        >
          {destination.category}
        </span>
        <div className="mb-4">
          <Heading level="h3" variant="subheading" margin="none">
            <NativeLink
              className="[--link:var(--color-text)]"
              href={destination.href}
              target="_blank"
              rel="noreferrer"
            >
              {destination.title}
            </NativeLink>
          </Heading>
        </div>
        <Paragraph intent="smallText" emphasis="muted">
          {destination.description}
        </Paragraph>
        <div className="border-text/10 mt-auto flex items-center justify-between gap-4 border-t pt-5">
          <span className="font-monospace text-text/55 truncate text-xs">
            {destination.detail}
          </span>
          <ExternalLink
            aria-hidden
            className={cn(
              'size-4 shrink-0 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1',
              accentTextClasses[destination.color],
            )}
          />
        </div>
      </div>
    </Surface>
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
    unsupported: 'bg-neon-coral/10 text-slate-blue font-semibold-dark',
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
  const shouldReduceMotion = useReducedMotion();
  const [selectedInterface, setSelectedInterface] = useState(0);
  const [selectedCompatibilityRow, setSelectedCompatibilityRow] = useState<
    number | null
  >(null);
  const [heroWeaveConvergence, setHeroWeaveConvergence] = useState(
    defaultHeroWeaveConvergence,
  );
  const heroRef = useRef<HTMLElement>(null);
  const heroFocalTextRef = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll();
  const updateHeroWeaveConvergence = useCallback(() => {
    const hero = heroRef.current;
    const focalText = heroFocalTextRef.current;

    if (!hero || !focalText) {
      return;
    }

    const heroBounds = hero.getBoundingClientRect();
    const focalTextBounds = focalText.getBoundingClientRect();

    if (heroBounds.width === 0 || heroBounds.height === 0) {
      return;
    }

    const nextConvergence = {
      x: clampUnit(
        (focalTextBounds.left + focalTextBounds.width / 2 - heroBounds.left) /
          heroBounds.width,
      ),
      y: clampUnit(
        (focalTextBounds.top + focalTextBounds.height / 2 - heroBounds.top) /
          heroBounds.height,
      ),
    };

    setHeroWeaveConvergence((currentConvergence) =>
      Math.abs(currentConvergence.x - nextConvergence.x) < 0.001 &&
      Math.abs(currentConvergence.y - nextConvergence.y) < 0.001
        ? currentConvergence
        : nextConvergence,
    );
  }, []);

  useEffect(() => {
    updateHeroWeaveConvergence();
    window.addEventListener('resize', updateHeroWeaveConvergence);

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(updateHeroWeaveConvergence);

    if (heroRef.current) {
      resizeObserver?.observe(heroRef.current);
    }

    if (heroFocalTextRef.current) {
      resizeObserver?.observe(heroFocalTextRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateHeroWeaveConvergence);
      resizeObserver?.disconnect();
    };
  }, [updateHeroWeaveConvergence]);

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
      <main className="selection:bg-mustard selection:text-rich-black">
        <motion.div
          aria-hidden
          className="from-neon-coral via-mustard to-sea-green fixed inset-x-0 top-0 z-50 h-1 w-full origin-left rounded-r-full bg-linear-to-r"
          style={{ scaleX: scrollYProgress }}
        />

        <Section
          ref={heroRef}
          className="m-0! flex min-h-svh flex-col overflow-hidden"
          aria-labelledby="summer-update-title"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden
          >
            <NetworkWeaveBackground
              seed="summer-2026-update"
              complexity={28}
              strands={5}
              convergence={heroWeaveConvergence}
              colors={heroWeaveColors}
              backgroundColor="transparent"
              intensity={0.5}
              flare={1.4}
              blendMode="normal"
              speedFactor={0.5}
              className="block h-full w-full"
            />
          </div>
          <HeroEntrance delay={0.05} direction="down">
            <Header className="relative z-20" containerClassName="py-6!" />
          </HeroEntrance>

          <div className="tablet-portrait:pt-24 tablet-portrait:pb-48 relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-6 pt-16 pb-40 text-center">
            <HeroEntrance
              delay={0.32}
              onAnimationComplete={updateHeroWeaveConvergence}
            >
              <Heading
                level="h1"
                variant="display-heading"
                className="text-text"
                id="summer-update-title"
              >
                Introducing the next generation of{' '}
                <span
                  ref={heroFocalTextRef}
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
                Canvas interviews — here is what is changing, what is new, and
                what it means for your work.
              </Paragraph>
            </HeroEntrance>
          </div>

          <HeroEntrance
            delay={1.1}
            className="font-monospace text-text/55 absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 text-xs tracking-widest uppercase"
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
          <div className="mx-auto max-w-6xl px-6">
            <Reveal {...revealMotion}>
              <SectionLabel>01 — What’s new</SectionLabel>
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
          <div className="phone-landscape:grid-cols-2 desktop:grid-cols-4 mx-auto my-12 grid max-w-380 grid-cols-1 gap-6 px-6">
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

          <Reveal {...revealMotion}>
            <Alert variant="info" className="mx-auto my-12! max-w-6xl">
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

          <div>
            <Heading
              level="h2"
              margin="none"
              className="sr-only"
              id="meet-apps-title"
            >
              Meet the apps
            </Heading>
            <div className="tablet-portrait:space-y-32 mx-auto max-w-6xl space-y-24">
              <div className="tablet-portrait:grid-cols-2 tablet-portrait:gap-14 grid grid-cols-1 items-center gap-10">
                <Reveal {...revealMotion} direction="left">
                  <div className="flex items-center gap-4">
                    <Image
                      src="/images/summer-2026/architect-icon.png"
                      alt="Architect app icon"
                      width={54}
                      height={54}
                      className="rounded-sm"
                    />
                    <span className="font-monospace text-slate-blue text-xs font-semibold tracking-widest uppercase">
                      02 — Protocol design
                    </span>
                  </div>
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
                          have an icon you can click to open them, they have
                          their own storage, and they work offline.
                        </>
                      }
                    >
                      PWA
                    </Definition>{' '}
                    for a native-like experience and local control over your
                    data.
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
                        content:
                          'Opens and automatically upgrades older Schema 7 protocols',
                      },
                      {
                        color: 'neon-carrot',
                        content:
                          'Includes domain-specific protocol templates, designed to help you get started quickly and avoid common mistakes',
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
                    className="text-text/55 mt-6"
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
                    crop="architect"
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
                    <span className="font-monospace text-slate-blue text-xs font-semibold tracking-widest uppercase">
                      02 — Face-to-face interviews
                    </span>
                  </div>
                  <Heading
                    level="h3"
                    variant="subheading"
                    className="text-text"
                  >
                    Interviewer — conduct interviews anywhere
                  </Heading>
                  <Paragraph className="">
                    Interviewer has also been redesigned for the browser: upload
                    a protocol at{' '}
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
                          have an icon you can click to open them, they have
                          their own storage, and they work offline.
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
                            migrates all existing Schema 7 protocols
                            automatically when you import them
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
                    className="text-text/55 mt-6"
                  >
                    Interviewer Classic remains available for in-progress
                    studies. Like Architect Classic, it is in maintenance mode
                    only, and does not benefit from new features.
                  </Paragraph>
                </Reveal>

                <Reveal
                  {...revealMotion}
                  direction="left"
                  className="tablet-portrait:order-1"
                >
                  <ScreenshotFrame
                    aspect="photo"
                    address="interviewer.networkcanvas.com"
                    alt="Interviewer dashboard showing protocol cards and a resume interview action"
                    crop="interviewer"
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
                    <span className="font-monospace text-slate-blue text-xs font-semibold tracking-widest uppercase">
                      02 — Remote self-administered interviews
                    </span>
                  </div>
                  <Heading
                    level="h3"
                    variant="subheading"
                    className="text-text"
                  >
                    Fresco 4.0.0 — a significant upgrade
                  </Heading>
                  <Paragraph className="">
                    The latest version of Fresco is a huge release, bringing
                    several significant new features. Designed to support remote
                    self-administered interviews (but completely compatible with
                    face-to-face interviewing too), Fresco is the suggested
                    choice for studies with large numbers of participants, a
                    large team of researchers, or that require a centralised
                    data management solution.
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
                    className="text-text/55 mt-6"
                  >
                    Users of Fresco 3.x should avoid upgrading in the middle of
                    a study. Fresco 4.0.0 cannot be downgraded to 3.x.
                  </Paragraph>
                </Reveal>

                <div className="space-y-4">
                  <FeatureCard
                    title="Multi-user access"
                    color="neon-coral"
                    delay={0}
                  >
                    Multi-user support – Each team member gets their own
                    account, with two-factor authentication, passkey support,
                    and a full audit log of all actions taken in the system.
                  </FeatureCard>
                  <FeatureCard
                    title="Two-factor authentication"
                    color="sea-serpent"
                    delay={0.11}
                  >
                    Access data via a secure API – Fresco now provides a REST
                    API for programmatic access to your study data, enabling
                    realtime reporting, dashboards, and analytics.
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
          </div>
        </Section>
        <Section aria-labelledby="schema-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel>03 — Schema 8</SectionLabel>
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
                className="text-text/70 max-w-3xl"
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
                use the new tools. Tap each one to explore.
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
                    className="focusable border-text/15 bg-surface-1 hover:bg-surface-2 aria-pressed:border-sea-serpent aria-pressed:bg-sea-serpent/15 aria-pressed:text-text flex h-full w-full flex-col items-center justify-center gap-3 rounded-sm border p-5 text-center transition"
                    onClick={() => setSelectedInterface(index)}
                  >
                    <InterfaceGraphic motif={feature.motif} />
                    <div className="text-sm leading-snug font-bold">
                      {feature.shortName}
                    </div>
                  </button>
                </Reveal>
              ))}
            </div>

            <Reveal {...revealMotion}>
              <div
                className="bg-surface-1 border-text/15 tablet-portrait:p-8 mt-8 rounded border p-6"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Heading
                    level="h3"
                    variant="subheading"
                    margin="none"
                    className="text-text"
                  >
                    {activeInterface.name}
                  </Heading>
                  <span className="bg-sea-green/15 font-monospace text-sea-green rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    {activeInterface.tag}
                  </span>
                </div>
                <Paragraph emphasis="muted" className="text-text/70 max-w-3xl">
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
                        className="text-text/70 max-w-4xl"
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
              </div>
            </Reveal>
          </div>
        </Section>

        <Section aria-labelledby="compatibility-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel>04 — Compatibility</SectionLabel>
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

            <Reveal {...revealMotion} direction="zoom">
              <div className="elevation-low border-text/15 bg-surface-1 my-12 overflow-hidden rounded border">
                <div className="overflow-x-auto">
                  <div className="min-w-4xl">
                    <div
                      className="border-text/15 bg-surface-2 font-monospace text-text/60 grid grid-cols-4 gap-4 border-b px-6 py-4 text-xs font-bold tracking-widest uppercase"
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
                                'bg-surface-2 font-monospace text-text/55 px-6 py-2 text-xs font-bold tracking-widest uppercase',
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
                                <span className="font-monospace text-text/50 text-xs font-normal">
                                  {row.version}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-text/65 text-sm">
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
                  className="border-text/15 bg-sea-serpent/10 text-text/75 border-t px-6 py-4 text-sm"
                  aria-live="polite"
                >
                  {compatibilityNote}
                </div>
              </div>
            </Reveal>

            <Reveal {...revealMotion} direction="zoom">
              <Surface className="tablet-portrait:grid-cols-2 my-12 grid grid-cols-1 items-center gap-10">
                <div>
                  <Heading
                    level="h3"
                    variant="subheading"
                    className="text-text"
                  >
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
                <div className="flex flex-col items-center gap-5" aria-hidden>
                  <div className="flex items-center justify-center gap-5">
                    <div className="border-text/25 grid size-24 place-items-center rounded-full border-2 text-center">
                      <span>
                        <strong className="block text-3xl">7</strong>
                        <span className="font-monospace text-text/50 text-xs tracking-widest">
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
                  <div className="font-monospace text-slate-blue text-xs font-semibold tracking-wide">
                    ← ✗ No return path
                  </div>
                </div>
              </Surface>
            </Reveal>
          </div>
          <div className="relative z-10 mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel>05 — Should you upgrade?</SectionLabel>
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
              <Reveal {...revealMotion}>
                <Surface
                  as="article"
                  noContainer
                  spacing="lg"
                  shadow="sm"
                  className="h-full"
                >
                  <span className="bg-sea-green/15 font-monospace text-sea-green inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    Starting a new study
                  </span>
                  <Heading
                    level="h3"
                    variant="subheading"
                    className="text-text"
                  >
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
              <Reveal {...revealMotion} delay={0.11}>
                <Surface
                  as="article"
                  noContainer
                  spacing="lg"
                  shadow="sm"
                  className="h-full"
                >
                  <span className="bg-sea-serpent/15 font-monospace text-sea-serpent inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase">
                    Running an ongoing study
                  </span>
                  <Heading
                    level="h3"
                    variant="subheading"
                    className="text-text"
                  >
                    There is no rush
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
            <Reveal {...revealMotion}>
              <SectionLabel>06 — Project resources</SectionLabel>
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
            <div className="tablet-landscape:grid-cols-2 mt-12 grid grid-cols-1 gap-6">
              <Reveal {...revealMotion} direction="left">
                <Surface
                  as="article"
                  noContainer
                  spacing="xl"
                  shadow="sm"
                  className="flex h-full flex-col"
                >
                  <div className="max-w-3xl">
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
                      Explore the documentation{' '}
                      <ExternalLink className="inline-block size-4" />
                    </NativeLink>
                  </div>
                  <div className="mt-auto pt-8">
                    <ScreenshotFrame
                      address="documentation.networkcanvas.com"
                      alt="The redesigned Network Canvas documentation homepage"
                      fit="contain"
                      src="/images/summer-2026/documentation-homepage.jpg"
                    />
                  </div>
                </Surface>
              </Reveal>
              <Reveal {...revealMotion} direction="right" delay={0.11}>
                <Surface
                  as="article"
                  noContainer
                  spacing="xl"
                  shadow="sm"
                  className="flex h-full flex-col"
                >
                  <div className="max-w-3xl">
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
                      Explore the new website{' '}
                      <ExternalLink className="inline-block size-4" />
                    </NativeLink>
                  </div>
                  <div className="mt-auto pt-8">
                    <ScreenshotFrame
                      address="networkcanvas.com"
                      alt="The redesigned Network Canvas website homepage"
                      fit="contain"
                      src="/images/summer-2026/website-homepage.jpg"
                    />
                  </div>
                </Surface>
              </Reveal>
            </div>
          </div>
        </Section>

        <Section aria-labelledby="getting-started-title">
          <div className="mx-auto max-w-6xl">
            <Reveal {...revealMotion}>
              <SectionLabel>07 — Getting started</SectionLabel>
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
                  {...revealMotion}
                  delay={index * 0.11}
                  key={destination.title}
                >
                  <DestinationCard destination={destination} index={index} />
                </Reveal>
              ))}
            </div>
            <Reveal {...revealMotion}>
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
